import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { AppearanceScreen } from '@/screens/appearance-screen';
import { createInMemoryPreferenceStore } from '@/testing/in-memory-preference-store';
import { ThemeProvider } from '@/theme/theme-provider';

async function renderSettings(store = createInMemoryPreferenceStore()) {
  await render(
    <ThemeProvider store={store}>
      <AppearanceScreen />
    </ThemeProvider>,
  );
  return store;
}

const selected = (name: string) =>
  screen.getByRole('radio', { name }).props.accessibilityState.selected;

describe('Appearance theme choice', () => {
  it('offers System, Light and Dark with System selected by default', async () => {
    await renderSettings();
    await waitFor(() => expect(selected('System')).toBe(true));
    expect(selected('Light')).toBe(false);
    expect(selected('Dark')).toBe(false);
  });

  it('shows the selection with an icon instead of text', async () => {
    await renderSettings(createInMemoryPreferenceStore('dark'));
    await waitFor(() => expect(selected('Dark')).toBe(true));
    expect(screen.queryByText('Selected')).toBeNull();
  });

  it('marks the saved choice as selected after relaunch', async () => {
    await renderSettings(createInMemoryPreferenceStore('dark'));
    await waitFor(() => expect(selected('Dark')).toBe(true));
  });

  it('selects and persists a new choice', async () => {
    const store = await renderSettings();
    await fireEvent.press(screen.getByRole('radio', { name: 'Light' }));
    await waitFor(() => expect(selected('Light')).toBe(true));
    expect(store.value).toBe('light');
  });

  it('shows a recoverable error and keeps the old selection when saving fails', async () => {
    await renderSettings(createInMemoryPreferenceStore('light', { write: true }));
    await waitFor(() => expect(selected('Light')).toBe(true));
    await fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(selected('Light')).toBe(true);
    expect(selected('Dark')).toBe(false);
  });
});

describe('Appearance theme choice, rapid taps', () => {
  it('lets the latest choice win when an earlier save fails', async () => {
    let failFirst = true;
    const store = createInMemoryPreferenceStore('system');
    const flaky = {
      read: store.read,
      async write(value: string) {
        if (failFirst) {
          failFirst = false;
          await new Promise((resolve) => setTimeout(resolve, 20));
          throw new Error('write failed');
        }
        await store.write(value);
      },
    };
    await renderSettings(flaky as typeof store);
    await waitFor(() => expect(selected('System')).toBe(true));
    await fireEvent.press(screen.getByRole('radio', { name: 'Light' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Dark' }));
    await waitFor(() => expect(store.value).toBe('dark'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    expect(selected('Dark')).toBe(true);
  });
});
