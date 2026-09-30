import { createInMemoryPreferenceStore } from '@/testing/in-memory-preference-store';
import { createThemePreference } from '@/theme/theme-preference';
import { palettes } from '@/theme/tokens';

describe('theme preference resolution', () => {
  const theme = createThemePreference(createInMemoryPreferenceStore());

  it('System follows the device appearance', () => {
    expect(theme.resolve('system', 'dark').scheme).toBe('dark');
    expect(theme.resolve('system', 'light').scheme).toBe('light');
  });

  it('System falls back to light when the device scheme is unknown', () => {
    expect(theme.resolve('system', null).scheme).toBe('light');
    expect(theme.resolve('system', undefined).scheme).toBe('light');
  });

  it('Light and Dark override the device appearance', () => {
    expect(theme.resolve('light', 'dark').scheme).toBe('light');
    expect(theme.resolve('dark', 'light').scheme).toBe('dark');
  });

  it('exposes the tokens of the resolved palette', () => {
    expect(theme.resolve('dark', 'light').tokens).toBe(palettes.dark);
  });
});
