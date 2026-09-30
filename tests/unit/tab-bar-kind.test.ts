import { resolveTabBarKind } from '@/theme/glass-capability';

describe('tab bar kind', () => {
  it('uses the glass tab bar only when both Liquid Glass checks pass on iOS', () => {
    expect(resolveTabBarKind({ os: 'ios', liquidGlass: true, glassEffectApi: true })).toBe('glass');
  });

  it.each([
    [{ os: 'ios', liquidGlass: false, glassEffectApi: true }],
    [{ os: 'ios', liquidGlass: true, glassEffectApi: false }],
    [{ os: 'ios', liquidGlass: false, glassEffectApi: false }],
  ] as const)('falls back when a check fails: %j', (capability) => {
    expect(resolveTabBarKind(capability)).toBe('fallback');
  });

  it.each(['android', 'web'] as const)('falls back on %s', (os) => {
    expect(resolveTabBarKind({ os, liquidGlass: true, glassEffectApi: true })).toBe('fallback');
  });
});
