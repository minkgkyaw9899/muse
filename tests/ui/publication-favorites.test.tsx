import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type {
  FavoriteChangeResult,
  Publication,
  PublicationLibrary,
} from '@/features/library/publication-library';
import { FavoritesScreen } from '@/screens/favorites-screen';
import { LibraryScreen } from '@/screens/library-screen';
import { createInMemoryPreferenceStore } from '@/testing/in-memory-preference-store';
import { ThemeProvider } from '@/theme/theme-provider';
import { ToastProvider } from '@/ui/toast';

jest.mock('@/theme/glass-capability', () => ({ detectTabBarKind: () => 'fallback' }));

const fieldNotes: Publication = {
  id: 'field-notes',
  title: 'Field Notes',
  sourceFilename: 'original.pdf',
  byteSize: 1024,
  pageCount: 100000,
  fingerprint: 'a'.repeat(64),
  importedAt: '2026-09-30T02:00:00.000Z',
  lastOpenedAt: null,
  readingPosition: null,
  ownedPath: 'publications/field-notes.pdf',
  isFavorite: false,
};

/** Screen adapter: state and subscriptions obey the same Library interface as the app. */
function collection(initial: Publication[] = [fieldNotes]): PublicationLibrary {
  let rows = initial;
  const observers = new Set<() => void>();
  return {
    list: async () => rows,
    subscribe: (listener) => {
      observers.add(listener);
      return () => observers.delete(listener);
    },
    setFavorite: async (id, isFavorite) => {
      const existing = rows.find((row) => row.id === id);
      if (!existing) throw new Error('Unknown fixture');
      const publication = { ...existing, isFavorite };
      rows = rows.map((row) => (row.id === id ? publication : row));
      for (const observer of observers) observer();
      return { status: 'saved', publication };
    },
    importOne: async () => ({ status: 'cancelled' }),
    importMany: async () => ({ status: 'cancelled', results: [] }),
  };
}

