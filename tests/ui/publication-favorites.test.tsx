import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type {
  FavoriteChangeResult,
  Publication,
  PublicationChange,
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
  const observers = new Set<(change?: PublicationChange) => void>();
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
    removeMany: async function (ids, { signal } = {}) {
      const results = [];
      for (const id of new Set(ids)) {
        if (signal?.aborted) break;
        results.push({ id, result: await this.remove(id) });
      }
      return results;
    },
    remove: async (id) => {
      rows = rows.filter((row) => row.id !== id);
      for (const observer of observers) observer({ kind: 'removed', id });
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
  if (Platform.OS === 'ios')
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Please retry this rename.',
    );
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

it('does not restore a publication removed while its import batch is still finishing', async () => {
  const library = collection([]);
  let finishBatch!: () => void;
  const result = {
    index: 0,
    sourceFilename: fieldNotes.sourceFilename,
    result: { status: 'imported' as const, publication: fieldNotes },
  };
  library.importMany = async (options) => {
    options?.onProgress?.({ completed: 1, total: 2, file: result });
    await new Promise<void>((resolve) => {
      finishBatch = resolve;
    });
    return { status: 'completed', results: [result] };
  };
  await render(providers(<LibraryScreen library={library} />));
  await screen.findByText('Your library is empty');
  await fireEvent.press(screen.getByRole('button', { name: 'Import PDFs' }));
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Publication actions for Field Notes' }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Remove Field Notes' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm removal of Field Notes' }));
  expect(await screen.findByText('Your library is empty')).toBeTruthy();
  await act(async () => {
    finishBatch();
  });
  expect(screen.queryByText('Field Notes')).toBeNull();
  expect(screen.getByText('Your library is empty')).toBeTruthy();
});

it('does not restore a removed import when its durable change arrives before progress', async () => {
  const library = collection([]);
  let notify!: () => void;
  library.subscribe = (listener) => {
    notify = listener;
    return () => {};
  };
  const remove = library.remove;
  library.remove = async (id) => {
    const outcome = await remove(id);
    library.list = async () => [];
    return outcome;
  };
  let finishBatch!: () => void;
  const result = {
    index: 0,
    sourceFilename: fieldNotes.sourceFilename,
    result: { status: 'imported' as const, publication: fieldNotes },
  };
  library.importMany = async (options) => {
    const existing = await library.list();
    // A durable import can notify its snapshot before cleanup lets it report progress.
    (library as { list(): Promise<Publication[]> }).list = async () => [...existing, fieldNotes];
    notify();
    await new Promise<void>((resolve) => {
      finishBatch = resolve;
    });
    options?.onProgress?.({ completed: 1, total: 1, file: result });
    return { status: 'completed', results: [result] };
  };
  await render(providers(<LibraryScreen library={library} />));
  await screen.findByText('Your library is empty');
  await fireEvent.press(screen.getByRole('button', { name: 'Import PDFs' }));
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Publication actions for Field Notes' }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Remove Field Notes' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm removal of Field Notes' }));
  await act(async () => {
    finishBatch();
  });
  expect(screen.queryByText('Field Notes')).toBeNull();
  expect(screen.getByText('Your library is empty')).toBeTruthy();
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

it('selects only matching results, confirms the count, and preserves hidden publications', async () => {
  const library = collection([
    fieldNotes,
    { ...fieldNotes, id: 'second', title: 'Field Guide' },
    { ...fieldNotes, id: 'hidden', title: 'Hidden Publication' },
  ]);
  await render(providers(<LibraryScreen library={library} />));
  await screen.findByText('Field Notes');
  await fireEvent.press(screen.getByRole('button', { name: 'Search Library' }));
  await fireEvent.changeText(screen.getByLabelText('Search Library titles'), 'field');
  await fireEvent.press(screen.getByRole('button', { name: 'Edit Library' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Select all visible publications' }));
  expect(screen.getByRole('checkbox', { name: /Field Notes/ })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: /Field Guide/ })).toBeChecked();
  await fireEvent.press(screen.getByRole('button', { name: 'Remove selected publications' }));
  expect(screen.getByText('Remove 2 publications?')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel removal' }));
  expect(await library.list()).toHaveLength(3);
  await fireEvent.press(screen.getByRole('button', { name: 'Remove selected publications' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm removal of 2 publications' }));
  await screen.findByText('No matching publications');
  expect((await library.list()).map((row) => row.id)).toEqual(['hidden']);
});

it('prunes hidden selections when search changes and cancels selection without removing anything', async () => {
  const library = collection([fieldNotes, { ...fieldNotes, id: 'guide', title: 'Travel Guide' }]);
  await render(providers(<LibraryScreen library={library} />));
  await screen.findByText('Field Notes');
  await fireEvent.press(screen.getByRole('button', { name: 'Edit Library' }));
  await fireEvent.press(screen.getByRole('checkbox', { name: /Field Notes/ }));
  expect(screen.getByText('1 selected')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Search Library' }));
  await fireEvent.changeText(screen.getByLabelText('Search Library titles'), 'travel');
  expect(screen.getByText('0 selected')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Remove selected publications' })).toBeDisabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel search' }));
  expect(screen.getByRole('checkbox', { name: /Field Notes/ })).not.toBeChecked();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel selection' }));
  expect(screen.queryByRole('checkbox', { name: /Field Notes/ })).toBeNull();
  expect(await library.list()).toHaveLength(2);
});

it('reports partial removal and retains failed selections for retry', async () => {
  const library = collection([fieldNotes, { ...fieldNotes, id: 'other', title: 'Other Notes' }]);
  const remove = library.remove;
  let fail = true;
  library.remove = async (id) =>
    id === fieldNotes.id && fail
      ? { status: 'error', error: { category: 'storage', message: 'Please try again.' } }
      : remove(id);
  await render(providers(<LibraryScreen library={library} />));
  await screen.findByText('Field Notes');
  await fireEvent.press(screen.getByRole('button', { name: 'Edit Library' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Select all visible publications' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Remove selected publications' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm removal of 2 publications' }));
  expect(
    await screen.findByText(
      '1 publication removed. 1 could not be removed. They remain selected; try again.',
    ),
  ).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: /Field Notes/ })).toBeChecked();
  expect(screen.queryByText('Other Notes')).toBeNull();
  fail = false;
  await fireEvent.press(screen.getByRole('button', { name: 'Remove selected publications' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Confirm removal of 1 publication' }));
  expect(await screen.findByText('Your library is empty')).toBeTruthy();
});

it('shows up to three Recent publications and changes All publications title ordering', async () => {
  const rows = ['Alpha', 'Beta', 'Gamma', 'Delta'].map((title, index) => ({
    ...fieldNotes,
    id: title,
    title,
    lastOpenedAt: `2026-10-0${index + 1}T00:00:00.000Z`,
  }));
  const library = collection([...rows, fieldNotes]);
  await render(providers(<LibraryScreen library={library} />));
  await screen.findByText('Recent');
  expect(screen.getAllByText('Delta')).toHaveLength(2);
  expect(screen.getAllByText('Gamma')).toHaveLength(2);
  expect(screen.getAllByText('Beta')).toHaveLength(2);
  expect(screen.getAllByText('Alpha')).toHaveLength(1);
  expect(screen.getAllByText('Field Notes')).toHaveLength(1);
  await fireEvent.press(screen.getByRole('button', { name: 'Sort publications' }));
  expect(screen.getByRole('radio', { name: 'Recently imported' })).toBeChecked();
  await fireEvent.press(screen.getByRole('radio', { name: 'Title Z–A' }));
  expect(screen.getByRole('button', { name: 'Sort publications' })).toHaveAccessibilityValue({
    text: 'Title Z–A',
  });
  const labels = screen
    .getAllByRole('button', { name: /^Favorite / })
    .map((row) => row.props.accessibilityLabel);
  expect(labels.slice(3)).toEqual([
    'Favorite Gamma',
    'Favorite Field Notes',
    'Favorite Delta',
    'Favorite Beta',
    'Favorite Alpha',
  ]);
});

it('allows selection directly in the native Search collection', async () => {
  const library = collection([fieldNotes, { ...fieldNotes, id: 'hidden', title: 'Hidden' }]);
  await render(providers(<LibraryScreen library={library} searchOnly searchQuery="field" />));
  await screen.findByText('Field Notes');
  await fireEvent.press(screen.getByRole('button', { name: 'Edit Library' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Select all visible publications' }));
  expect(screen.getByRole('checkbox', { name: /Field Notes/ })).toBeChecked();
  expect(screen.queryByRole('checkbox', { name: /Hidden/ })).toBeNull();
});

it('disables expanded sort choices when the Library becomes unavailable', async () => {
  const library = collection();
  await render(providers(<LibraryScreen library={library} />));
  await screen.findByText('Field Notes');
  await fireEvent.press(screen.getByRole('button', { name: 'Sort publications' }));
  library.list = async () => {
    throw new Error('Unavailable');
  };
  await act(async () => {
    await library.rename(fieldNotes.id, fieldNotes.title);
  });
  await screen.findByRole('button', { name: 'Retry loading Library' });
  expect(screen.getByRole('radio', { name: 'Title A–Z' })).toBeDisabled();
});

it.each(['stop', 'unmount'] as const)(
  'cancels pending bulk removal on %s without starting the next publication',
  async (exit) => {
    const library = collection([fieldNotes, { ...fieldNotes, id: 'other', title: 'Other Notes' }]);
    const remove = library.remove;
    let finishCurrent: () => void = () => {};
    const removedIds: string[] = [];
    library.remove = async (id) => {
      removedIds.push(id);
      await new Promise<void>((resolve) => {
        finishCurrent = resolve;
      });
      return remove(id);
    };
    const rendered = await render(providers(<LibraryScreen library={library} />));
    await screen.findByText('Field Notes');
    await fireEvent.press(screen.getByRole('button', { name: 'Edit Library' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Select all visible publications' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Remove selected publications' }));
    await fireEvent.press(
      screen.getByRole('button', { name: 'Confirm removal of 2 publications' }),
    );
    if (exit === 'stop')
      await fireEvent.press(screen.getByRole('button', { name: 'Stop removal' }));
    else await rendered.unmount();
    await act(async () => {
      finishCurrent();
    });
    expect(removedIds).toEqual(['field-notes']);
    expect((await library.list()).map((row) => row.id)).toEqual(['other']);
    if (exit === 'stop') {
      expect(
        await screen.findByText('1 publication removed. 1 not processed. They remain selected.'),
      ).toBeTruthy();
      expect(screen.getByRole('checkbox', { name: /Other Notes/ })).toBeChecked();
      expect(screen.queryByRole('button', { name: 'Stop removal' })).toBeNull();
      library.remove = remove;
      await fireEvent.press(screen.getByRole('button', { name: 'Remove selected publications' }));
      await fireEvent.press(
        screen.getByRole('button', { name: 'Confirm removal of 1 publication' }),
      );
      expect(await screen.findByText('Your library is empty')).toBeTruthy();
    }
  },
);
