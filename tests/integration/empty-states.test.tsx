import { render, screen } from '@testing-library/react-native';

import type { PublicationLibrary } from '@/features/library/publication-library';
import { FavoritesScreen } from '@/screens/favorites-screen';
import { LibraryScreen } from '@/screens/library-screen';
import { createInMemoryPreferenceStore } from '@/testing/in-memory-preference-store';
import { ThemeProvider } from '@/theme/theme-provider';
import { ToastProvider } from '@/ui/toast';

const emptyLibrary: PublicationLibrary = {
  list: async () => [],
  subscribe: () => () => {},
  rename: async () => ({ status: 'error', error: { category: 'notFound', message: 'Not found' } }),
  remove: async () => ({ status: 'error', error: { category: 'notFound', message: 'Not found' } }),
  setFavorite: async () => ({
    status: 'error',
    error: { category: 'notFound', message: 'Not found' },
  }),
  importOne: async () => ({ status: 'cancelled' }),
  importMany: async () => ({ status: 'cancelled', results: [] }),
};

async function renderInTheme(ui: React.ReactElement) {
  await render(
    <ThemeProvider store={createInMemoryPreferenceStore()}>
      <ToastProvider>{ui}</ToastProvider>
    </ThemeProvider>,
  );
}

describe('empty states', () => {
  it('Library has one screen title and explains that it is empty', async () => {
    await renderInTheme(<LibraryScreen library={emptyLibrary} />);
    expect(screen.getAllByRole('header').map((h) => h.props.children)).toEqual(['Library']);
    expect(screen.getByText('Your library is empty')).toBeTruthy();
    expect(screen.getByText('Publications you import will appear here.')).toBeTruthy();
  });

  it('Favorites has one screen title and explains how to fill it', async () => {
    await renderInTheme(<FavoritesScreen library={emptyLibrary} />);
    expect(screen.getAllByRole('header').map((h) => h.props.children)).toEqual(['Favorites']);
    expect(screen.getByText('No favorites yet')).toBeTruthy();
    expect(
      screen.getByText('Mark a publication as a favorite to find it here quickly.'),
    ).toBeTruthy();
  });
});
