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
    rename: async (id, title) => {
      const existing = rows.find((row) => row.id === id);
      if (!existing) throw new Error('Unknown fixture');
      const publication = { ...existing, title: title.trim() };
      rows = rows.map((row) => (row.id === id ? publication : row));
      for (const observer of observers) observer();
      return { status: 'saved', publication };
    },
    remove: async (id) => {
      rows = rows.filter((row) => row.id !== id);
      for (const observer of observers) observer();
      return { status: 'removed', cleanupPending: false };
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

it('offers a labeled three-dot menu and renames a title across Library and Favorites', async () => {
  const library = collection([{ ...fieldNotes, isFavorite: true }]);
  await render(
    providers(
      <>
        <LibraryScreen library={library} />
        <FavoritesScreen library={library} />
      </>,
    ),
  );
  const menus = await screen.findAllByRole('button', {
    name: 'Publication actions for Field Notes',
  });
  await fireEvent.press(menus[0]);
  await fireEvent.press(screen.getByRole('button', { name: 'Rename Field Notes' }));
  await fireEvent.changeText(screen.getByLabelText('Publication title'), 'Research notes');
  await fireEvent.press(screen.getByRole('button', { name: 'Save title' }));
  expect(await screen.findAllByText('Research notes')).toHaveLength(2);
  expect(await library.list()).toEqual([
    { ...fieldNotes, isFavorite: true, title: 'Research notes' },
  ]);
});

it('identifies one publication for removal, preserves it on cancel, and updates both collections on confirmation', async () => {
  const other = { ...fieldNotes, id: 'other', title: 'Other notes' };
  const library = collection([{ ...fieldNotes, isFavorite: true }, other]);
  await render(
    providers(
      <>
        <LibraryScreen library={library} />
        <FavoritesScreen library={library} />
      </>,
    ),
  );
  let menus = await screen.findAllByRole('button', { name: 'Publication actions for Field Notes' });
  await fireEvent.press(menus[1]);
  await fireEvent.press(screen.getByRole('button', { name: 'Remove Field Notes' }));
  expect(screen.getByRole('header', { name: 'Remove one publication?' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Confirm removal of Field Notes' })).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel removal' }));
  expect(await library.list()).toHaveLength(2);
  menus = screen.getAllByRole('button', { name: 'Publication actions for Field Notes' });
  await fireEvent.press(menus[0]);
  await fireEvent.press(screen.getByRole('button', { name: 'Remove Field Notes' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm removal of Field Notes' }));
  expect(await screen.findByText('No favorites yet')).toBeTruthy();
  expect(screen.queryByText('Field Notes')).toBeNull();
  expect(screen.getByText('Other notes')).toBeTruthy();
  expect(await library.list()).toEqual([other]);
});

it('retains a rename draft on failure and disables submission while a retry is pending', async () => {
  const library = collection();
  const save = library.rename;
  let succeed!: () => void;
  let attempt = 0;
  library.rename = async (id, title) => {
    if (++attempt === 1)
      return {
        status: 'error',
        error: { category: 'storage', message: 'Please retry this rename.' },
      };
    await new Promise<void>((resolve) => {
      succeed = resolve;
    });
    return save(id, title);
  };
  await render(providers(<LibraryScreen library={library} />));
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Publication actions for Field Notes' }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Rename Field Notes' }));
  await fireEvent.changeText(screen.getByLabelText('Publication title'), 'Draft title');
  await fireEvent.press(screen.getByRole('button', { name: 'Save title' }));
  expect(await screen.findByText('Please retry this rename.')).toBeTruthy();
  expect(screen.getByLabelText('Publication title')).toHaveDisplayValue('Draft title');
  await fireEvent.press(screen.getByRole('button', { name: 'Save title' }));
  expect(screen.getByRole('button', { name: 'Save title' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel rename' })).toBeDisabled();
  await act(async () => {
    succeed();
  });
  expect(await screen.findByText('Draft title')).toBeTruthy();
  expect(screen.queryByLabelText('Publication title')).toBeNull();
});

it('keeps the publication and confirmation after a failed removal, then permits a retry', async () => {
  const library = collection();
  const remove = library.remove;
  let fails = true;
  library.remove = async (id) =>
    fails
      ? { status: 'error', error: { category: 'storage', message: 'Please retry this removal.' } }
      : remove(id);
  await render(providers(<LibraryScreen library={library} />));
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Publication actions for Field Notes' }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Remove Field Notes' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm removal of Field Notes' }));
  expect(await screen.findByText('Please retry this removal.')).toBeTruthy();
  expect(await library.list()).toEqual([fieldNotes]);
  fails = false;
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm removal of Field Notes' }));
  expect(await screen.findByText('Your library is empty')).toBeTruthy();
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
  const list = library.list;
  library.list = async () => {
    if (++reads === 1) return [fieldNotes];
    if (reads > 2) return list();
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

it('retains another publication favorite when a local save overtakes its collection refresh', async () => {
  const library = collection([
    { ...fieldNotes, isFavorite: true },
    { ...fieldNotes, id: 'travel', title: 'Travel Logs' },
  ]);
  const list = library.list;
  let reads = 0;
  const pending: (() => void)[] = [];
  library.list = async () => {
    const rows = await list();
    if (++reads === 1) return rows;
    return new Promise((resolve) => {
      pending.push(() => resolve(rows));
    });
  };
  await render(providers(<FavoritesScreen library={library} />));
  expect(await screen.findByText('Field Notes')).toBeTruthy();
  await act(async () => {
    await library.setFavorite('travel', true);
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Unfavorite Field Notes' }));
  await act(async () => {
    for (const finish of pending) finish();
  });
  expect(await screen.findByRole('button', { name: 'Unfavorite Travel Logs' })).toBeSelected();
  expect(screen.queryByText('No favorites yet')).toBeNull();
  expect(await list()).toMatchObject([
    { id: 'field-notes', isFavorite: false },
    { id: 'travel', isFavorite: true },
  ]);
});

it('retains another screen favorite change when importing overtakes pending snapshots', async () => {
  const library = collection();
  let rows = [fieldNotes];
  const observers = new Set<() => void>();
  const pending: (() => void)[] = [];
  let reads = 0;
  library.subscribe = (listener) => {
    observers.add(listener);
    return () => observers.delete(listener);
  };
  library.list = async () => {
    const snapshot = rows;
    if (++reads === 1) return snapshot;
    return new Promise((resolve) => {
      pending.push(() => resolve(snapshot));
    });
  };
  library.setFavorite = async (id, isFavorite) => {
    const publication = { ...fieldNotes, id, isFavorite };
    rows = rows.map((row) => (row.id === id ? publication : row));
    for (const observer of observers) observer();
    return { status: 'saved', publication };
  };
  library.importMany = async (options) => {
    const publication = { ...fieldNotes, id: 'travel', title: 'Travel Logs' };
    rows = [...rows, publication];
    for (const observer of observers) observer();
    const file = {
      index: 0,
      sourceFilename: 'Travel.pdf',
      result: { status: 'imported' as const, publication },
    };
    options?.onProgress?.({ completed: 1, total: 1, file });
    return { status: 'completed', results: [file] };
  };
  await render(providers(<LibraryScreen library={library} />));
  expect(await screen.findByText('Field Notes')).toBeTruthy();
  await act(async () => {
    await library.setFavorite('field-notes', true);
  });
  await fireEvent.press(screen.getByRole('button', { name: 'Import PDFs' }));
  await act(async () => {
    for (const finish of pending) finish();
  });
  expect(await screen.findByRole('button', { name: 'Unfavorite Field Notes' })).toBeSelected();
  expect(screen.getByText('Travel Logs')).toBeTruthy();
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

it('finishes a loading retry when the last favorite is removed before the retry settles', async () => {
  const library = collection([{ ...fieldNotes, isFavorite: true }]);
  const list = library.list;
  const subscribe = library.subscribe;
  let refresh!: () => void;
  library.subscribe = (listener) => {
    refresh = listener;
    return subscribe(listener);
  };
  let unavailable = false;
  let deferred = false;
  const pending: (() => void)[] = [];
  library.list = async () => {
    if (unavailable) throw new Error('storage offline');
    const snapshot = await list();
    if (!deferred) return snapshot;
    return new Promise((resolve) => {
      pending.push(() => resolve(snapshot));
    });
  };
  await render(providers(<FavoritesScreen library={library} />));
  expect(await screen.findByText('Field Notes')).toBeTruthy();
  unavailable = true;
  await act(async () => refresh());
  expect(await screen.findByRole('button', { name: 'Retry loading Favorites' })).toBeTruthy();
  unavailable = false;
  deferred = true;
  await fireEvent.press(screen.getByRole('button', { name: 'Retry loading Favorites' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Unfavorite Field Notes' }));
  await act(async () => {
    for (const finish of pending) finish();
  });
  expect(await screen.findByText('No favorites yet')).toBeTruthy();
  expect(screen.queryByLabelText('Loading Favorites')).toBeNull();
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
