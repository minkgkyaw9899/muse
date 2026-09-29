import { createNativeDocumentRenderer } from '@/features/reader/native-document-renderer';

const FINGERPRINT = 'd'.repeat(64);

function nativeModule(reply: unknown) {
  return {
    inspectAsync: jest.fn().mockResolvedValue(reply),
    cancel: jest.fn(),
  };
}

describe('native document renderer adapter', () => {
  it('returns the inspection reported by the native module', async () => {
    const native = nativeModule({ status: 'ok', pageCount: 42, fingerprint: FINGERPRINT });
    const renderer = createNativeDocumentRenderer(native);

    const result = await renderer.inspect({ uri: 'file:///owned/a.pdf', operationId: 'op-1' });

    expect(result).toEqual({ ok: true, inspection: { pageCount: 42, fingerprint: FINGERPRINT } });
  });

  it('passes the request to the native module and forwards cancellation', async () => {
    const native = nativeModule({ status: 'ok', pageCount: 1, fingerprint: FINGERPRINT });
    const renderer = createNativeDocumentRenderer(native);

    await renderer.inspect({
      uri: 'file:///owned/a.pdf',
      operationId: 'op-2',
      limits: { maxBytes: 5000 },
    });
    renderer.cancel('op-2');

    expect(native.inspectAsync).toHaveBeenCalledWith('file:///owned/a.pdf', 'op-2', 5000);
    expect(native.cancel).toHaveBeenCalledWith('op-2');
  });

  it.each([
    ['pdf_corrupt', 'corrupt'],
    ['pdf_encrypted', 'passwordRequired'],
    ['pdf_unsupported', 'unsupported'],
    ['file_too_large', 'resourceLimit'],
    ['cancelled', 'cancelled'],
    ['file_missing', 'internal'],
    ['io_error', 'internal'],
  ] as const)('maps the native code %s to the %s category', async (code, category) => {
    const renderer = createNativeDocumentRenderer(nativeModule({ status: 'error', code }));

    const result = await renderer.inspect({ uri: 'file:///owned/a.pdf', operationId: 'op-3' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.category).toBe(category);
      expect(result.error.code).toBe(code);
      expect(result.error.message).not.toBe('');
    }
  });

  it('reports an unrecognised or unsafe native code as an internal error', async () => {
    const renderer = createNativeDocumentRenderer(
      nativeModule({ status: 'error', code: '/private/var/mobile/secret.pdf' }),
    );

    const result = await renderer.inspect({ uri: 'file:///owned/a.pdf', operationId: 'op-4' });

    expect(result).toMatchObject({
      ok: false,
      error: { category: 'internal', code: 'invalid_native_code' },
    });
  });

  it('does not leak the message of an unexpected native failure', async () => {
    const native = {
      inspectAsync: jest.fn().mockRejectedValue(new Error('crashed reading /private/var/x.pdf')),
      cancel: jest.fn(),
    };
    const renderer = createNativeDocumentRenderer(native);

    const result = await renderer.inspect({ uri: 'file:///owned/a.pdf', operationId: 'op-5' });

    expect(result).toMatchObject({
      ok: false,
      error: { category: 'internal', code: 'native_exception' },
    });
    expect(JSON.stringify(result)).not.toContain('/private');
  });

  it.each([
    [{ status: 'ok', pageCount: 0, fingerprint: FINGERPRINT }],
    [{ status: 'ok', pageCount: 1.5, fingerprint: FINGERPRINT }],
    [{ status: 'ok', pageCount: 3, fingerprint: 'not-a-hash' }],
    [{ status: 'ok' }],
    [null],
    ['ok'],
  ])('rejects a malformed native reply %j', async (reply) => {
    const renderer = createNativeDocumentRenderer(nativeModule(reply));

    const result = await renderer.inspect({ uri: 'file:///owned/a.pdf', operationId: 'op-6' });

    expect(result).toMatchObject({
      ok: false,
      error: { category: 'internal', code: 'invalid_native_response' },
    });
  });
});
