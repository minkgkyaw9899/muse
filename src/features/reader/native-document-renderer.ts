import type {
  DocumentRenderer,
  InspectionResult,
  RendererError,
  RendererErrorCategory,
} from '@/domain/document-renderer';

/** What the local Expo module `mupdf-renderer` must expose. Replies are plain values, never thrown. */
export type NativeRendererModule = {
  inspectAsync(uri: string, operationId: string, maxBytes: number | null): Promise<unknown>;
  cancel(operationId: string): void;
};

const KNOWN_CODES: Record<string, { category: RendererErrorCategory; message: string }> = {
  pdf_corrupt: { category: 'corrupt', message: 'This file is damaged and cannot be read.' },
  pdf_encrypted: { category: 'passwordRequired', message: 'This file is password protected.' },
  pdf_unsupported: {
    category: 'unsupported',
    message: 'This file is not a PDF that Muse can read.',
  },
  file_too_large: { category: 'resourceLimit', message: 'This file is too large to open safely.' },
  cancelled: { category: 'cancelled', message: 'The operation was cancelled.' },
  file_missing: {
    category: 'internal',
    message: 'Muse could not find this file. Try importing it again.',
  },
  renderer_unavailable: {
    category: 'internal',
    message: 'Reading PDFs is not available in this build of Muse.',
  },
  io_error: { category: 'internal', message: 'Muse could not read this file. Please try again.' },
};

const SAFE_CODE = /^[a-z0-9_]{1,64}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

function internal(code: string): InspectionResult {
  const error: RendererError = {
    category: 'internal',
    code,
    message: 'Something went wrong while reading this file. Please try again.',
  };
  return { ok: false, error };
}

function toResult(reply: unknown): InspectionResult {
  if (typeof reply !== 'object' || reply === null) return internal('invalid_native_response');
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
    return internal('invalid_native_response');
  }

  if (value.status === 'error') {
    const code = value.code;
    if (typeof code !== 'string' || !SAFE_CODE.test(code)) return internal('invalid_native_code');
    const known = KNOWN_CODES[code];
    if (!known) return internal('unmapped_native_code');
    return { ok: false, error: { category: known.category, code, message: known.message } };
  }

  return internal('invalid_native_response');
}

/** Adapts the native module to the DocumentRenderer seam and enforces its error contract. */
export function createNativeDocumentRenderer(native: NativeRendererModule): DocumentRenderer {
  return {
    async inspect({ uri, operationId, limits }) {
      try {
        return toResult(await native.inspectAsync(uri, operationId, limits?.maxBytes ?? null));
      } catch {
        // The thrown message may contain a path or content, so it is dropped.
        return internal('native_exception');
      }
    },
    cancel(operationId) {
      native.cancel(operationId);
    },
  };
}
