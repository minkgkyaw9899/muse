import { ScrollView, Text } from 'react-native';
import type { SymbolName } from '@/components/tab-bar';
import { type ThemePreference, themePreferences } from '@/theme/theme-preference';
import { useAppTheme } from '@/theme/theme-provider';
import { ListRow } from '@/ui/list-row';

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

const THEME_ICONS: Record<ThemePreference, SymbolName> = {
  system: { ios: 'circle.lefthalf.filled', android: 'brightness_medium', web: 'brightness_medium' },
  light: { ios: 'sun.max', android: 'light_mode', web: 'light_mode' },
  dark: { ios: 'moon', android: 'dark_mode', web: 'dark_mode' },
};

export function AppearanceScreen() {
  const { preference, setPreference, saveError } = useAppTheme();

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="grow px-5 py-2"
    >
      {themePreferences.map((option, index) => (
        <ListRow
          key={option}
          role="radio"
          icon={THEME_ICONS[option]}
          title={THEME_LABELS[option]}
          selected={option === preference}
          divider={index > 0}
          onPress={() => setPreference(option)}
        />
      ))}
      {saveError ? (
        <Text accessibilityRole="alert" className="pt-4 text-destructive text-lg">
          Could not save your theme choice. Please try again.
        </Text>
      ) : null}
    </ScrollView>
  );
}
