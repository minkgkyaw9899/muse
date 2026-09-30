import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { type TabBarItem, TabBarView } from '@/components/tab-bar';
import { createInMemoryPreferenceStore } from '@/testing/in-memory-preference-store';
import { ThemeProvider } from '@/theme/theme-provider';

const items: TabBarItem[] = ['Library', 'Favorites', 'Settings'].map((label) => ({
  key: label.toLowerCase(),
  label,
  icon: {
    inactive: { ios: 'circle', android: 'circle', web: 'circle' },
    active: { ios: 'circle.fill', android: 'circle', web: 'circle' },
  },
}));

async function renderBar(activeKey: string, onSelect = jest.fn()) {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider store={createInMemoryPreferenceStore()}>
        <TabBarView items={items} activeKey={activeKey} onSelect={onSelect} />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
  return onSelect;
}

const selected = (name: string) =>
  screen.getByRole('tab', { name }).props.accessibilityState.selected;

describe('tab bar', () => {
  it('shows every tab in order with only the active one selected', async () => {
    await renderBar('favorites');
    expect(screen.getAllByRole('tab').map((t) => t.props.accessibilityLabel)).toEqual([
      'Library',
      'Favorites',
      'Settings',
    ]);
    expect(selected('Favorites')).toBe(true);
    expect(selected('Library')).toBe(false);
    expect(selected('Settings')).toBe(false);
  });

  it('reports the pressed tab', async () => {
    const onSelect = await renderBar('library');
    await fireEvent.press(screen.getByRole('tab', { name: 'Settings' }));
    expect(onSelect).toHaveBeenCalledWith('settings');
  });
});
