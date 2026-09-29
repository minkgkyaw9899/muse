import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { type ThemePreference, themePreferences } from '@/theme/theme-preference';
import { useAppTheme } from '@/theme/theme-provider';

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

const THEME_ICONS: Record<ThemePreference, SymbolViewProps['name']> = {
  system: { ios: 'circle.lefthalf.filled', android: 'brightness_medium', web: 'brightness_medium' },
  light: { ios: 'sun.max', android: 'light_mode', web: 'light_mode' },
  dark: { ios: 'moon', android: 'dark_mode', web: 'dark_mode' },
};

export function AppearanceScreen() {
  const { preference, setPreference, saveError, tokens } = useAppTheme();

  return (
    <ScrollView className="flex-1 bg-canvas" contentInsetAdjustmentBehavior="automatic">
      <View className="gap-4 px-5 py-2">
        <View accessibilityRole="radiogroup">
          {themePreferences.map((option, index) => {
            const selected = option === preference;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityLabel={THEME_LABELS[option]}
                accessibilityState={{ selected, checked: selected }}
                onPress={() => setPreference(option)}
                className="min-h-20 flex-row items-center gap-4"
              >
                <View className="size-12 items-center justify-center rounded-full bg-surface">
                  <SymbolView
                    name={THEME_ICONS[option]}
                    tintColor={selected ? tokens.accent : tokens.mutedText}
                    size={24}
                  />
                </View>
                <View
                  className={`min-h-20 flex-1 flex-row items-center ${
                    index > 0 ? 'border-separator border-t' : ''
                  }`}
                >
                  <Text className={`flex-1 text-lg ${selected ? 'font-semibold' : ''} text-text`}>
                    {THEME_LABELS[option]}
                  </Text>
                  {selected ? (
                    <SymbolView
                      name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                      weight="bold"
                      tintColor={tokens.accent}
                      size={22}
                    />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        {saveError ? (
          <Text accessibilityRole="alert" className="text-lg text-destructive">
            Could not save your theme choice. Please try again.
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}
