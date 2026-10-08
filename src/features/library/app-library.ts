import { createExpoPublicationLibrary } from './expo-publication-adapters';
import type { PublicationLibrary } from './publication-library';

let appLibrary: PublicationLibrary | null = null;

/**
 * One Library per app process. Startup reconciliation deletes unreferenced files, so a second
 * instance created while an import is staging could remove that import's active file.
 */
export function getAppLibrary(): PublicationLibrary {
  appLibrary ??= createExpoPublicationLibrary();
  return appLibrary;
}

/** Test builds install their adapters before any route renders so every route shares them. */
export function installAppLibrary(library: PublicationLibrary): void {
  appLibrary = library;
}
