import { requireOptionalNativeModule } from 'expo';

import type { DocumentRenderer } from '@/domain/document-renderer';
import { rendererError } from '@/domain/renderer-errors';
import {
  createNativeDocumentRenderer,
  type NativeRendererModule,
} from './native-document-renderer';

const UNAVAILABLE = { ok: false, error: rendererError('renderer_unavailable') } as const;

/**
 * The renderer backed by the local `mupdf-renderer` Expo module. Builds that do not link the module
 * (preview and production until ADR 0001 accepts a licensing path) get a renderer that reports
 * `renderer_unavailable` instead of crashing.
 */
export function createMupdfDocumentRenderer(
  loadNativeModule: () => NativeRendererModule | null = () =>
    requireOptionalNativeModule<NativeRendererModule>('MupdfRenderer'),
): DocumentRenderer {
  const native = loadNativeModule();
  if (!native) {
    return { inspect: async () => UNAVAILABLE, cancel: () => {} };
  }
  return createNativeDocumentRenderer(native);
}
