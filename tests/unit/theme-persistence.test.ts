import { createInMemoryPreferenceStore } from '@/testing/in-memory-preference-store';
import { createThemePreference } from '@/theme/theme-preference';

describe('theme preference persistence', () => {
  it('defaults to System when nothing is stored', async () => {
    const theme = createThemePreference(createInMemoryPreferenceStore());
    expect(await theme.load()).toBe('system');
  });

  it('restores a saved choice after relaunch', async () => {
    const store = createInMemoryPreferenceStore();
    expect(await createThemePreference(store).save('dark')).toEqual({ ok: true });
    expect(await createThemePreference(store).load()).toBe('dark');
  });

  it('falls back to System when the stored value is unrecognised', async () => {
    const theme = createThemePreference(createInMemoryPreferenceStore('sepia'));
    expect(await theme.load()).toBe('system');
  });

  it('falls back to System when the read fails', async () => {
    const theme = createThemePreference(createInMemoryPreferenceStore('dark', { read: true }));
    expect(await theme.load()).toBe('system');
  });

  it('reports a failed write instead of claiming success', async () => {
    const store = createInMemoryPreferenceStore('light', { write: true });
    const result = await createThemePreference(store).save('dark');
    expect(result).toEqual({ ok: false, reason: 'writeFailed' });
    expect(store.value).toBe('light');
  });
});
