import { Pressable, ScrollView, Text, View } from 'react-native';

import { useAppTheme } from '@/theme/theme-provider';
import { THEME_LABELS } from './appearance-screen';

export function SettingsScreen({ onOpenAppearance }: { onOpenAppearance: () => void }) {
  const { preference } = useAppTheme();
  const value = THEME_LABELS[preference];

  return (
    <ScrollView className="flex-1 bg-canvas" contentInsetAdjustmentBehavior="automatic">
      <View className="p-4">
        <View className="overflow-hidden rounded-2xl bg-surface">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Appearance, ${value}`}
            onPress={onOpenAppearance}
            className="min-h-11 flex-row items-center justify-between px-4"
          >
            <Text className="text-base text-text">Appearance</Text>
            <View className="flex-row items-center gap-2">
              <Text className="text-base text-muted-text">{value}</Text>
              <Text accessibilityElementsHidden className="text-base text-muted-text">
                ›
              </Text>
            </View>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}
