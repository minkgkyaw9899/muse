/** Installed only by build-ios-e2e.sh: records native copy stage timings for profiling. */
import { File, Paths } from 'expo-file-system';

import { installAppLibrary } from '@/features/library/app-library';
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
const copyMeasurements: {
  fixture: string;
  native: boolean;
  bytes: number;
  start: number;
  end: number;
  copyMs: number;
}[] = [];

const library = createPublicationLibrary({
  picker: createExpoPublicationPicker(),
  repository: createSQLitePublicationRepository(),
  renderer: createMupdfDocumentRenderer(),
  clock: { now: () => new Date() },
  ids: { next: () => `e2e-${Date.now().toString(36)}-${++nextId}` },
  fileStore: {
    ...files,
    async stage(source, operationId, signal) {
      const start = Date.now();
      const timer = performance.now();
      const staged = await files.stage(source, operationId, signal);
      const end = Date.now();
      const copyMs = performance.now() - timer;
      copyMeasurements.push({
        fixture: source.name,
        native: source.uri.startsWith('muse-import://'),
        bytes: staged.byteSize,
        start,
        end,
        copyMs,
      });
      // Test-only stage timings let host RSS samples be matched to the copy window.
      try {
        new File(Paths.document, 'e2e-provider-copy.json').write(JSON.stringify(copyMeasurements));
      } catch {
        // Measurement failure must not hide the owned path from Library cleanup.
        // The profiling script separately rejects missing/incomplete measurements.
      }
      return staged;
    },
  },
});

// The Search route resolves the app Library too; sharing this instance keeps one reconciler alive.
installAppLibrary(library);

export default function LibraryE2E() {
  return <LibraryScreen />;
}
