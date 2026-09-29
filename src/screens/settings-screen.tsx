import { SymbolView } from 'expo-symbols';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '@/theme/theme-provider';
import { THEME_LABELS } from './appearance-screen';

export function SettingsScreen({ onOpenAppearance }: { onOpenAppearance: () => void }) {
  const { preference, tokens } = useAppTheme();
  const value = THEME_LABELS[preference];

  return (
    <ScrollView className="flex-1 bg-canvas" contentInsetAdjustmentBehavior="automatic">
      <View className="px-5 py-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Appearance, ${value}`}
          onPress={onOpenAppearance}
          className="min-h-20 flex-row items-center gap-4"
        >
          <View className="size-12 items-center justify-center rounded-full bg-surface">
            <SymbolView
              name={{ ios: 'paintpalette', android: 'palette', web: 'palette' }}
              tintColor={tokens.accent}
              size={24}
            />
          </View>
          <View className="min-h-20 flex-1 flex-row items-center justify-between">
            <Text className="text-lg text-text">Appearance</Text>
            <View className="flex-row items-center gap-2">
              <Text className="text-lg text-muted-text">{value}</Text>
              <SymbolView
                name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                tintColor={tokens.mutedText}
                size={16}
              />
            </View>
          </View>
        </Pressable>
      </View>
    </ScrollView>
  );
}
