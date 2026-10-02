import type { NativePublicationImport } from '../../../modules/publication-import/src/PublicationImportModule';
import {
  LibraryAdapterError,
  type PickedPublication,
  type PublicationLibraryDependencies,
} from './publication-library';

export const NATIVE_PUBLICATION_SOURCE_PREFIX = 'muse-import://';

export function createNativePublicationPicker(
  native: NativePublicationImport,
): PublicationLibraryDependencies['picker'] {
  async function pick(multiple: boolean): Promise<PickedPublication[]> {
    const result = await native.pick(multiple);
    if (result.status === 'error') throw new LibraryAdapterError(result.category);
    if (result.status === 'cancelled') return [];
    return result.sources.map((source) => ({
      uri: `${NATIVE_PUBLICATION_SOURCE_PREFIX}${source.id}`,
      name: source.name,
      mimeType: 'application/pdf',
      dispose: async () => native.release(source.id),
    }));
  }
  return {
    pickOne: async () => (await pick(false))[0] ?? null,
    pickMany: () => pick(true),
  };
}

export async function copyNativePublicationSource(
  native: NativePublicationImport,
  source: PickedPublication,
  operationId: string,
  signal?: AbortSignal,
) {
  if (signal?.aborted) throw new LibraryAdapterError('cancelled');
  const sourceId = source.uri.slice(NATIVE_PUBLICATION_SOURCE_PREFIX.length);
  const cancel = () => native.cancel(sourceId);
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const result = await native.copy(sourceId, operationId);
    if (result.status === 'error') throw new LibraryAdapterError(result.category);
    // Return owned staging even after a late abort so the Library can remove it deterministically.
    return { uri: result.uri, relativePath: result.relativePath, byteSize: result.byteSize };
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}
