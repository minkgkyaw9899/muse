import type { DocumentRenderer, RendererErrorCategory } from '@/domain/document-renderer';
import { createPublicationLibrary, type Publication } from '@/features/library/publication-library';

const picked = {
  uri: 'file:///picker/Field%20Notes.pdf',
  name: 'Field Notes.pdf',
  mimeType: 'application/pdf',
  size: 1024,
};

function createAdapters() {
  const rows = new Map<string, Publication>();
  const files = new Set<string>();
  const released: string[] = [];
  return {
    rows,
    files,
    released,
    picker: {
      pickMany: async () => [],
      pickOne: async () => ({
        ...picked,
        dispose: async () => {
          released.push(picked.uri);
        },
      }),
    },
    fileStore: {
      stage: async () => {
        files.add('staging/import-1.pdf');
        return {
          uri: 'file:///app/staging/import-1.pdf',
          relativePath: 'staging/import-1.pdf',
          byteSize: 1024,
        };
      },
      promote: async () => {
        files.delete('staging/import-1.pdf');
        files.add('publications/publication-1.pdf');
        return {
          uri: 'file:///app/publications/publication-1.pdf',
          relativePath: 'publications/publication-1.pdf',
        };
      },
      remove: async (path: string) => {
        files.delete(path);
      },
      reconcile: async (keep: readonly string[]) => {
        for (const path of files) if (!keep.includes(path)) files.delete(path);
      },
    },
    repository: {
      initialize: async () => {},
      list: async () => [...rows.values()],
      findByFingerprint: async (fingerprint: string) =>
        [...rows.values()].find((row) => row.fingerprint === fingerprint) ?? null,
      insert: async (row: Publication) => {
        rows.set(row.id, row);
      },
      setFavorite: async (id: string, isFavorite: boolean) => {
        const publication = rows.get(id);
        if (!publication) return null;
        const saved = { ...publication, isFavorite };
        rows.set(id, saved);
        return saved;
      },
    },
    renderer: {
      inspect: async ({ uri }: { uri: string }) => {
        if (uri !== 'file:///app/staging/import-1.pdf') {
          return {
            ok: false as const,
            error: { category: 'internal' as const, code: 'wrong_path', message: '' },
          };
        }
        return {
          ok: true as const,
          inspection: { pageCount: 2, fingerprint: 'a'.repeat(64) },
        };
      },
      cancel: () => {},
    },
    clock: { now: () => new Date('2026-09-30T02:00:00.000Z') },
    ids: { next: () => 'publication-1' },
  };
}

