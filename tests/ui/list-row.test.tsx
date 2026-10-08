import { fireEvent, render, screen } from '@testing-library/react-native';

import { createInMemoryPreferenceStore } from '@/testing/in-memory-preference-store';
import { ThemeProvider } from '@/theme/theme-provider';
import { ListRow } from '@/ui/list-row';

const icon = { ios: 'circle', android: 'circle', web: 'circle' } as const;

async function renderRow(props: Partial<React.ComponentProps<typeof ListRow>> = {}) {
  const onPress = jest.fn();
  await render(
    <ThemeProvider store={createInMemoryPreferenceStore()}>
      <ListRow role="button" icon={icon} title="Appearance" onPress={onPress} {...props} />
    </ThemeProvider>,
  );
  return onPress;
}

describe('ListRow', () => {
  it('shows the title and value and announces them together', async () => {
    await renderRow({ value: 'Dark' });
    expect(screen.getByText('Appearance')).toBeTruthy();
    expect(screen.getByText('Dark')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Appearance, Dark' })).toBeTruthy();
  });

  it('reports presses', async () => {
    const onPress = await renderRow();
    await fireEvent.press(screen.getByRole('button', { name: 'Appearance' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('exposes the selected state of a radio row', async () => {
    await renderRow({ role: 'radio', selected: true, title: 'Dark' });
    expect(screen.getByRole('radio', { name: 'Dark' }).props.accessibilityState.selected).toBe(
      true,
    );
  });
});
