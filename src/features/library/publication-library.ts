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
        category: RendererErrorCategory | 'permissionDenied' | 'storage' | 'busy';
        message: string;
      };
    };

export type PickedPublication = {
  uri: string;
  name: string;
  mimeType?: string;
  size?: number;
  /** Releases the picker's temporary copy; never deletes the provider's original. */
  dispose(): Promise<void>;
};

type OwnedFile = { uri: string; relativePath: string; byteSize?: number };

export type PublicationLibraryDependencies = {
  picker: { pickOne(): Promise<PickedPublication | null> };
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
  };
  renderer: DocumentRenderer;
  clock: { now(): Date };
  ids: { next(): string };
};

export type PublicationLibrary = {
  list(): Promise<Publication[]>;
  importOne(options?: { signal?: AbortSignal }): Promise<ImportResult>;
};

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024 * 1024;

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
  | 'storage';

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

  return {
    async list() {
      await ensureReady();
      return repository.list();
    },
    async importOne(options) {
      if (importing) {
        return {
          status: 'error',
          error: { category: 'busy', message: 'An import is already in progress.' },
        };
      }
      importing = true;
      const pending: {
        selected?: PickedPublication;
        staged?: Required<OwnedFile>;
        promoted?: OwnedFile;
      } = {};
      const result: ImportResult = await (async (): Promise<ImportResult> => {
        try {
          await ensureReady();
          const selected = await picker.pickOne();
          if (!selected) return { status: 'cancelled' };
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
              return { status: 'imported', publication: concurrent };
            }
            if (concurrent) return { status: 'duplicate', publication: concurrent };
            throw error;
          }
          pending.promoted = undefined;
          return { status: 'imported', publication };
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
      importing = false;
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
    },
  };
}
