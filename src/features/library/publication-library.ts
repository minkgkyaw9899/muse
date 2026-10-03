import type {
  DocumentRenderer,
  InspectionResult,
  RendererErrorCategory,
} from '@/domain/document-renderer';

export type Publication = {
  id: string;
  title: string;
  sourceFilename: string;
  byteSize: number;
  pageCount: number;
  fingerprint: string;
  importedAt: string;
  lastOpenedAt: string | null;
  readingPosition: null;
  isFavorite: boolean;
  /** Path relative to Muse's owned publication directory. Never a picker URL. */
  ownedPath: string;
};

export type ImportResult =
  | { status: 'imported'; publication: Publication }
  | { status: 'duplicate'; publication: Publication }
  | { status: 'cancelled' }
  | {
      status: 'error';
      error: {
        category: RendererErrorCategory | 'permissionDenied' | 'storage' | 'busy' | 'unavailable';
        message: string;
      };
    };

export type FavoriteChangeResult =
  | { status: 'saved'; publication: Publication }
  | { status: 'error'; error: { category: 'storage' | 'notFound'; message: string } };

export type PickedPublication = {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
  /** Releases temporary selection ownership; never deletes the provider's original. */
  dispose(): Promise<void>;
};

type OwnedFile = { uri: string; relativePath: string; byteSize?: number };

export type PublicationLibraryDependencies = {
  picker: {
    pickOne(): Promise<PickedPublication | null>;
    pickMany(): Promise<PickedPublication[]>;
  };
  fileStore: {
    stage(
      source: PickedPublication,
      operationId: string,
      signal?: AbortSignal,
    ): Promise<Required<OwnedFile>>;
    promote(staged: Required<OwnedFile>, publicationId: string): Promise<OwnedFile>;
    remove(relativePath: string): Promise<void>;
    reconcile(referencedPaths: readonly string[]): Promise<void>;
  };
  repository: {
    initialize(): Promise<void>;
    list(): Promise<Publication[]>;
    findByFingerprint(fingerprint: string): Promise<Publication | null>;
    insert(publication: Publication): Promise<void>;
    /** Atomically saves and returns committed metadata; null means the publication is absent. */
    setFavorite(id: string, isFavorite: boolean): Promise<Publication | null>;
  };
  renderer: DocumentRenderer;
  clock: { now(): Date };
  ids: { next(): string };
};

export type FileImportResult = {
  /** Selection index keeps equal filenames distinguishable and results in picker order. */
  index: number;
  sourceFilename: string;
  result: ImportResult;
};

export type ImportProgress = {
  completed: number;
  total: number;
  /** Present only after this file's outcome and cleanup have settled. */
  file?: FileImportResult;
};

export type BatchImportResult =
  | { status: 'completed' | 'cancelled'; results: FileImportResult[] }
  | Extract<ImportResult, { status: 'error' }>;

export type PublicationLibrary = {
  list(): Promise<Publication[]>;
  /** Resolves only after the choice is durable; failures contain safe reader-facing guidance. */
  setFavorite(id: string, isFavorite: boolean): Promise<FavoriteChangeResult>;
  /** Observes committed import and favorite writes. The returned function removes the observer. */
  subscribe(listener: () => void): () => void;
  importOne(options?: { signal?: AbortSignal }): Promise<ImportResult>;
  importMany(options?: {
    signal?: AbortSignal;
    onProgress?: (progress: ImportProgress) => void;
  }): Promise<BatchImportResult>;
};

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024 * 1024;
/** Files copied, inspected and admitted at once; bounds aggregate memory and I/O. */
export const MAX_ACTIVE_IMPORTS = 2;

const inspectionMessages: Record<Exclude<RendererErrorCategory, 'cancelled'>, string> = {
  passwordRequired: 'This PDF is password protected. Choose an unlocked PDF to import.',
  corrupt: 'This PDF is damaged. Choose another copy of this PDF to import.',
  unsupported: 'Muse cannot read this format. Choose a supported PDF file to import.',
  resourceLimit: 'This PDF exceeds the import limit. Choose a smaller PDF to import.',
  internal: 'Muse could not inspect this PDF. Try again or choose another PDF.',
};

export type LibraryAdapterErrorCategory =
  | 'permissionDenied'
  | 'resourceLimit'
  | 'cancelled'
  | 'storage'
  | 'unavailable';

/** Adapters report a safe category; their native exception text never crosses the Library seam. */
export class LibraryAdapterError extends Error {
  constructor(readonly category: LibraryAdapterErrorCategory) {
    super(category);
  }
}