describe('PublicationLibrary', () => {
  it('keeps concurrent favorite choices in request order when the first durable write is slow', async () => {
    const adapters = createAdapters();
    const library = createPublicationLibrary(adapters);
    await library.importOne();
    const save = adapters.repository.setFavorite;
    let finishFirst!: () => void;
    const choices: boolean[] = [];
    adapters.repository.setFavorite = async (id, isFavorite) => {
      choices.push(isFavorite);
      if (choices.length === 1) {
        await new Promise<void>((resolve) => {
          finishFirst = resolve;
        });
      }
      return save(id, isFavorite);
    };
    const first = library.setFavorite('publication-1', true);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const second = library.setFavorite('publication-1', false);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    finishFirst();
    await expect(first).resolves.toMatchObject({
      status: 'saved',
      publication: { isFavorite: true },
    });
    await expect(second).resolves.toMatchObject({
      status: 'saved',
      publication: { isFavorite: false },
    });
    expect(await library.list()).toEqual([expect.objectContaining({ isFavorite: false })]);
  });

  it('keeps durable favorite state and gives safe recovery guidance when writes fail', async () => {
    const adapters = createAdapters();
    const library = createPublicationLibrary(adapters);
    await library.importOne();
    await library.setFavorite('publication-1', true);
    const changed = jest.fn();
    library.subscribe(changed);
    adapters.repository.setFavorite = async () => {
      throw new Error('private path file:///reader/Notes.pdf');
    };
    await expect(library.setFavorite('publication-1', false)).resolves.toEqual({
      status: 'error',
      error: {
        category: 'storage',
        message: 'Muse could not save this favorite. Please try again.',
      },
    });
    expect(await createPublicationLibrary(adapters).list()).toEqual([
      expect.objectContaining({ isFavorite: true }),
    ]);
    expect(changed).not.toHaveBeenCalled();
  });

  it('reports a missing publication without creating a favorite or publishing a change', async () => {
    const adapters = createAdapters();
    const library = createPublicationLibrary(adapters);
    const changed = jest.fn();
    library.subscribe(changed);
    await expect(library.setFavorite('missing', true)).resolves.toEqual({
      status: 'error',
      error: { category: 'notFound', message: 'This publication is no longer in your Library.' },
    });
    expect(await library.list()).toEqual([]);
    expect(changed).not.toHaveBeenCalled();
  });

  it('publishes new imports after metadata commits while duplicates retain the saved favorite', async () => {
    const adapters = createAdapters();
    const library = createPublicationLibrary(adapters);
    const snapshots: Promise<Publication[]>[] = [];
    library.subscribe(() => {
      throw new Error('Disposed screen');
    });
    library.subscribe(() => {
      snapshots.push(library.list());
    });
    const imported = await library.importOne();
    expect(imported.status).toBe('imported');
    expect(await Promise.all(snapshots)).toEqual([
      [expect.objectContaining({ id: 'publication-1', isFavorite: false })],
    ]);
    await library.setFavorite('publication-1', true);
    expect(await library.importOne()).toMatchObject({
      status: 'duplicate',
      publication: { id: 'publication-1', isFavorite: true },
    });
    expect(snapshots).toHaveLength(2);
  });

  it('notifies observers only after favorite writes commit and isolates disposed observers', async () => {
    const adapters = createAdapters();
    const library = createPublicationLibrary(adapters);
    await library.importOne();
    const snapshots: Promise<Publication[]>[] = [];
    library.subscribe(() => {
      throw new Error('Disposed screen');
    });
    const unsubscribe = library.subscribe(() => {
      snapshots.push(library.list());
    });
    const save = adapters.repository.setFavorite;
    let finish!: () => void;
    adapters.repository.setFavorite = async (...args) => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return save(...args);
    };
    const pending = library.setFavorite('publication-1', true);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(snapshots).toEqual([]);
    finish();
    await expect(pending).resolves.toMatchObject({
      status: 'saved',
      publication: { isFavorite: true },
    });
    expect(await Promise.all(snapshots)).toEqual([[expect.objectContaining({ isFavorite: true })]]);

    unsubscribe();
    adapters.repository.setFavorite = save;
    await library.setFavorite('publication-1', false);
    expect(snapshots).toHaveLength(1);
    expect(await createPublicationLibrary(adapters).list()).toEqual([
      expect.objectContaining({ isFavorite: false }),
    ]);
  });

  it('persists a publication favorite independently of reading metadata after relaunch', async () => {
    const adapters = createAdapters();
    const library = createPublicationLibrary(adapters);
    const imported = await library.importOne();
    expect(imported).toMatchObject({ status: 'imported', publication: { isFavorite: false } });
    if (imported.status !== 'imported') throw new Error('Expected import to succeed');

    expect(await library.setFavorite(imported.publication.id, true)).toEqual({
      status: 'saved',
      publication: { ...imported.publication, isFavorite: true },
    });
    expect(await createPublicationLibrary(adapters).list()).toEqual([
      { ...imported.publication, isFavorite: true },
    ]);
  });

  it('imports an app-owned PDF and lists its durable metadata after relaunch', async () => {
    const adapters = createAdapters();
    const library = createPublicationLibrary(adapters);

    const result = await library.importOne();

    expect(result).toMatchObject({
      status: 'imported',
      publication: {
        id: 'publication-1',
        title: 'Field Notes',
        sourceFilename: 'Field Notes.pdf',
        byteSize: 1024,
        pageCount: 2,
        importedAt: '2026-09-30T02:00:00.000Z',
        fingerprint: 'a'.repeat(64),
        ownedPath: 'publications/publication-1.pdf',
      },
    });
    expect(adapters.files).toEqual(new Set(['publications/publication-1.pdf']));
    expect(adapters.released).toEqual([picked.uri]);

    if (result.status !== 'imported') throw new Error('Expected import to succeed');
    const afterRelaunch = createPublicationLibrary(adapters);
    expect(await afterRelaunch.list()).toEqual([result.publication]);
  });
});

