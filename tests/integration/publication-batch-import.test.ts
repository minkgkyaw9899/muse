import {
  createPublicationLibrary,
  type PickedPublication,
  type Publication,
  type PublicationLibraryDependencies,
} from '@/features/library/publication-library';

function createBatchAdapters(names = ['Notes.pdf', 'Damaged.pdf', 'Notes copy.pdf']) {
  const rows = new Map<string, Publication>();
  const files = new Map<string, string>();
  const released = new Set<string>();
  let nextId = 0;
  const selected: PickedPublication[] = names.map((name) => ({
    uri: `file:///picker/${name}`,
    name,
    dispose: async () => {
      released.add(name);
    },
  }));
  const adapters: PublicationLibraryDependencies = {
    picker: { pickOne: async () => selected[0] ?? null, pickMany: async () => selected },
    fileStore: {
      stage: async (source, operationId) => {
        const relativePath = `staging/${operationId}.pdf`;
        files.set(relativePath, source.name);
        return { uri: relativePath, relativePath, byteSize: 269 };
      },
      promote: async (staged, id) => {
        const relativePath = `publications/${id}.pdf`;
        const name = files.get(staged.relativePath);
        if (!name) throw new Error('Missing staged source');
        files.set(relativePath, name);
        files.delete(staged.relativePath);
        return { uri: relativePath, relativePath };
      },
      remove: async (path) => {
        files.delete(path);
      },
      reconcile: async (keep) => {
        for (const path of files.keys()) if (!keep.includes(path)) files.delete(path);
      },
    },
    repository: {
      initialize: async () => {},
      list: async () => [...rows.values()],
      findByFingerprint: async (fingerprint) =>
        [...rows.values()].find((row) => row.fingerprint === fingerprint) ?? null,
      insert: async (row) => {
        if ([...rows.values()].some((saved) => saved.fingerprint === row.fingerprint)) {
          throw new Error('Unique fingerprint');
        }
        rows.set(row.id, row);
      },
    },
    renderer: {
      inspect: async ({ uri }) => {
        const name = files.get(uri);
        if (name === 'Damaged.pdf') {
          return { ok: false, error: { category: 'corrupt', code: 'damaged', message: '' } };
        }
        return { ok: true, inspection: { pageCount: 2, fingerprint: 'a'.repeat(64) } };
      },
      cancel: () => {},
    },
    clock: { now: () => new Date('2026-10-01T02:00:00.000Z') },
    ids: { next: () => `publication-${++nextId}` },
  };
  return { adapters, files, released, selected };
}

it('retains an independent result for each selection and durable successes after mixed outcomes', async () => {
  const { adapters, files, released } = createBatchAdapters();
  const library = createPublicationLibrary(adapters);
  const result = await library.importMany();

  expect(result).toMatchObject({
    status: 'completed',
    results: [
      { index: 0, sourceFilename: 'Notes.pdf', result: { status: 'imported' } },
      {
        index: 1,
        sourceFilename: 'Damaged.pdf',
        result: {
          status: 'error',
          error: { category: 'corrupt', message: expect.stringContaining('Choose another copy') },
        },
      },
      { index: 2, sourceFilename: 'Notes copy.pdf', result: { status: 'duplicate' } },
    ],
  });
  expect(await library.list()).toHaveLength(1);
  expect(await createPublicationLibrary(adapters).list()).toHaveLength(1);
  expect([...files.keys()]).toEqual(['publications/publication-1.pdf']);
  expect(released).toEqual(new Set(['Notes.pdf', 'Damaged.pdf', 'Notes copy.pdf']));
});

it('keeps two files active while queued selections wait and publishes completed-file progress', async () => {
  const { adapters, files } = createBatchAdapters(['One.pdf', 'Two.pdf', 'Three.pdf', 'Four.pdf']);
  const active: string[] = [];
  const finish: (() => void)[] = [];
  const progress: { completed: number; total: number }[] = [];
  adapters.renderer.inspect = async ({ uri }) => {
    const name = files.get(uri) ?? '';
    active.push(name);
    if (active.length <= 2)
      await new Promise<void>((resolve) => {
        finish.push(resolve);
      });
    return { ok: true, inspection: { pageCount: 2, fingerprint: name } };
  };
  const importing = createPublicationLibrary(adapters).importMany({
    onProgress: (event) => {
      progress.push({ completed: event.completed, total: event.total });
    },
  });
  for (let i = 0; i < 30; i++) await Promise.resolve();
  expect(active).toEqual(['One.pdf', 'Two.pdf']);
  expect(progress).toEqual([{ completed: 0, total: 4 }]);
  for (const complete of finish) complete();
  const result = await importing;
  expect(result.status).toBe('completed');
  expect(progress.map((event) => event.completed)).toEqual([0, 1, 2, 3, 4]);
  expect(active).toEqual(['One.pdf', 'Two.pdf', 'Three.pdf', 'Four.pdf']);
});

it('admits simultaneous equal fingerprints once even while the durable write is pending', async () => {
  const { adapters, files } = createBatchAdapters(['Notes.pdf', 'Notes copy.pdf']);
  const insert = adapters.repository.insert;
  let writing = false;
  adapters.repository.insert = async (publication) => {
    if (writing) throw new Error('Another exclusive write is pending');
    writing = true;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await insert(publication);
    writing = false;
  };
  const library = createPublicationLibrary(adapters);
  const result = await library.importMany();
  expect(result).toMatchObject({
    status: 'completed',
    results: [{ result: { status: 'imported' } }, { result: { status: 'duplicate' } }],
  });
  expect(await library.list()).toHaveLength(1);
  expect([...files.keys()]).toEqual(['publications/publication-1.pdf']);
});

