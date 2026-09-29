import type { RendererError, RendererErrorCategory } from './document-renderer';

/**
 * Every failure the renderer can report, keyed by the code the native module uses. One table feeds
 * the native adapter, the unavailable renderer, and the in-memory fake, so codes, categories, and
 * user-facing messages cannot drift apart. Messages never contain paths or document content.
 */
export const RENDERER_ERRORS = {
  pdf_corrupt: { category: 'corrupt', message: 'This file is damaged and cannot be read.' },
  pdf_encrypted: { category: 'passwordRequired', message: 'This file is password protected.' },
  pdf_unsupported: {
    category: 'unsupported',
    message: 'This file is not a PDF that Muse can read.',
  },
  file_too_large: { category: 'resourceLimit', message: 'This file is too large to open safely.' },
  too_many_operations: {
    category: 'resourceLimit',
    message: 'Muse is busy with other files. Please try again in a moment.',
  },
  cancelled: { category: 'cancelled', message: 'The operation was cancelled.' },
  file_missing: {
    category: 'internal',
    message: 'Muse could not find this file. Try importing it again.',
  },
  io_error: { category: 'internal', message: 'Muse could not read this file. Please try again.' },
  renderer_unavailable: {
    category: 'internal',
    message: 'Reading PDFs is not available in this build of Muse.',
  },
  invalid_request: {
    category: 'internal',
    message: 'Something went wrong while reading this file. Please try again.',
  },
  native_exception: {
    category: 'internal',
    message: 'Something went wrong while reading this file. Please try again.',
  },
  invalid_native_response: {
    category: 'internal',
    message: 'Something went wrong while reading this file. Please try again.',
  },
  invalid_native_code: {
    category: 'internal',
    message: 'Something went wrong while reading this file. Please try again.',
  },
  unmapped_native_code: {
    category: 'internal',
    message: 'Something went wrong while reading this file. Please try again.',
  },
} as const satisfies Record<string, { category: RendererErrorCategory; message: string }>;

export type RendererErrorCode = keyof typeof RENDERER_ERRORS;

export function isRendererErrorCode(code: string): code is RendererErrorCode {
  return Object.hasOwn(RENDERER_ERRORS, code);
}

export function rendererError(code: RendererErrorCode): RendererError {
  const { category, message } = RENDERER_ERRORS[code];
  return { category, code, message };
}
