import {
  copyNativePublicationSource,
  createNativePublicationPicker,
} from '@/features/library/native-publication-import';
import { LibraryAdapterError } from '@/features/library/publication-library';
import type { NativePublicationImport } from '../../modules/publication-import/src/PublicationImportModule';

function provider(): NativePublicationImport {
  const released = new Set<string>();
  const cancelled = new Set<string>();
  return {
    pick: async () => ({
      status: 'selected',
      sources: [
        { id: 'one', name: 'publication.pdf' },
        { id: 'two', name: 'publication.pdf' },
      ],
    }),
    copy: async (id, operationId) => {
      if (released.has(id)) return { status: 'error', category: 'permissionDenied' };
      if (cancelled.has(id)) return { status: 'error', category: 'cancelled' };
      return {
        status: 'copied',
        uri: `file:///owned/staging/${operationId}.pdf`,
        relativePath: `staging/${operationId}.pdf`,
        byteSize: 26,
      };
    },
    release: (id) => {
      released.add(id);
    },
    cancel: (id) => {
      cancelled.add(id);
    },
  };
}

test('selected publications retain independent ownership and become owned staging files', async () => {
  const native = provider();
  const selected = await createNativePublicationPicker(native).pickMany();
  expect(selected.map((source) => source.name)).toEqual(['publication.pdf', 'publication.pdf']);
  expect(selected[0].uri).not.toBe(selected[1].uri);
  await expect(copyNativePublicationSource(native, selected[0], 'first')).resolves.toEqual({
    uri: 'file:///owned/staging/first.pdf',
    relativePath: 'staging/first.pdf',
    byteSize: 26,
  });
  await selected[0].dispose();
  await expect(copyNativePublicationSource(native, selected[0], 'released')).rejects.toEqual(
    new LibraryAdapterError('permissionDenied'),
  );
  await expect(copyNativePublicationSource(native, selected[1], 'second')).resolves.toMatchObject({
    relativePath: 'staging/second.pdf',
  });
});

test('cancellation settles an active native copy and the listener stops after settlement', async () => {
  const native = provider();
  let complete!: (value: Awaited<ReturnType<NativePublicationImport['copy']>>) => void;
  native.copy = () =>
    new Promise((resolve) => {
      complete = resolve;
    });
  native.cancel = () => complete({ status: 'error', category: 'cancelled' });
  const source = await createNativePublicationPicker(native).pickOne();
  if (!source) throw new Error('Expected a selected publication');
  const abort = new AbortController();
  const copying = copyNativePublicationSource(native, source, 'copying', abort.signal);
  abort.abort();
  await expect(copying).rejects.toEqual(new LibraryAdapterError('cancelled'));

  const reusableProvider = provider();
  const reusable = await createNativePublicationPicker(reusableProvider).pickOne();
  if (!reusable) throw new Error('Expected a selected publication');
  const lateAbort = new AbortController();
  await copyNativePublicationSource(reusableProvider, reusable, 'completed', lateAbort.signal);
  lateAbort.abort();
  await expect(
    copyNativePublicationSource(reusableProvider, reusable, 'next'),
  ).resolves.toMatchObject({
    relativePath: 'staging/next.pdf',
  });
});

test('an already-cancelled import does not wait for a native copy', async () => {
  const native = provider();
  native.copy = () => new Promise(() => {});
  const source = await createNativePublicationPicker(native).pickOne();
  if (!source) throw new Error('Expected a selected publication');
  const abort = new AbortController();
  abort.abort();
  await expect(
    copyNativePublicationSource(native, source, 'cancelled', abort.signal),
  ).rejects.toEqual(new LibraryAdapterError('cancelled'));
});
