import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useAppTheme } from '@/theme/theme-provider';

export default function AppTabs() {
  const { tokens } = useAppTheme();

  return (
    <NativeTabs
      backgroundColor={tokens.canvas}
      indicatorColor={tokens.surface}
      tintColor={tokens.accent}
      labelStyle={{ default: { color: tokens.mutedText }, selected: { color: tokens.text } }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="books.vertical" md="library_books" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="favorites">
        <NativeTabs.Trigger.Label>Favorites</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="heart" md="favorite" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
