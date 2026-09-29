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

  it('passes the request and byte limit to the native module', async () => {
    const native = nativeModule({ status: 'ok', pageCount: 1, fingerprint: FINGERPRINT });
    const renderer = createNativeDocumentRenderer(native);

    await renderer.inspect({
      uri: 'file:///owned/a.pdf',
      operationId: 'op-2',
      limits: { maxBytes: 5000 },
    });

    expect(native.inspectAsync).toHaveBeenCalledWith('file:///owned/a.pdf', 'op-2', 5000);
  });

  it('forwards cancellation of an operation that is still running', async () => {
    let finish: (reply: unknown) => void = () => {};
    const native = {
      inspectAsync: jest.fn().mockReturnValue(new Promise((resolve) => (finish = resolve))),
      cancel: jest.fn(),
    };
    const renderer = createNativeDocumentRenderer(native);

    const pending = renderer.inspect({ uri: 'file:///owned/a.pdf', operationId: 'op-run' });
    renderer.cancel('op-run');
    finish({ status: 'error', code: 'cancelled' });

    expect(native.cancel).toHaveBeenCalledWith('op-run');
    expect(await pending).toMatchObject({ ok: false, error: { category: 'cancelled' } });
  });

  it('does not forward cancellation of unknown or finished operations', async () => {
    const native = nativeModule({ status: 'ok', pageCount: 1, fingerprint: FINGERPRINT });
    const renderer = createNativeDocumentRenderer(native);

    renderer.cancel('never-started');
    await renderer.inspect({ uri: 'file:///owned/a.pdf', operationId: 'op-done' });
    renderer.cancel('op-done');

    expect(native.cancel).not.toHaveBeenCalled();
  });

  it.each([
    ['pdf_corrupt', 'corrupt'],
    ['pdf_encrypted', 'passwordRequired'],
    ['pdf_unsupported', 'unsupported'],
    ['file_too_large', 'resourceLimit'],
    ['cancelled', 'cancelled'],
    ['too_many_operations', 'resourceLimit'],
    ['invalid_request', 'internal'],
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

  describe('request validation', () => {
    const rejected = {
      ok: false,
      error: { category: 'internal', code: 'invalid_request' },
    };

    it.each([[Number.NaN], [Number.POSITIVE_INFINITY], [-1], [1.5], [Number.MAX_SAFE_INTEGER + 2]])(
      'rejects the byte limit %p without calling native code',
      async (maxBytes) => {
        const native = nativeModule({ status: 'ok', pageCount: 1, fingerprint: FINGERPRINT });
        const renderer = createNativeDocumentRenderer(native);

        const result = await renderer.inspect({
          uri: 'file:///owned/a.pdf',
          operationId: 'op-limit',
          limits: { maxBytes },
        });

        expect(result).toMatchObject(rejected);
        expect(native.inspectAsync).not.toHaveBeenCalled();
      },
    );

    it.each([[''], ['x'.repeat(96)]])('rejects the operation id %p', async (operationId) => {
      const native = nativeModule({ status: 'ok', pageCount: 1, fingerprint: FINGERPRINT });
      const renderer = createNativeDocumentRenderer(native);

      const result = await renderer.inspect({ uri: 'file:///owned/a.pdf', operationId });

      expect(result).toMatchObject(rejected);
      expect(native.inspectAsync).not.toHaveBeenCalled();
    });

    it('accepts a zero byte limit and the longest allowed id', async () => {
      const native = nativeModule({ status: 'error', code: 'file_too_large' });
      const renderer = createNativeDocumentRenderer(native);

      await renderer.inspect({
        uri: 'file:///owned/a.pdf',
        operationId: 'x'.repeat(95),
        limits: { maxBytes: 0 },
      });

      expect(native.inspectAsync).toHaveBeenCalledTimes(1);
    });

    it('refuses to reuse the id of an operation that is still running', async () => {
      let finish: (reply: unknown) => void = () => {};
      const native = {
        inspectAsync: jest.fn().mockReturnValue(new Promise((resolve) => (finish = resolve))),
        cancel: jest.fn(),
      };
      const renderer = createNativeDocumentRenderer(native);

      const first = renderer.inspect({ uri: 'file:///owned/a.pdf', operationId: 'same' });
      const second = await renderer.inspect({ uri: 'file:///owned/b.pdf', operationId: 'same' });
      finish({ status: 'ok', pageCount: 1, fingerprint: FINGERPRINT });

      expect(second).toMatchObject(rejected);
      expect(native.inspectAsync).toHaveBeenCalledTimes(1);
      expect(await first).toMatchObject({ ok: true });
    });

    it('allows an id to be reused once its operation has finished', async () => {
      const native = nativeModule({ status: 'ok', pageCount: 1, fingerprint: FINGERPRINT });
      const renderer = createNativeDocumentRenderer(native);

      await renderer.inspect({ uri: 'file:///owned/a.pdf', operationId: 'again' });
      const second = await renderer.inspect({ uri: 'file:///owned/a.pdf', operationId: 'again' });

      expect(second).toMatchObject({ ok: true });
    });
  });
});
