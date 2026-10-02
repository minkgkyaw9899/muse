/** Installed only by build-ios-e2e.sh. Normal app routes never include this cancellation barrier. */
import {
  createExpoPublicationFileStore,
  createExpoPublicationPicker,
  createSQLitePublicationRepository,
} from '@/features/library/expo-publication-adapters';
import { createPublicationLibrary } from '@/features/library/publication-library';
import { createMupdfDocumentRenderer } from '@/features/reader/mupdf-document-renderer';
import { LibraryScreen } from '@/screens/library-screen';

const files = createExpoPublicationFileStore();
let nextId = 0;

function waitForCancellation(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    // Bound a broken test's wait. Expiry lets the import finish, so cancellation assertions fail.
    const timeout = setTimeout(finish, 180_000);
    signal?.addEventListener('abort', finish, { once: true });
  });
}

const library = createPublicationLibrary({
  picker: createExpoPublicationPicker(),
  repository: createSQLitePublicationRepository(),
  renderer: createMupdfDocumentRenderer(),
  clock: { now: () => new Date() },
  ids: { next: () => `e2e-${Date.now().toString(36)}-${++nextId}` },
  fileStore: {
    ...files,
    async stage(source, operationId, signal) {
      const staged = await files.stage(source, operationId, signal);
      if (source.name === 'Muse Large Fixture.pdf') await waitForCancellation(signal);
      return staged;
    },
  },
});

export default function LibraryE2E() {
  return <LibraryScreen library={library} />;
}