describe('duplicate admission and cleanup', () => {
  it('returns the existing publication for an identical PDF without retaining a second copy', async () => {
    const adapters = createAdapters();
    const library = createPublicationLibrary(adapters);
    const first = await library.importOne();
    const second = await library.importOne();

    expect(first.status).toBe('imported');
    expect(second).toMatchObject({ status: 'duplicate', publication: { id: 'publication-1' } });
    expect(await library.list()).toHaveLength(1);
    expect(adapters.files).toEqual(new Set(['publications/publication-1.pdf']));
    expect(adapters.released).toEqual([picked.uri, picked.uri]);
  });

  it('reports a storage failure and lets the next launch clean a file left by failed compensation', async () => {
    const adapters = createAdapters();
    adapters.repository.insert = async () => {
      throw new Error('database full');
    };
    adapters.fileStore.remove = async () => {
      throw new Error('delete failed');
    };
    const library = createPublicationLibrary(adapters);

    await expect(library.importOne()).resolves.toMatchObject({
      status: 'error',
      error: { category: 'storage' },
    });
    expect(await library.list()).toEqual([]);

    const recovered = createPublicationLibrary(adapters);
    expect(await recovered.list()).toEqual([]);
    expect(adapters.files.size).toBe(0);
  });
});

describe('import failures', () => {
  it('explains unavailable PDF support without suggesting a different file will fix it', async () => {
    const adapters = createAdapters();
    const renderer: DocumentRenderer = {
      inspect: async () => ({
        ok: false,
        error: {
          category: 'internal',
          code: 'renderer_unavailable',
          message: 'Reading PDFs is not available in this build of Muse.',
        },
      }),
      cancel: () => {},
    };
    const library = createPublicationLibrary({ ...adapters, renderer });
    expect(await library.importOne()).toMatchObject({
      status: 'error',
      error: {
        message:
          'This version of Muse cannot import PDFs. Update Muse to a version with PDF support.',
      },
    });
    expect(await library.list()).toEqual([]);
    expect(adapters.files.size).toBe(0);
  });

  it.each([
    ['passwordRequired', 'Choose an unlocked PDF to import.'],
    ['corrupt', 'Choose another copy of this PDF to import.'],
    ['unsupported', 'Choose a supported PDF file to import.'],
  ] as const)(
    'gives a recovery action for %s and releases all temporary files',
    async (category, recovery) => {
      const adapters = createAdapters();
      const renderer: DocumentRenderer = {
        inspect: async () => ({
          ok: false,
          error: {
            category: category as RendererErrorCategory,
            code: 'rejected',
            message: 'Cannot inspect.',
          },
        }),
        cancel: () => {},
      };
      const library = createPublicationLibrary({ ...adapters, renderer });
      expect(await library.importOne()).toMatchObject({
        status: 'error',
        error: { category, message: expect.stringContaining(recovery) },
      });
      expect(await library.list()).toEqual([]);
      expect(adapters.files.size).toBe(0);
      expect(adapters.released).toEqual([picked.uri]);
    },
  );

  it('explains a picker permission failure without listing a publication', async () => {
    const adapters = createAdapters();
    adapters.picker.pickOne = async () => {
      throw { category: 'permissionDenied' };
    };
    const library = createPublicationLibrary(adapters);

    expect(await library.importOne()).toMatchObject({
      status: 'error',
      error: { category: 'permissionDenied' },
    });
    expect(await library.list()).toEqual([]);
    expect(adapters.files.size).toBe(0);
  });
});

