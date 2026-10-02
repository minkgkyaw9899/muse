import type { FileImportResult, ImportResult } from '@/features/library/publication-library';

/** Explain each file's outcome without implying that a duplicate was imported again. */
export function describeImportResult(result: ImportResult): string {
  switch (result.status) {
    case 'imported':
      return `${result.publication.title} was imported.`;
    case 'duplicate':
      return 'Already in Library. Your existing publication is unchanged.';
    case 'cancelled':
      return 'Cancelled. This file was not imported.';
    case 'error':
      return result.error.message;
  }
}

export type ImportSummary = { kind: 'success' | 'error'; message: string };

const pdfs = (count: number) => (count === 1 ? '1 PDF' : `${count} PDFs`);

/**
 * One toast for a finished batch. Cancelled files are ignored (only an unmount cancels), and a
 * batch with nothing settled, such as a dismissed picker, has nothing to report.
 */
export function summarizeImport(results: FileImportResult[]): ImportSummary | null {
  const settled = results.filter((file) => file.result.status !== 'cancelled');
  if (settled.length === 0) return null;
  if (settled.length === 1) {
    const { result } = settled[0];
    return {
      kind: result.status === 'error' ? 'error' : 'success',
      message: describeImportResult(result),
    };
  }

  const failures = settled.flatMap((file) =>
    file.result.status === 'error' ? [file.result.error.message] : [],
  );
  const imported = settled.filter((file) => file.result.status === 'imported').length;
  const duplicates = settled.filter((file) => file.result.status === 'duplicate').length;
  const failed = failures.length;

  if (failed === settled.length) {
    return { kind: 'error', message: `${pdfs(failed)} could not be imported. ${failures[0]}` };
  }
  if (duplicates === settled.length) {
    return {
      kind: 'success',
      message: `${pdfs(duplicates)} already in Library. Your existing publications are unchanged.`,
    };
  }
  if (imported === settled.length)
    return { kind: 'success', message: `Imported ${pdfs(imported)}.` };

  const counts = [
    imported ? `Imported ${imported}` : null,
    duplicates ? `${duplicates} already in Library` : null,
    failed ? `${failed} failed` : null,
  ]
    .filter(Boolean)
    .join(', ');
  return failed
    ? { kind: 'error', message: `${counts}. ${failures[0]}` }
    : { kind: 'success', message: `${counts}.` };
}
