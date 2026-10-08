/** Installed only by bench-publication-import.sh, never shipped as an app route. */
import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import {
  createExpoPublicationFileStore,
  createSQLitePublicationRepository,
} from '@/features/library/expo-publication-adapters';
import { createPublicationLibrary } from '@/features/library/publication-library';
import { createMupdfDocumentRenderer } from '@/features/reader/mupdf-document-renderer';

type Measurement = {
  fixture: string;
  iteration: number;
  bytes: number;
  pages: number;
  start: number;
  end: number;
  copyMs: number;
  inspectMs: number;
  commitMs: number;
  totalMs: number;
};

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function benchmark() {
  const report = new File(Paths.document, 'import-benchmark.json');
  const measurements: Measurement[] = [];
  const write = (state: string, error?: string) =>
    report.write(JSON.stringify({ state, error, measurements }));
  write('ready');
  // Allow the host to attach the RSS sampler after simctl returns the process ID.
  await pause(3000);
  try {
    const repository = createSQLitePublicationRepository();
    await repository.initialize();
    const database = await SQLite.openDatabaseAsync('muse-library.db');
    for (const fixture of ['valid-2-pages.pdf', 'scan-100p-150mb.pdf', 'pages-100k.pdf']) {
      for (let iteration = 1; iteration <= 3; iteration++) {
        await database.runAsync('DELETE FROM publications');
        const fileStore = createExpoPublicationFileStore();
        await fileStore.reconcile([]);
        const renderer = createMupdfDocumentRenderer();
        const input = new File(Paths.document, 'benchmark-inputs', fixture);
        const row: Measurement = {
          fixture,
          iteration,
          bytes: input.size,
          pages: 0,
          start: 0,
          end: 0,
          copyMs: 0,
          inspectMs: 0,
          commitMs: 0,
          totalMs: 0,
        };
        const library = createPublicationLibrary({
          picker: {
            pickMany: async () => [],
            pickOne: async () => ({
              uri: input.uri,
              name: fixture,
              size: input.size,
              dispose: async () => {},
            }),
          },
          fileStore: {
            ...fileStore,
            stage: async (...args) => {
              const start = performance.now();
              const result = await fileStore.stage(...args);
              row.copyMs = performance.now() - start;
              return result;
            },
          },
          renderer: {
            ...renderer,
            inspect: async (request) => {
              const start = performance.now();
              const result = await renderer.inspect(request);
              row.inspectMs = performance.now() - start;
              return result;
            },
          },
          repository: {
            ...repository,
            insert: async (publication) => {
              const start = performance.now();
              await repository.insert(publication);
              row.commitMs = performance.now() - start;
            },
          },
          clock: { now: () => new Date() },
          ids: { next: () => `benchmark-${fixture.replace(/\.pdf$/, '')}-${iteration}` },
        });
        await library.list();
        await pause(1000);
        row.start = Date.now();
        const start = performance.now();
        const result = await library.importOne();
        row.totalMs = performance.now() - start;
        row.end = Date.now();
        if (result.status !== 'imported') throw new Error(`Unexpected outcome: ${result.status}`);
        row.pages = result.publication.pageCount;
        if (
          (await library.list()).length !== 1 ||
          new Directory(Paths.document, 'publications').list().length !== 1 ||
          new Directory(Paths.document, 'staging').list().length !== 0
        ) {
          throw new Error('Import ownership check failed');
        }
        measurements.push(row);
        write('running');
      }
    }
    await database.closeAsync();
    write('complete');
  } catch (error) {
    write('failed', error instanceof Error ? error.message : 'Benchmark failed');
  }
}

export default function PublicationImportBenchmark() {
  const [state, setState] = useState('Measuring publication import');
  useEffect(() => {
    benchmark().then(() => setState('Benchmark finished'));
  }, []);
  return <Text>{state}</Text>;
}