it('cancels active and queued files, suppresses stale failures, and keeps completed publications durable', async () => {
  const { adapters, files, released } = createBatchAdapters(['One.pdf', 'Two.pdf', 'Three.pdf']);
  const abort = new AbortController();
  let finishInspection: (() => void) | undefined;
  adapters.renderer = {
    inspect: async ({ uri }) => {
      if (files.get(uri) === 'Two.pdf') {
        await new Promise<void>((resolve) => {
          finishInspection = resolve;
        });
        return { ok: false, error: { category: 'corrupt', code: 'late_failure', message: '' } };
      }
      return { ok: true, inspection: { pageCount: 2, fingerprint: 'a'.repeat(64) } };
    },
    cancel: () => {
      finishInspection?.();
    },
  };
  const library = createPublicationLibrary(adapters);
  const result = await library.importMany({
    signal: abort.signal,
    onProgress: (event) => {
      if (event.file?.result.status === 'imported') abort.abort();
    },
  });
  expect(result).toMatchObject({
    status: 'cancelled',
    results: [
      { result: { status: 'imported' } },
      { result: { status: 'cancelled' } },
      { result: { status: 'cancelled' } },
    ],
  });
  expect(await createPublicationLibrary(adapters).list()).toHaveLength(1);
  expect([...files.keys()]).toEqual(['publications/publication-1.pdf']);
  expect(released).toEqual(new Set(['One.pdf', 'Two.pdf', 'Three.pdf']));
});

it('reports a batch as completed when an abort lands after every file already settled', async () => {
  const { adapters } = createBatchAdapters(['One.pdf']);
  adapters.renderer.inspect = async () => ({
    ok: true,
    inspection: { pageCount: 2, fingerprint: 'b'.repeat(64) },
  });
  const abort = new AbortController();
  const result = await createPublicationLibrary(adapters).importMany({
    signal: abort.signal,
    onProgress: (event) => {
      if (event.file) abort.abort();
    },
  });
  expect(result).toMatchObject({
    status: 'completed',
    results: [{ result: { status: 'imported' } }],
  });
});

it('isolates a failed durable write and allows later selections and a later batch to succeed', async () => {
  const { adapters, files, released } = createBatchAdapters(['One.pdf', 'Two.pdf', 'Three.pdf']);
  adapters.renderer.inspect = async ({ uri }) => ({
    ok: true,
    inspection: { pageCount: 2, fingerprint: files.get(uri) ?? '' },
  });
  const insert = adapters.repository.insert;
  adapters.repository.insert = async (publication) => {
    if (publication.sourceFilename === 'Two.pdf') throw new Error('Storage exhausted');
    await insert(publication);
  };
  const library = createPublicationLibrary(adapters);
  expect(await library.importMany()).toMatchObject({
    status: 'completed',
    results: [
      { result: { status: 'imported' } },
      { result: { status: 'error', error: { category: 'storage' } } },
      { result: { status: 'imported' } },
    ],
  });
  expect((await library.list()).map((row) => row.sourceFilename)).toEqual(['One.pdf', 'Three.pdf']);
  expect(files.size).toBe(2);
  expect([...files.keys()].every((path) => path.startsWith('publications/'))).toBe(true);
  expect(released.size).toBe(3);
  expect(await library.importMany()).toMatchObject({
    status: 'completed',
    results: [
      { result: { status: 'duplicate' } },
      { result: { status: 'error' } },
      { result: { status: 'duplicate' } },
    ],
  });
});

it('rejects overlapping picker requests and keeps progress observer exceptions out of import outcomes', async () => {
  const { adapters } = createBatchAdapters(['Notes.pdf']);
  let select!: (sources: PickedPublication[]) => void;
  const source = await adapters.picker.pickOne();
  if (!source) throw new Error('Expected source');
  adapters.picker.pickMany = () =>
    new Promise((resolve) => {
      select = resolve;
    });
  const library = createPublicationLibrary(adapters);
  const pending = library.importMany({
    onProgress: () => {
      throw new Error('Screen disposed');
    },
  });
  for (let i = 0; i < 30; i++) await Promise.resolve();
  expect(await library.importMany()).toMatchObject({
    status: 'error',
    error: { category: 'busy' },
  });
  expect(await library.importOne()).toMatchObject({ status: 'error', error: { category: 'busy' } });
  select([source]);
  expect(await pending).toMatchObject({
    status: 'completed',
    results: [{ result: { status: 'imported' } }],
  });
});

it('reports picker cancellation and permission failures without creating a publication', async () => {
  const { adapters, files } = createBatchAdapters([]);
  const library = createPublicationLibrary(adapters);
  expect(await library.importMany()).toEqual({ status: 'cancelled', results: [] });
  adapters.picker.pickMany = async () => {
    throw { category: 'permissionDenied' };
  };
  expect(await library.importMany()).toMatchObject({
    status: 'error',
    error: { category: 'permissionDenied' },
  });
  expect(await library.list()).toEqual([]);
  expect(files.size).toBe(0);
});

it('does not reopen Files when cancellation arrives during Library startup', async () => {
  const { adapters } = createBatchAdapters();
  const abort = new AbortController();
  let finishStartup!: () => void;
  adapters.repository.initialize = () =>
    new Promise((resolve) => {
      finishStartup = resolve;
    });
  adapters.picker.pickMany = async () => {
    throw { category: 'permissionDenied' };
  };
  const pending = createPublicationLibrary(adapters).importMany({ signal: abort.signal });
  abort.abort();
  finishStartup();
  expect(await pending).toEqual({ status: 'cancelled', results: [] });
});
