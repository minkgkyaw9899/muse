import { render, screen } from '@testing-library/react-native';

import { FavoritesScreen } from '@/screens/favorites-screen';
import { LibraryScreen } from '@/screens/library-screen';
import { createInMemoryPreferenceStore } from '@/testing/in-memory-preference-store';
import { ThemeProvider } from '@/theme/theme-provider';

async function renderInTheme(ui: React.ReactElement) {
  await render(<ThemeProvider store={createInMemoryPreferenceStore()}>{ui}</ThemeProvider>);
}

describe('empty states', () => {
  it('Library has one screen title and explains that it is empty', async () => {
    await renderInTheme(<LibraryScreen />);
    expect(screen.getAllByRole('header').map((h) => h.props.children)).toEqual(['Library']);
    expect(screen.getByText('Your library is empty')).toBeTruthy();
    expect(screen.getByText('Publications you import will appear here.')).toBeTruthy();
  });

  it('Favorites has one screen title and explains how to fill it', async () => {
    await renderInTheme(<FavoritesScreen />);
    expect(screen.getAllByRole('header').map((h) => h.props.children)).toEqual(['Favorites']);
    expect(screen.getByText('No favorites yet')).toBeTruthy();
    expect(
      screen.getByText('Mark a publication as a favorite to find it here quickly.'),
    ).toBeTruthy();
  });
});
