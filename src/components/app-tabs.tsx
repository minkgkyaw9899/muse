import { Tabs } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useRef } from 'react';
import { detectTabBarKind } from '@/theme/glass-capability';
import { useAppTheme } from '@/theme/theme-provider';
import { bounceNativeTabIcon } from '../../modules/native-tab-bounce';
import { createNativeTabIconAnimator } from './native-tab-icon-animator';
import { type TabBarItem, TabBarView } from './tab-bar';

const TABS: TabBarItem[] = [
  {
    key: 'index',
    label: 'Library',
    icon: {
      inactive: { ios: 'books.vertical', android: 'library_books', web: 'library_books' },
      active: { ios: 'books.vertical.fill', android: 'library_books', web: 'library_books' },
    },
  },
  {
    key: 'favorites',
    label: 'Favorites',
    icon: {
      inactive: { ios: 'heart', android: 'favorite', web: 'favorite' },
      active: { ios: 'heart.fill', android: 'favorite', web: 'favorite' },
    },
  },
  {
    key: 'settings',
    label: 'Settings',
    icon: {
      inactive: { ios: 'gearshape', android: 'settings', web: 'settings' },
      active: { ios: 'gearshape.fill', android: 'settings', web: 'settings' },
    },
  },
];

const tabBarKind = detectTabBarKind();

/** iOS 26+: native Liquid Glass tab bar. Otherwise: the custom JS tab bar with identical routes. */
function GlassTabs() {
  const { tokens } = useAppTheme();
  const animator = useRef(createNativeTabIconAnimator(bounceNativeTabIcon));

  return (
    <NativeTabs
      tintColor={tokens.accent}
      labelStyle={{ default: { color: tokens.mutedText }, selected: { color: tokens.text } }}
      screenListeners={({ route }) => ({
        focus: () => {
          const index = TABS.findIndex((tab) => tab.key === route.name);
          if (index >= 0) void animator.current.select(index);
        },
      })}
    >
      {TABS.map((tab) => (
        <NativeTabs.Trigger key={tab.key} name={tab.key}>
          <NativeTabs.Trigger.Label>{tab.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon
            sf={{ default: tab.icon.inactive.ios, selected: tab.icon.active.ios }}
            md={tab.icon.inactive.android}
          />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}

export default function AppTabs() {
  if (tabBarKind === 'glass') return <GlassTabs />;
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <TabBarView
          items={TABS}
          activeKey={state.routes[state.index]?.name ?? 'index'}
          onSelect={(key) => navigation.navigate(key)}
        />
      )}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.key} name={tab.key} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}
