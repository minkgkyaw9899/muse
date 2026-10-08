import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { SettingsScreen } from '@/screens/settings-screen';
import { createInMemoryPreferenceStore } from '@/testing/in-memory-preference-store';
import { ThemeProvider } from '@/theme/theme-provider';

async function renderSettings(stored: string | null, onOpenAppearance = jest.fn()) {
  await render(
    <SafeAreaInsetsContext.Provider value={{ top: 24, bottom: 0, left: 0, right: 0 }}>
      <ThemeProvider store={createInMemoryPreferenceStore(stored)}>
        <SettingsScreen onOpenAppearance={onOpenAppearance} />
      </ThemeProvider>
    </SafeAreaInsetsContext.Provider>,
  );
  return onOpenAppearance;
}

describe('Settings list', () => {
  it('lists Appearance with the current choice as its value', async () => {
    await renderSettings('dark');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Appearance, Dark' })).toBeTruthy(),
    );
  });

  it('shows System when nothing has been chosen', async () => {
    await renderSettings(null);
    expect(screen.getByRole('button', { name: 'Appearance, System' })).toBeTruthy();
  });

  it('opens the Appearance screen when the row is pressed', async () => {
    const onOpen = await renderSettings(null);
    await fireEvent.press(screen.getByRole('button', { name: 'Appearance, System' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
