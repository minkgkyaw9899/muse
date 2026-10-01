/** Installed only by bench-publication-batch.sh, never shipped as an app route. */
import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Text } from 'react-native';

import {
  createExpoPublicationFileStore,
  createSQLitePublicationRepository,
} from '@/features/library/expo-publication-adapters';
import {
  createPublicationLibrary,
  type PickedPublication,
} from '@/features/library/publication-library';
import { createMupdfDocumentRenderer } from '@/features/reader/mupdf-document-renderer';

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const fixtures = ['valid-2-pages.pdf', 'scan-100p-150mb.pdf', 'pages-100k.pdf'];
type Measurement = {
  mode: 'sequential' | 'batch';
  iteration: number;
  start: number;
  end: number;
  totalMs: number;
  maxActive: number;
  pages: number[];
  bytes: number[];
};

async function benchmark() {
  const report = new File(Paths.document, 'batch-import-benchmark.json');
  const measurements: Measurement[] = [];
  const write = (state: string, error?: string) =>
    report.write(JSON.stringify({ state, error, fixtures, measurements }));
  write('ready');
  await pause(3000);
  try {
    const repository = createSQLitePublicationRepository();
    await repository.initialize();
    const database = await SQLite.openDatabaseAsync('muse-library.db');
    for (const mode of ['sequential', 'batch'] as const) {
      for (let iteration = 1; iteration <= 3; iteration++) {
        await database.runAsync('DELETE FROM publications');
        const fileStore = createExpoPublicationFileStore();
        await fileStore.reconcile([]);
        const sources: PickedPublication[] = fixtures.map((name) => {
          const input = new File(Paths.document, 'benchmark-inputs', name);
          return { uri: input.uri, name, size: input.size, dispose: async () => {} };
        });
        let next = 0;
        let active = 0;
        let id = 0;
        const row: Measurement = {
          mode,
          iteration,
          start: 0,
          end: 0,
          totalMs: 0,
          maxActive: 0,
          pages: [],
          bytes: sources.map((source) => source.size ?? 0),
        };
        const library = createPublicationLibrary({
          picker: { pickOne: async () => sources[next++] ?? null, pickMany: async () => sources },
          fileStore: {
            ...fileStore,
            stage: async (...args) => {
              active += 1;
              row.maxActive = Math.max(row.maxActive, active);
              return fileStore.stage(...args);
            },
          },
          renderer: createMupdfDocumentRenderer(),
          repository,
          clock: { now: () => new Date() },
          ids: { next: () => `${mode}-${iteration}-${++id}` },
        });
        await library.list();
        await pause(1000);
        row.start = Date.now();
        const start = performance.now();
        if (mode === 'sequential') {
          for (const _ of fixtures) {
            const result = await library.importOne();
            active -= 1;
            if (result.status !== 'imported') throw new Error('Sequential import failed');
            row.pages.push(result.publication.pageCount);
          }
        } else {
          const result = await library.importMany({
            onProgress: (event) => {
              if (event.file) active -= 1;
            },
          });
          if (result.status !== 'completed') throw new Error('Batch import failed');
          for (const file of result.results) {
            if (file.result.status !== 'imported') throw new Error('Batch file failed');
            row.pages.push(file.result.publication.pageCount);
          }
        }
        row.totalMs = performance.now() - start;
        row.end = Date.now();
        if (
          (await library.list()).length !== 3 ||
          new Directory(Paths.document, 'publications').list().length !== 3 ||
          new Directory(Paths.document, 'staging').list().length !== 0
        )
          throw new Error('Ownership check failed');
        measurements.push(row);
        write('running');
      }
    }
    await database.closeAsync();
    write('complete');
  } catch {
    write('failed', 'Batch import benchmark failed');
  }
}

export default function PublicationBatchBenchmark() {
  const [state, setState] = useState('Measuring batch import');
  useEffect(() => {
    benchmark().then(() => setState('Benchmark finished'));
  }, []);
  return <Text>{state}</Text>;
}
