import { TabList, TabSlot, Tabs, TabTrigger, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, Text, View } from 'react-native';

function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      className={`min-h-11 justify-center rounded-full px-4 ${isFocused ? 'bg-accent' : 'bg-surface'}`}
    >
      <Text className={isFocused ? 'text-on-accent' : 'text-text'}>{children}</Text>
    </Pressable>
  );
}

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <View className="absolute w-full flex-row justify-center gap-2 p-4">
          <TabTrigger name="index" href="/" asChild>
            <TabButton>Library</TabButton>
          </TabTrigger>
          <TabTrigger name="favorites" href="/favorites" asChild>
            <TabButton>Favorites</TabButton>
          </TabTrigger>
          <TabTrigger name="settings" href="/settings" asChild>
            <TabButton>Settings</TabButton>
          </TabTrigger>
        </View>
      </TabList>
    </Tabs>
  );
}
