import type { DocumentRenderer, InspectionResult } from '@/domain/document-renderer';
import { isRendererErrorCode, rendererError } from '@/domain/renderer-errors';

/** What the local Expo module `mupdf-renderer` must expose. Replies are plain values, never thrown. */
export type NativeRendererModule = {
  inspectAsync(uri: string, operationId: string, maxBytes: number | null): Promise<unknown>;
  cancel(operationId: string): void;
};

/** The native module rejects ids of 96 bytes or more; refuse them here so nothing is truncated. */
const MAX_OPERATION_ID_LENGTH = 95;

const SAFE_CODE = /^[a-z0-9_]{1,64}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

/** Codes the native module may send; the adapter's own failure codes are excluded. */
const NATIVE_CODES = new Set([
  'pdf_corrupt',
  'pdf_encrypted',
  'pdf_unsupported',
  'file_too_large',
  'too_many_operations',
  'cancelled',
  'file_missing',
  'io_error',
  'renderer_unavailable',
  'invalid_request',
]);

function failure(code: Parameters<typeof rendererError>[0]): InspectionResult {
  return { ok: false, error: rendererError(code) };
}

function toResult(reply: unknown): InspectionResult {
  if (typeof reply !== 'object' || reply === null) return failure('invalid_native_response');
  const value = reply as Record<string, unknown>;

  if (value.status === 'ok') {
    const { pageCount, fingerprint } = value;
    if (
      typeof pageCount === 'number' &&
      Number.isInteger(pageCount) &&
      pageCount > 0 &&
      typeof fingerprint === 'string' &&
      SHA256_HEX.test(fingerprint)
    ) {
      return { ok: true, inspection: { pageCount, fingerprint } };
    }
    return failure('invalid_native_response');
  }

  if (value.status === 'error') {
    const code = value.code;
    if (typeof code !== 'string' || !SAFE_CODE.test(code)) return failure('invalid_native_code');
    if (!NATIVE_CODES.has(code) || !isRendererErrorCode(code))
      return failure('unmapped_native_code');
    return failure(code);
  }

  return failure('invalid_native_response');
}

/**
 * Adapts the native module to the DocumentRenderer seam and enforces its error contract.
 * Operation ids must be unique per operation. Cancellation is forwarded only for operations that
 * are still running, so the native side never holds a cancel for an id that will not come back.
 */
export function createNativeDocumentRenderer(native: NativeRendererModule): DocumentRenderer {
  const inFlight = new Set<string>();

  return {
    async inspect({ uri, operationId, limits }) {
      const maxBytes = limits?.maxBytes;
      const validId = operationId.length > 0 && operationId.length <= MAX_OPERATION_ID_LENGTH;
      const validLimit =
        maxBytes === undefined || (Number.isSafeInteger(maxBytes) && maxBytes >= 0);
      if (!validId || !validLimit || inFlight.has(operationId)) return failure('invalid_request');

      inFlight.add(operationId);
      try {
        return toResult(await native.inspectAsync(uri, operationId, maxBytes ?? null));
      } catch {
        // The thrown message may contain a path or content, so it is dropped.
        return failure('native_exception');
      } finally {
        inFlight.delete(operationId);
      }
    },
    cancel(operationId) {
      if (inFlight.has(operationId)) native.cancel(operationId);
    },
  };
}
