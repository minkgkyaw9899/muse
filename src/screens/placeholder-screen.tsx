import { ScrollView, Text, View } from 'react-native';

export function PlaceholderScreen({ title, body }: { title: string; body: string }) {
  return (
    <ScrollView className="flex-1 bg-canvas" contentInsetAdjustmentBehavior="automatic">
      <View className="gap-2 p-4">
        <Text accessibilityRole="header" className="text-3xl font-bold text-text">
          {title}
        </Text>
        <View className="rounded-2xl bg-surface p-4">
          <Text className="text-base text-muted-text">{body}</Text>
        </View>
      </View>
    </ScrollView>
  );
}