function adapterFailure(error: unknown): ImportResult {
  const category =
    error instanceof LibraryAdapterError ||
    (typeof error === 'object' && error !== null && 'category' in error)
      ? (error as { category: unknown }).category
      : 'storage';
  if (category === 'cancelled') return { status: 'cancelled' };
  if (category === 'unavailable') {
    return {
      status: 'error',
      error: {
        category,
        message:
          'This version of Muse cannot import PDFs. Update Muse to a version with PDF support.',
      },
    };
  }
  if (category === 'permissionDenied') {
    return {
      status: 'error',
      error: { category, message: 'Muse could not access this file. Choose it again in Files.' },
    };
  }
  if (category === 'resourceLimit') {
    return {
      status: 'error',
      error: { category, message: inspectionMessages.resourceLimit },
    };
  }
  return {
    status: 'error',
    error: {
      category: 'storage',
      message: 'Muse could not import this PDF. Check available storage and try again.',
    },
  };
}

function displayTitle(filename: string): string {
  return (
    filename
      .trim()
      .replace(/\.pdf$/i, '')
      .trim() || 'Untitled publication'
  );
}

/** One application-facing seam. Picker, file ownership, renderer, and metadata writes stay inside. */
export function createPublicationLibrary({
  picker,
  fileStore,
  repository,
  renderer,
  clock,
  ids,
}: PublicationLibraryDependencies): PublicationLibrary {
  let ready: Promise<void> | null = null;
  let importing = false;
  let admission = Promise.resolve();
  const listeners = new Set<() => void>();

  function publishChange(): void {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // Observers cannot change a committed publication's outcome.
      }
    }
  }

  async function acquireMetadataWrite(): Promise<() => void> {
    const previous = admission;
    let release!: () => void;
    admission = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    return release;
  }

  function ensureReady(): Promise<void> {
    if (!ready) {
      ready = (async () => {
        await repository.initialize();
        const publications = await repository.list();
        await fileStore.reconcile(publications.map((publication) => publication.ownedPath));
      })().catch((error: unknown) => {
        ready = null;
        throw error;
      });
    }
    return ready;
  }

  function busy(): Extract<ImportResult, { status: 'error' }> {
    return {
      status: 'error',
      error: { category: 'busy', message: 'An import is already in progress.' },
    };
  }

  async function importSelected(
    selected: PickedPublication,
    options?: { signal?: AbortSignal },
  ): Promise<ImportResult> {
    const pending: {
      selected?: PickedPublication;
      staged?: Required<OwnedFile>;
      promoted?: OwnedFile;
    } = {};
    const result: ImportResult = await (async (): Promise<ImportResult> => {
      try {
        pending.selected = selected;
        if (options?.signal?.aborted) return { status: 'cancelled' };
        if (selected.size !== undefined && selected.size > MAX_IMPORT_BYTES) {
          return {
            status: 'error',
            error: {
              category: 'resourceLimit',
              message: inspectionMessages.resourceLimit,
            },
          };
        }
        const id = ids.next();
        const operationId = `import-${id}`;
        pending.staged = await fileStore.stage(selected, operationId, options?.signal);
        if (options?.signal?.aborted) return { status: 'cancelled' };
        const cancel = () => renderer.cancel(operationId);
        options?.signal?.addEventListener('abort', cancel, { once: true });
        if (options?.signal?.aborted) cancel();
        let inspection: InspectionResult;
        try {
          inspection = await renderer.inspect({
            uri: pending.staged.uri,
            operationId,
            limits: { maxBytes: MAX_IMPORT_BYTES },
          });
        } finally {
          options?.signal?.removeEventListener('abort', cancel);
        }
        if (options?.signal?.aborted) return { status: 'cancelled' };
        if (!inspection.ok) {
          if (inspection.error.category === 'cancelled') return { status: 'cancelled' };
          return {
            status: 'error',
            error: {
              category: inspection.error.category,
              message:
                inspection.error.code === 'renderer_unavailable'
                  ? 'This version of Muse cannot import PDFs. Update Muse to a version with PDF support.'
                  : inspection.error.code === 'too_many_operations'
                    ? 'Muse is busy with other PDFs. Wait a moment and try again.'
                    : inspectionMessages[inspection.error.category],
            },
          };
        }
        const release = await acquireMetadataWrite();
        try {
          if (options?.signal?.aborted) return { status: 'cancelled' };
          const existing = await repository.findByFingerprint(inspection.inspection.fingerprint);
          if (existing) return { status: 'duplicate', publication: existing };
          const copiedByteSize = pending.staged.byteSize;
          pending.promoted = await fileStore.promote(pending.staged, id);
          pending.staged = undefined;
          if (options?.signal?.aborted) return { status: 'cancelled' };
          const publication: Publication = {
            id,
            title: displayTitle(selected.name),
            sourceFilename: selected.name,
            byteSize: copiedByteSize,
            pageCount: inspection.inspection.pageCount,
            fingerprint: inspection.inspection.fingerprint,
            importedAt: clock.now().toISOString(),
            lastOpenedAt: null,
            readingPosition: null,
            isFavorite: false,
            ownedPath: pending.promoted.relativePath,
          };
          try {
            await repository.insert(publication);
          } catch (error) {
            let concurrent: Publication | null;
            try {
              concurrent = await repository.findByFingerprint(publication.fingerprint);
            } catch {
              // The insert might have committed; retain its source until startup reconciliation.
              pending.promoted = undefined;
              throw error;
            }
            if (
              concurrent?.id === publication.id &&
              concurrent.ownedPath === publication.ownedPath
            ) {
              pending.promoted = undefined;
              publishChange();
              return { status: 'imported', publication: concurrent };
            }
            if (concurrent) return { status: 'duplicate', publication: concurrent };
            throw error;
          }
          pending.promoted = undefined;
          publishChange();
          return { status: 'imported', publication };
        } finally {
          release();
        }
      } catch (error) {
        return adapterFailure(error);
      }
    })();
    let cleanupFailed = false;
    for (const file of [pending.staged, pending.promoted]) {
      if (!file) continue;
      try {
        await fileStore.remove(file.relativePath);
      } catch {
        cleanupFailed = true;
      }
    }
    if (pending.selected) {
      try {
        await pending.selected.dispose();
      } catch {
        // Cache cleanup is retried at startup; a committed publication remains valid.
      }
    }
    if (cleanupFailed) {
      return {
        status: 'error',
        error: {
          category: 'storage',
          message: 'Muse could not finish cleaning up this import. Please try again.',
        },
      };
    }
    return result;
  }

  return {
    async list() {
      await ensureReady();
      return repository.list();
    },
    async setFavorite(id, isFavorite) {
      const release = await acquireMetadataWrite();
      try {
        await ensureReady();
        const publication = await repository.setFavorite(id, isFavorite);
        if (!publication) {
          return {
            status: 'error',
            error: {
              category: 'notFound',
              message: 'This publication is no longer in your Library.',
            },
          };
        }
        publishChange();
        return { status: 'saved', publication };
      } catch {
        return {
          status: 'error',
          error: {
            category: 'storage',
            message: 'Muse could not save this favorite. Please try again.',
          },
        };
      } finally {
        release();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async importOne(options) {
      if (importing) return busy();
      importing = true;
      try {
        if (options?.signal?.aborted) return { status: 'cancelled' };
        await ensureReady();
        if (options?.signal?.aborted) return { status: 'cancelled' };
        const selected = await picker.pickOne();
        return selected ? await importSelected(selected, options) : { status: 'cancelled' };
      } catch (error) {
        return adapterFailure(error);
      } finally {
        importing = false;
      }
    },
    async importMany(options) {
      if (importing) return busy();
      importing = true;
      try {
        if (options?.signal?.aborted) return { status: 'cancelled', results: [] };
        await ensureReady();
        if (options?.signal?.aborted) return { status: 'cancelled', results: [] };
        const selected = await picker.pickMany();
        const results: FileImportResult[] = new Array(selected.length);
        let next = 0;
        let completed = 0;
        const publish = (file?: FileImportResult) => {
          try {
            options?.onProgress?.({ completed, total: selected.length, file });
          } catch {
            // A caller observing progress cannot change a durable import's outcome.
          }
        };
        publish();
        async function worker() {
          while (next < selected.length) {
            const index = next++;
            const source = selected[index];
            const file = {
              index,
              sourceFilename: source.name,
              result: await importSelected(source, options),
            };
            results[index] = file;
            completed += 1;
            publish(file);
          }
        }
        await Promise.all(
          Array.from({ length: Math.min(MAX_ACTIVE_IMPORTS, selected.length) }, worker),
        );
        return {
          // An abort that lands after every file settled does not retroactively cancel the batch.
          status:
            selected.length === 0 || results.some((file) => file.result.status === 'cancelled')
              ? 'cancelled'
              : 'completed',
          results,
        };
      } catch (error) {
        const failure = adapterFailure(error);
        return failure.status === 'error' ? failure : { status: 'cancelled', results: [] };
      } finally {
        importing = false;
      }
    },
  };
}
