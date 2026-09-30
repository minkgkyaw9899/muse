import { palettes, type SemanticTokens, type ThemeScheme } from './tokens';

export type ThemePreference = 'system' | 'light' | 'dark';

export type PreferenceStore = {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
};

export type ResolvedTheme = { scheme: ThemeScheme; tokens: SemanticTokens };

export type SaveResult = { ok: true } | { ok: false; reason: 'writeFailed' };

export type ThemePreferenceModule = {
  load(): Promise<ThemePreference>;
  save(preference: ThemePreference): Promise<SaveResult>;
  resolve(preference: ThemePreference, deviceScheme: string | null | undefined): ResolvedTheme;
};

export const themePreferences: readonly ThemePreference[] = ['system', 'light', 'dark'];

function isThemePreference(value: unknown): value is ThemePreference {
  return themePreferences.includes(value as ThemePreference);
}

export function createThemePreference(store: PreferenceStore): ThemePreferenceModule {
  return {
    async load() {
      try {
        const stored = await store.read();
        return isThemePreference(stored) ? stored : 'system';
      } catch {
        return 'system';
      }
    },
    async save(preference) {
      try {
        await store.write(preference);
        return { ok: true };
      } catch {
        return { ok: false, reason: 'writeFailed' };
      }
    },
    resolve(preference, deviceScheme) {
      const scheme: ThemeScheme =
        preference === 'system' ? (deviceScheme === 'dark' ? 'dark' : 'light') : preference;
      return { scheme, tokens: palettes[scheme] };
    },
  };
}
