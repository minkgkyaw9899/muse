import { Pressable, ScrollView, Text, View } from 'react-native';

import { type ThemePreference, themePreferences } from '@/theme/theme-preference';
import { useAppTheme } from '@/theme/theme-provider';

export const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

export function AppearanceScreen() {
  const { preference, setPreference, saveError } = useAppTheme();

  return (
    <ScrollView className="flex-1 bg-canvas" contentInsetAdjustmentBehavior="automatic">
      <View className="gap-4 p-4">
        <View accessibilityRole="radiogroup" className="overflow-hidden rounded-2xl bg-surface">
          {themePreferences.map((option, index) => {
            const selected = option === preference;
            return (
              <Pressable
                key={option}
                accessibilityRole="radio"
                accessibilityLabel={THEME_LABELS[option]}
                accessibilityState={{ selected, checked: selected }}
                onPress={() => setPreference(option)}
                className={`min-h-11 flex-row items-center justify-between px-4 ${
                  index > 0 ? 'border-t border-separator' : ''
                } ${selected ? 'bg-accent' : ''}`}
              >
                <Text
                  className={`text-base ${selected ? 'font-semibold text-on-accent' : 'text-text'}`}
                >
                  {THEME_LABELS[option]}
                </Text>
                {selected ? <Text className="text-base text-on-accent">Selected</Text> : null}
              </Pressable>
            );
          })}
        </View>
        {saveError ? (
          <Text accessibilityRole="alert" className="text-base text-destructive">
            Could not save your theme choice. Please try again.
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}