function providers(children: React.ReactNode) {
  return (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <ThemeProvider store={createInMemoryPreferenceStore()}>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

it('favorites from Library, updates Favorites, and unfavorites from the other collection', async () => {
  const library = collection();
  await render(
    providers(
      <>
        <LibraryScreen library={library} />
        <FavoritesScreen library={library} />
      </>,
    ),
  );
  expect(await screen.findByText('No favorites yet')).toBeTruthy();
  const favorite = await screen.findByRole('button', { name: 'Favorite Field Notes' });
  expect(favorite).not.toBeSelected();
  await fireEvent.press(favorite);
  const actions = await screen.findAllByRole('button', { name: 'Unfavorite Field Notes' });
  expect(actions).toHaveLength(2);
  expect(actions[0]).toBeSelected();
  expect(screen.getAllByText('Field Notes')).toHaveLength(2);
  await fireEvent.press(actions[1]);
  expect(await screen.findByText('No favorites yet')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Favorite Field Notes' })).toHaveLength(1);
  expect(await library.list()).toEqual([fieldNotes]);
});

it('keeps a saved favorite when an older collection read completes later', async () => {
  const library = collection();
  let changed!: () => void;
  library.subscribe = (listener) => {
    changed = listener;
    return () => {};
  };
  let finishOlderRead!: (rows: Publication[]) => void;
  let reads = 0;
  library.list = async () => {
    if (++reads === 1) return [fieldNotes];
    return new Promise((resolve) => {
      finishOlderRead = resolve;
    });
  };
  await render(providers(<LibraryScreen library={library} />));
  const action = await screen.findByRole('button', { name: 'Favorite Field Notes' });
  await act(async () => changed());
  await fireEvent.press(action);
  expect(await screen.findByRole('button', { name: 'Unfavorite Field Notes' })).toBeSelected();
  await act(async () => finishOlderRead([fieldNotes]));
  expect(screen.getByRole('button', { name: 'Unfavorite Field Notes' })).toBeSelected();
});

it('distinguishes an unavailable Favorites collection from empty and retries loading', async () => {
  const library = collection([{ ...fieldNotes, isFavorite: true }]);
  const list = library.list;
  let unavailable = true;
  library.list = async () => {
    if (unavailable) throw new Error('storage offline');
    return list();
  };
  await render(providers(<FavoritesScreen library={library} />));
  expect(
    await screen.findByText('Muse could not load the Favorites. Reopen the app and try again.'),
  ).toBeTruthy();
  expect(screen.queryByText('No favorites yet')).toBeNull();
  unavailable = false;
  await fireEvent.press(screen.getByRole('button', { name: 'Retry loading Favorites' }));
  expect(await screen.findByRole('button', { name: 'Unfavorite Field Notes' })).toBeSelected();
  expect(screen.queryByRole('button', { name: 'Retry loading Favorites' })).toBeNull();
});

it('searches only favorites by displayed title, ignoring case, and restores the collection on cancel', async () => {
  const library = collection([
    { ...fieldNotes, isFavorite: true },
    {
      ...fieldNotes,
      id: 'travel',
      title: 'Travel Logs',
      sourceFilename: 'FIELD.pdf',
      isFavorite: true,
    },
    { ...fieldNotes, id: 'hidden', title: 'Field Guide' },
  ]);
  await render(providers(<FavoritesScreen library={library} />));
  expect(await screen.findByText('Travel Logs')).toBeTruthy();
  expect(screen.queryByText('Field Guide')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Search Favorites' }));
  const search = screen.getByLabelText('Search Favorites titles');
  await fireEvent.changeText(search, ' fIeLd ');
  expect(screen.getByText('Field Notes')).toBeTruthy();
  expect(screen.queryByText('Travel Logs')).toBeNull();
  await fireEvent.changeText(search, 'missing');
  expect(screen.getByText('No matching favorites')).toBeTruthy();
  expect(screen.queryByText('No favorites yet')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel search' }));
  expect(screen.getByText('Travel Logs')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Unfavorite Field Notes' })).toBeSelected();
});

it('keeps the durable favorite while saving, explains failed saves and permits retry', async () => {
  const library = collection([{ ...fieldNotes, isFavorite: true }]);
  const save = library.setFavorite;
  let finishSave!: (result: FavoriteChangeResult) => void;
  library.setFavorite = () =>
    new Promise((resolve) => {
      finishSave = resolve;
    });
  await render(providers(<FavoritesScreen library={library} />));
  await fireEvent.press(await screen.findByRole('button', { name: 'Unfavorite Field Notes' }));
  const pending = screen.getByRole('button', { name: 'Unfavorite Field Notes' });
  expect(pending).toBeDisabled();
  expect(pending).toBeSelected();
  expect(screen.queryByText('No favorites yet')).toBeNull();
  await act(async () =>
    finishSave({
      status: 'error',
      error: {
        category: 'storage',
        message: 'Muse could not save this favorite. Please try again.',
      },
    }),
  );
  expect(
    screen.getByRole('alert', { name: 'Muse could not save this favorite. Please try again.' }),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Unfavorite Field Notes' })).toBeEnabled();
  expect(await library.list()).toEqual([{ ...fieldNotes, isFavorite: true }]);
  library.setFavorite = save;
  await fireEvent.press(screen.getByRole('button', { name: 'Unfavorite Field Notes' }));
  expect(await screen.findByText('No favorites yet')).toBeTruthy();
});

it('shows loading rather than an empty Favorites collection while its initial read is pending', async () => {
  const library = collection();
  let finishRead!: (rows: Publication[]) => void;
  library.list = () =>
    new Promise((resolve) => {
      finishRead = resolve;
    });
  await render(providers(<FavoritesScreen library={library} />));
  expect(screen.getByLabelText('Loading Favorites')).toBeTruthy();
  expect(screen.queryByText('No favorites yet')).toBeNull();
  await act(async () => finishRead([]));
  expect(screen.getByText('No favorites yet')).toBeTruthy();
  expect(screen.queryByLabelText('Loading Favorites')).toBeNull();
});
