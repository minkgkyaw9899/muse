import { DarkTheme, DefaultTheme, type Theme } from 'expo-router/react-navigation';
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import { Uniwind } from 'uniwind';

import { kvPreferenceStore } from './preference-store';
import {
  createThemePreference,
  type PreferenceStore,
  type ThemePreference,
} from './theme-preference';
import type { SemanticTokens, ThemeScheme } from './tokens';

type AppTheme = {
  preference: ThemePreference;
  scheme: ThemeScheme;
  tokens: SemanticTokens;
  navigationTheme: Theme;
  /** Set when the latest save failed; cleared by the next successful save. */
  saveError: 'writeFailed' | null;
  setPreference(preference: ThemePreference): Promise<void>;
};

const ThemeContext = createContext<AppTheme | null>(null);

export function useAppTheme(): AppTheme {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside ThemeProvider');
  return value;
}

export function ThemeProvider({
  store = kvPreferenceStore,
  children,
}: PropsWithChildren<{ store?: PreferenceStore }>) {
  const themePreference = useMemo(() => createThemePreference(store), [store]);
  const deviceScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [saveError, setSaveError] = useState<'writeFailed' | null>(null);
  const changedByUser = useRef(false);
  // Last value known to be in the store, and a counter so only the latest save may revert the UI.
  const persisted = useRef<ThemePreference>('system');
  const latestSave = useRef(0);

  useEffect(() => {
    let active = true;
    themePreference.load().then((loaded) => {
      persisted.current = loaded;
      if (active && !changedByUser.current) setPreferenceState(loaded);
    });
    return () => {
      active = false;
    };
  }, [themePreference]);

  useEffect(() => {
    Uniwind.setTheme(preference);
  }, [preference]);

  const value = useMemo<AppTheme>(() => {
    const { scheme, tokens } = themePreference.resolve(preference, deviceScheme);
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      preference,
      scheme,
      tokens,
      navigationTheme: {
        ...base,
        colors: {
          background: tokens.canvas,
          card: tokens.canvas,
          border: tokens.separator,
          notification: tokens.destructive,
          primary: tokens.accent,
          text: tokens.text,
        },
      },
      saveError,
      async setPreference(next) {
        changedByUser.current = true;
        const request = ++latestSave.current;
        setPreferenceState(next);
        const result = await themePreference.save(next);
        if (result.ok) persisted.current = next;
        if (request !== latestSave.current) return;
        if (result.ok) {
          setSaveError(null);
        } else {
          // Keep the UI truthful: revert to what is actually persisted.
          setPreferenceState(persisted.current);
          setSaveError(result.reason);
        }
      },
    };
  }, [themePreference, preference, deviceScheme, saveError]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
