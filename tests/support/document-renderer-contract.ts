import type { DocumentRenderer } from '@/domain/document-renderer';

export type RendererFixtures = {
  valid: { uri: string; pageCount: number; fingerprint: string };
  corrupt: { uri: string };
  encrypted: { uri: string };
  unsupported: { uri: string };
  oversized: { uri: string; maxBytes: number };
  /** Takes long enough that a cancel issued right after starting always wins. */
  slow: { uri: string; pageCount: number; fingerprint: string };
};

/** Behavior every DocumentRenderer adapter (fake, native) must satisfy at the seam. */
export function documentRendererContract(
  name: string,
  create: () => { renderer: DocumentRenderer; fixtures: RendererFixtures },
) {
  describe(`${name} satisfies the DocumentRenderer contract`, () => {
    it('returns page count and fingerprint for a valid PDF', async () => {
      const { renderer, fixtures } = create();

      const result = await renderer.inspect({ uri: fixtures.valid.uri, operationId: 'op-1' });

      expect(result).toEqual({
        ok: true,
        inspection: {
          pageCount: fixtures.valid.pageCount,
          fingerprint: fixtures.valid.fingerprint,
        },
      });
    });

    it.each([
      ['corrupt', 'corrupt'],
      ['encrypted', 'passwordRequired'],
      ['unsupported', 'unsupported'],
    ] as const)('returns %s input as the %s category', async (fixture, category) => {
      const { renderer, fixtures } = create();

      const result = await renderer.inspect({ uri: fixtures[fixture].uri, operationId: 'op-2' });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.category).toBe(category);
    });

    it('returns resourceLimit when the file exceeds the byte limit', async () => {
      const { renderer, fixtures } = create();

      const result = await renderer.inspect({
        uri: fixtures.oversized.uri,
        operationId: 'op-3',
        limits: { maxBytes: fixtures.oversized.maxBytes },
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.category).toBe('resourceLimit');
    });

    it.each(['corrupt', 'encrypted', 'unsupported'] as const)(
      'never leaks the file location in the %s error',
      async (fixture) => {
        const { renderer, fixtures } = create();
        const uri = fixtures[fixture].uri;

        const result = await renderer.inspect({ uri, operationId: 'op-4' });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error.code).not.toBe('');
          expect(result.error.message).not.toBe('');
          expect(JSON.stringify(result.error)).not.toContain(uri);
          expect(JSON.stringify(result.error)).not.toContain('/');
        }
      },
    );

    it('returns cancelled when an inspection is cancelled while running', async () => {
      const { renderer, fixtures } = create();

      const pending = renderer.inspect({ uri: fixtures.slow.uri, operationId: 'op-5' });
      renderer.cancel('op-5');
      const result = await pending;

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.category).toBe('cancelled');
    });

    it('ignores cancelling an unknown operation', () => {
      const { renderer } = create();

      expect(() => renderer.cancel('never-started')).not.toThrow();
    });

    it('cancels only the named operation', async () => {
      const { renderer, fixtures } = create();

      const cancelled = renderer.inspect({ uri: fixtures.slow.uri, operationId: 'op-6' });
      const kept = renderer.inspect({ uri: fixtures.slow.uri, operationId: 'op-7' });
      renderer.cancel('op-6');

      expect((await cancelled).ok).toBe(false);
      expect(await kept).toEqual({
        ok: true,
        inspection: { pageCount: fixtures.slow.pageCount, fingerprint: fixtures.slow.fingerprint },
      });
    });

    it('does not report a finished inspection as cancelled', async () => {
      const { renderer, fixtures } = create();

      const result = await renderer.inspect({ uri: fixtures.valid.uri, operationId: 'op-8' });
      renderer.cancel('op-8');

      expect(result.ok).toBe(true);
    });
  });
}
