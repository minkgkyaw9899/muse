import { createMupdfDocumentRenderer } from '@/features/reader/mupdf-document-renderer';

const REQUEST = { uri: 'file:///owned/a.pdf', operationId: 'op-1' };

describe('MuPDF document renderer', () => {
  it('uses the native module when it is linked into the build', async () => {
    const native = {
      inspectAsync: jest
        .fn()
        .mockResolvedValue({ status: 'ok', pageCount: 7, fingerprint: 'e'.repeat(64) }),
      cancel: jest.fn(),
    };
    const renderer = createMupdfDocumentRenderer(() => native);

    expect(await renderer.inspect(REQUEST)).toEqual({
      ok: true,
      inspection: { pageCount: 7, fingerprint: 'e'.repeat(64) },
    });
  });

  it('reports the renderer as unavailable when the native module is not in the build', async () => {
    const renderer = createMupdfDocumentRenderer(() => null);

    expect(await renderer.inspect(REQUEST)).toEqual({
      ok: false,
      error: {
        category: 'internal',
        code: 'renderer_unavailable',
        message: 'Reading PDFs is not available in this build of Muse.',
      },
    });
    expect(() => renderer.cancel('op-1')).not.toThrow();
  });

  it('reports a stub native build the same way', async () => {
    const native = {
      inspectAsync: jest.fn().mockResolvedValue({ status: 'error', code: 'renderer_unavailable' }),
      cancel: jest.fn(),
    };
    const renderer = createMupdfDocumentRenderer(() => native);

    expect(await renderer.inspect(REQUEST)).toEqual({
      ok: false,
      error: {
        category: 'internal',
        code: 'renderer_unavailable',
        message: 'Reading PDFs is not available in this build of Muse.',
      },
    });
  });
});
