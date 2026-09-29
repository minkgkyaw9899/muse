import { Tabs } from 'expo-router';

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

export default function AppTabs() {
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