describe('untrusted picker metadata', () => {
  it('imports an inspected PDF with an extensionless provider name', async () => {
    const adapters = createAdapters();
    adapters.picker.pickOne = async () => ({
      ...picked,
      name: 'Field Notes',
      dispose: async () => {},
    });
    const library = createPublicationLibrary(adapters);

    expect(await library.importOne()).toMatchObject({
      status: 'imported',
      publication: { title: 'Field Notes', sourceFilename: 'Field Notes' },
    });
    expect(await library.list()).toHaveLength(1);
  });

  it('trims provider whitespace before removing the PDF suffix from the displayed title', async () => {
    const adapters = createAdapters();
    adapters.picker.pickOne = async () => ({
      ...picked,
      name: '  Field Notes.PDF  ',
      dispose: async () => {},
    });
    const result = await createPublicationLibrary(adapters).importOne();

    expect(result).toMatchObject({
      status: 'imported',
      publication: { title: 'Field Notes', sourceFilename: '  Field Notes.PDF  ' },
    });
  });

  it('stores the copied file size instead of trusting the picker-reported size', async () => {
    const adapters = createAdapters();
    adapters.fileStore.stage = async () => {
      adapters.files.add('staging/import-1.pdf');
      return {
        uri: 'file:///app/staging/import-1.pdf',
        relativePath: 'staging/import-1.pdf',
        byteSize: 2048,
      };
    };

    const result = await createPublicationLibrary(adapters).importOne();
    expect(result).toMatchObject({ status: 'imported', publication: { byteSize: 2048 } });
  });
});

it('treats a unique-fingerprint insert race as a duplicate and removes its own copy', async () => {
  const adapters = createAdapters();
  const concurrent: Publication = {
    id: 'from-another-import',
    title: 'Field Notes',
    sourceFilename: 'Field Notes.pdf',
    byteSize: 1024,
    pageCount: 2,
    fingerprint: 'a'.repeat(64),
    importedAt: '2026-09-30T01:00:00.000Z',
    lastOpenedAt: null,
    readingPosition: null,
    isFavorite: true,
    ownedPath: 'publications/from-another-import.pdf',
  };
  adapters.repository.insert = async () => {
    adapters.rows.set(concurrent.id, concurrent);
    adapters.files.add(concurrent.ownedPath);
    throw new Error('UNIQUE constraint failed: publications.fingerprint');
  };
  const result = await createPublicationLibrary(adapters).importOne();

  expect(result).toMatchObject({ status: 'duplicate', publication: { id: concurrent.id } });
  expect(adapters.files).toEqual(new Set([concurrent.ownedPath]));
});

it('cancels after promotion without committing metadata or leaving an owned source', async () => {
  const adapters = createAdapters();
  const abort = new AbortController();
  adapters.fileStore.promote = async () => {
    adapters.files.delete('staging/import-1.pdf');
    adapters.files.add('publications/publication-1.pdf');
    abort.abort();
    return {
      uri: 'file:///app/publications/publication-1.pdf',
      relativePath: 'publications/publication-1.pdf',
    };
  };

  const result = await createPublicationLibrary(adapters).importOne({ signal: abort.signal });
  expect(result).toEqual({ status: 'cancelled' });
  expect(adapters.rows.size).toBe(0);
  expect(adapters.files.size).toBe(0);
});

it('keeps the owned source when a database insert reports failure after committing', async () => {
  const adapters = createAdapters();
  adapters.repository.insert = async (publication) => {
    adapters.rows.set(publication.id, publication);
    throw new Error('connection lost after commit');
  };

  const result = await createPublicationLibrary(adapters).importOne();
  expect(result).toMatchObject({ status: 'imported', publication: { id: 'publication-1' } });
  expect(adapters.files).toEqual(new Set(['publications/publication-1.pdf']));
  expect(adapters.rows.size).toBe(1);
});

it('does not delete a possibly committed source when database state cannot be checked', async () => {
  const adapters = createAdapters();
  let lookupCount = 0;
  adapters.repository.findByFingerprint = async () => {
    lookupCount += 1;
    if (lookupCount === 1) return null;
    throw new Error('database unavailable');
  };
  adapters.repository.insert = async (publication) => {
    adapters.rows.set(publication.id, publication);
    throw new Error('connection lost after commit');
  };

  const result = await createPublicationLibrary(adapters).importOne();
  expect(result).toMatchObject({ status: 'error', error: { category: 'storage' } });
  expect(adapters.files).toEqual(new Set(['publications/publication-1.pdf']));

  const recovered = createPublicationLibrary(adapters);
  expect(await recovered.list()).toHaveLength(1);
  expect(adapters.files).toEqual(new Set(['publications/publication-1.pdf']));
});
