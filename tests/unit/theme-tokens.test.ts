import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { palettes, type SemanticTokens } from '@/theme/tokens';

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe.each(['light', 'dark'] as const)('%s palette', (scheme) => {
  const t = palettes[scheme];

  it.each([
    ['text', 'canvas'],
    ['text', 'surface'],
    ['mutedText', 'canvas'],
    ['mutedText', 'surface'],
    ['accentText', 'canvas'],
    ['accentText', 'surface'],
    ['destructive', 'canvas'],
    ['destructive', 'surface'],
  ] as const)('%s on %s meets 4.5:1 text contrast', (fg, bg) => {
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['canvas', 'surface'] as const)('keeps the accent visible on %s at 3:1', (bg) => {
    expect(contrast(t.accent, t[bg])).toBeGreaterThanOrEqual(3);
  });
});

it('uses the same semantic token names in both palettes', () => {
  expect(Object.keys(palettes.dark).sort()).toEqual(Object.keys(palettes.light).sort());
});

describe('global.css', () => {
  const css = readFileSync(join(__dirname, '../../src/global.css'), 'utf8');
  const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

  it.each(['light', 'dark'] as const)('mirrors the %s tokens exactly', (scheme) => {
    const block = css.match(new RegExp(`@variant ${scheme} \\{([^}]*)\\}`))?.[1] ?? '';
    const declared = Object.fromEntries(
      [...block.matchAll(/--color-([\w-]+):\s*([^;]+);/g)].map((m) => [
        m[1],
        m[2].trim().toUpperCase(),
      ]),
    );
    const expected = Object.fromEntries(
      Object.entries(palettes[scheme] as SemanticTokens).map(([k, v]) => [
        kebab(k),
        v.toUpperCase(),
      ]),
    );
    expect(declared).toEqual(expected);
  });
});
