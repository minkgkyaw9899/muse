import type { DocumentRenderer, InspectionResult, RendererError } from '@/domain/document-renderer';

type FakeFile =
  | { kind: 'valid'; bytes: number; pageCount: number; fingerprint: string; slow?: boolean }
  | { kind: 'corrupt' | 'encrypted' | 'unsupported'; bytes: number };

const FAILURES: Record<'corrupt' | 'encrypted' | 'unsupported', RendererError> = {
  corrupt: {
    category: 'corrupt',
    code: 'fake_corrupt',
    message: 'This file is damaged and cannot be read.',
  },
  encrypted: {
    category: 'passwordRequired',
    code: 'fake_encrypted',
    message: 'This file is password protected.',
  },
  unsupported: {
    category: 'unsupported',
    code: 'fake_unsupported',
    message: 'This file is not a PDF that Muse can read.',
  },
};

export function createFakeDocumentRenderer() {
  const fixtures = {
    valid: { uri: 'fake://valid.pdf', pageCount: 3, fingerprint: 'a'.repeat(64) },
    corrupt: { uri: 'fake://corrupt.pdf' },
    encrypted: { uri: 'fake://encrypted.pdf' },
    unsupported: { uri: 'fake://unsupported.bin' },
    oversized: { uri: 'fake://oversized.pdf', maxBytes: 1024 },
    slow: { uri: 'fake://slow.pdf', pageCount: 100_000, fingerprint: 'c'.repeat(64) },
  };

  const files = new Map<string, FakeFile>([
    [fixtures.valid.uri, { kind: 'valid', bytes: 512, ...fixtures.valid }],
    [fixtures.corrupt.uri, { kind: 'corrupt', bytes: 512 }],
    [fixtures.encrypted.uri, { kind: 'encrypted', bytes: 512 }],
    [fixtures.unsupported.uri, { kind: 'unsupported', bytes: 512 }],
    [
      fixtures.oversized.uri,
      { kind: 'valid', bytes: 10_000, pageCount: 1, fingerprint: 'b'.repeat(64) },
    ],
    [fixtures.slow.uri, { kind: 'valid', bytes: 512, slow: true, ...fixtures.slow }],
  ]);
  const running = new Map<string, () => void>();

  const renderer: DocumentRenderer = {
    async inspect({ uri, operationId, limits }): Promise<InspectionResult> {
      const file = files.get(uri);
      if (!file) {
        return {
          ok: false,
          error: {
            category: 'internal',
            code: 'file_missing',
            message: 'Muse could not find this file. Try importing it again.',
          },
        };
      }
      if (limits?.maxBytes !== undefined && file.bytes > limits.maxBytes) {
        return {
          ok: false,
          error: {
            category: 'resourceLimit',
            code: 'fake_too_large',
            message: 'This file is too large to open safely.',
          },
        };
      }
      if (file.kind !== 'valid') return { ok: false, error: FAILURES[file.kind] };
      if (file.slow) {
        const outcome = await new Promise<'done' | 'cancelled'>((resolve) => {
          const timer = setTimeout(() => resolve('done'), 50);
          running.set(operationId, () => {
            clearTimeout(timer);
            resolve('cancelled');
          });
        });
        running.delete(operationId);
        if (outcome === 'cancelled') {
          return {
            ok: false,
            error: {
              category: 'cancelled',
              code: 'cancelled',
              message: 'The operation was cancelled.',
            },
          };
        }
      }
      return {
        ok: true,
        inspection: { pageCount: file.pageCount, fingerprint: file.fingerprint },
      };
    },
    cancel(operationId) {
      running.get(operationId)?.();
    },
  };

  return { renderer, fixtures };
}
