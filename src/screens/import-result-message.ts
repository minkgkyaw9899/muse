import type { ImportResult } from '@/features/library/publication-library';

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
