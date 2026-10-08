import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { installAppLibrary } from '@/features/library/app-library';
import type {
  ImportResult,
  Publication,
  PublicationLibrary,
} from '@/features/library/publication-library';
import { LibraryScreen } from '@/screens/library-screen';
import { createInMemoryPreferenceStore } from '@/testing/in-memory-preference-store';
import { ThemeProvider } from '@/theme/theme-provider';
import { ToastProvider } from '@/ui/toast';

// Exercise the supported non-glass controls; native glass presentation is checked on simulator.
jest.mock('@/theme/glass-capability', () => ({ detectTabBarKind: () => 'fallback' }));

const favoriteActions: Pick<
  PublicationLibrary,
  'subscribe' | 'setFavorite' | 'rename' | 'remove' | 'removeMany'
> = {
  rename: async () => ({
    status: 'error',
    error: { category: 'storage', message: 'Rename unavailable in this import adapter.' },
  }),
  removeMany: async function (ids) {
    const results = [];
    for (const id of new Set(ids)) results.push({ id, result: await this.remove(id) });
    return results;
  },
  remove: async () => ({
    status: 'error',
    error: { category: 'storage', message: 'Removal unavailable in this import adapter.' },
  }),
  subscribe: () => () => {},
  setFavorite: async () => ({
    status: 'error',
    error: {
      category: 'storage',
      message: 'Favorite changes are unavailable in this import adapter.',
    },
  }),
};

const publication: Publication = {
  isFavorite: false,
  id: 'publication-1',
  title: 'Field Notes',
  sourceFilename: 'Field Notes.pdf',
  byteSize: 1024,
  pageCount: 2,
  fingerprint: 'a'.repeat(64),
  importedAt: '2026-09-30T02:00:00.000Z',
  lastOpenedAt: null,
  readingPosition: null,
  ownedPath: 'publications/publication-1.pdf',
};

const second: Publication = {
  ...publication,
  id: 'publication-2',
  title: 'Travel Logs',
  sourceFilename: 'Travel Logs.pdf',
  fingerprint: 'b'.repeat(64),
  ownedPath: 'publications/publication-2.pdf',
};

const damaged: ImportResult = {
  status: 'error',
  error: { category: 'corrupt', message: 'Choose another copy of this PDF to import.' },
};

// Expo Router supplies the safe area in the app; tests provide fixed phone metrics instead.
const phone = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function withProviders(ui: ReactNode, store = createInMemoryPreferenceStore()) {
  return (
    <SafeAreaProvider initialMetrics={phone}>
      <ThemeProvider store={store}>
        <ToastProvider>{ui}</ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** A Library whose single-file import settles with `result`. */
function libraryImporting(result: ImportResult): PublicationLibrary {
  return {
    ...favoriteActions,
    list: async () => [],
    importOne: async () => result,
    importMany: async () => ({
      status: 'completed',
      results: [{ index: 0, sourceFilename: publication.sourceFilename, result }],
    }),
  };
}

function fileResult(index: number, sourceFilename: string, result: ImportResult) {
  return { index, sourceFilename, result };
}

it('waits for the initial Library snapshot before accepting an import', async () => {
  let finishListing!: (rows: Publication[]) => void;
  const importOne = jest.fn(async () => ({ status: 'imported' as const, publication }));
  const library: PublicationLibrary = {
    ...favoriteActions,
    importMany: async () => {
      const result = await library.importOne();
      return {
        status: 'completed',
        results: [{ index: 0, sourceFilename: publication.sourceFilename, result }],
      };
    },
    list: () =>
      new Promise((resolve) => {
        finishListing = resolve;
      }),
    importOne,
  };
  await render(withProviders(<LibraryScreen library={library} />));
  const action = screen.getByRole('button', { name: 'Import PDFs' });
  expect(action).toBeDisabled();
  await fireEvent.press(action);
  expect(importOne).not.toHaveBeenCalled();
  await act(async () => finishListing([]));
  expect(screen.getByRole('button', { name: 'Import PDFs' })).toBeEnabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Import PDFs' }));
  expect(await screen.findByText('Field Notes')).toBeTruthy();
});

it('keeps import disabled when the initial Library snapshot is unavailable', async () => {
  const importOne = jest.fn(async () => ({ status: 'duplicate' as const, publication }));
  const library: PublicationLibrary = {
    ...favoriteActions,
    importMany: async () => {
      const result = await library.importOne();
      return {
        status: 'completed',
        results: [{ index: 0, sourceFilename: publication.sourceFilename, result }],
      };
    },
    list: async () => {
      throw new Error('database temporarily unavailable');
    },
    importOne,
  };
  await render(withProviders(<LibraryScreen library={library} />));
  expect(
    await screen.findByText('Muse could not load the Library. Reopen the app and try again.'),
  ).toBeTruthy();
  const action = screen.getByRole('button', { name: 'Import PDFs' });
  expect(action).toBeDisabled();
  await fireEvent.press(action);
  expect(importOne).not.toHaveBeenCalled();
  expect(screen.queryByText('Your library is empty')).toBeNull();
});

it('offers an accessible import action and shows durable publication metadata', async () => {
  let publications: Publication[] = [];
  const library: PublicationLibrary = {
    ...favoriteActions,
    importMany: async () => {
      const result = await library.importOne();
      return {
        status: 'completed',
        results: [{ index: 0, sourceFilename: publication.sourceFilename, result }],
      };
    },
    list: async () => publications,
    importOne: async () => {
      publications = [publication];
      return { status: 'imported', publication };
    },
  };
  await render(withProviders(<LibraryScreen library={library} />));

  const importAction = await screen.findByRole('button', { name: 'Import PDFs' });
  expect(screen.getByText('Your library is empty')).toBeTruthy();
  await fireEvent.press(importAction);

  expect(await screen.findByText('Field Notes')).toBeTruthy();
  expect(screen.getByText(/2 pages/)).toBeTruthy();
  expect(screen.queryByText('Your library is empty')).toBeNull();
});

it('shows a successful import from its returned record without requiring another Library read', async () => {
  let listCalls = 0;
  const library: PublicationLibrary = {
    ...favoriteActions,
    importMany: async () => {
      const result = await library.importOne();
      return {
        status: 'completed',
        results: [{ index: 0, sourceFilename: publication.sourceFilename, result }],
      };
    },
    list: async () => {
      listCalls += 1;
      if (listCalls > 1) throw new Error('database temporarily unavailable');
      return [];
    },
    importOne: async () => ({ status: 'imported', publication }),
  };
  await render(withProviders(<LibraryScreen library={library} />));

  await fireEvent.press(await screen.findByRole('button', { name: 'Import PDFs' }));
  expect(await screen.findByText('Field Notes')).toBeTruthy();
  expect(screen.getByText('Field Notes was imported.')).toBeTruthy();
});

it('filters displayed titles case-insensitively and restores publications when cleared', async () => {
  const travel = {
    ...publication,
    id: 'publication-2',
    title: 'Travel Logs',
    sourceFilename: 'FIELD.pdf',
  };
  const library: PublicationLibrary = {
    ...favoriteActions,
    list: async () => [publication, travel],
    importOne: async () => ({ status: 'cancelled' }),
    importMany: async () => ({ status: 'cancelled', results: [] }),
  };
  const store = createInMemoryPreferenceStore();
  const view = (query: string) =>
    withProviders(<LibraryScreen library={library} searchQuery={query} searchOnly />, store);
  const rendered = await render(view(' FIELD '));
  expect(await screen.findByText('Field Notes')).toBeTruthy();
  expect(screen.queryByText('Travel Logs')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Import PDFs' })).toBeNull();
  await rendered.rerender(view('missing'));
  expect(await screen.findByText('No matching publications')).toBeTruthy();
  expect(screen.queryByText('Your library is empty')).toBeNull();
  await rendered.rerender(view(''));
  expect(await screen.findByText('Travel Logs')).toBeTruthy();
  expect(screen.getByText('Field Notes')).toBeTruthy();
});

it('opens fallback Library search, filters as typed, and cancels without changing the Library', async () => {
  const library: PublicationLibrary = {
    ...favoriteActions,
    list: async () => [publication],
    importOne: async () => ({ status: 'cancelled' }),
    importMany: async () => ({ status: 'cancelled', results: [] }),
  };
  await render(withProviders(<LibraryScreen library={library} />));
  expect(await screen.findByText('Field Notes')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Edit Library' })).toBeEnabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Search Library' }));
  expect(screen.queryByRole('header', { name: 'Library' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Search Library' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Import PDFs' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Edit Library' })).toBeNull();
  await fireEvent.changeText(screen.getByLabelText('Search Library titles'), 'missing');
  expect(screen.getByText('No matching publications')).toBeTruthy();
  expect(screen.queryByText('Field Notes')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel search' }));
  expect(screen.getByText('Field Notes')).toBeTruthy();
  expect(screen.queryByLabelText('Search Library titles')).toBeNull();
  expect(screen.getByRole('header', { name: 'Library' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Search Library' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Import PDFs' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Edit Library' })).toBeEnabled();
});

it('renders the Library and Search screens from the one installed app Library', async () => {
  const list = jest.fn(async () => [publication]);
  installAppLibrary({
    ...favoriteActions,
    list,
    importOne: async () => ({ status: 'cancelled' }),
    importMany: async () => ({ status: 'cancelled', results: [] }),
  });
  await render(
    withProviders(
      <>
        <LibraryScreen />
        <LibraryScreen searchOnly searchQuery="field" />
      </>,
    ),
  );
  expect(await screen.findAllByText('Field Notes')).toHaveLength(2);
  expect(list).toHaveBeenCalledTimes(2);
});

it.each([
  ['imported', { status: 'imported', publication } as ImportResult, 'Field Notes was imported.'],
  [
    'a duplicate',
    { status: 'duplicate', publication } as ImportResult,
    'Already in Library. Your existing publication is unchanged.',
  ],
  ['a damaged PDF', damaged, 'Choose another copy of this PDF to import.'],
])('reports %s in an announced toast and keeps Import available', async (_name, result, text) => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  await render(withProviders(<LibraryScreen library={libraryImporting(result)} />));
  await fireEvent.press(await screen.findByRole('button', { name: 'Import PDFs' }));
  expect(within(await screen.findByRole('alert')).getByText(text)).toBeTruthy();
  expect(announce).toHaveBeenCalledWith(text);
  expect(screen.getByRole('button', { name: 'Import PDFs' })).toBeEnabled();
  announce.mockRestore();
});

it('shows no loading, progress, results or Cancel control while Files and the copy are active', async () => {
  let finish!: () => void;
  const library: PublicationLibrary = {
    ...favoriteActions,
    list: async () => [],
    importOne: async () => ({ status: 'cancelled' }),
    importMany: async (options) => {
      options?.onProgress?.({ completed: 0, total: 2 });
      options?.onProgress?.({
        completed: 1,
        total: 2,
        file: fileResult(0, 'Field Notes.pdf', { status: 'imported', publication }),
      });
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return {
        status: 'completed',
        results: [
          fileResult(0, 'Field Notes.pdf', { status: 'imported', publication }),
          fileResult(1, 'Travel Logs.pdf', { status: 'imported', publication: second }),
        ],
      };
    },
  };
  await render(withProviders(<LibraryScreen library={library} />));
  await fireEvent.press(await screen.findByRole('button', { name: 'Import PDFs' }));
  expect(await screen.findByText('Field Notes')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Import PDFs' })).toBeDisabled();
  expect(screen.queryByText('Selecting PDFs…')).toBeNull();
  expect(screen.queryByText(/files completed/)).toBeNull();
  expect(screen.queryByText('Import results')).toBeNull();
  expect(screen.queryByRole('button', { name: /Cancel/ })).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  await act(async () => finish());
  expect(within(await screen.findByRole('alert')).getByText('Imported 2 PDFs.')).toBeTruthy();
  expect(screen.getByText('Travel Logs')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Import PDFs' })).toBeEnabled();
});

it('summarizes mixed outcomes in one error toast with the first actionable failure', async () => {
  const library: PublicationLibrary = {
    ...favoriteActions,
    list: async () => [],
    importOne: async () => ({ status: 'cancelled' }),
    importMany: async () => ({
      status: 'completed',
      results: [
        fileResult(0, 'Field Notes.pdf', { status: 'imported', publication }),
        fileResult(1, 'Damaged.pdf', damaged),
        fileResult(2, 'Notes copy.pdf', { status: 'duplicate', publication }),
      ],
    }),
  };
  await render(withProviders(<LibraryScreen library={library} />));
  await fireEvent.press(await screen.findByRole('button', { name: 'Import PDFs' }));
  expect(
    within(await screen.findByRole('alert')).getByText(
      'Imported 1, 1 already in Library, 1 failed. Choose another copy of this PDF to import.',
    ),
  ).toBeTruthy();
  expect(screen.queryByText('Import results')).toBeNull();
  expect(screen.queryByText('Notes copy.pdf')).toBeNull();
  expect(screen.getAllByText('Field Notes')).toHaveLength(1);
});

it('reports several failed files in one toast', async () => {
  const library: PublicationLibrary = {
    ...favoriteActions,
    list: async () => [],
    importOne: async () => ({ status: 'cancelled' }),
    importMany: async () => ({
      status: 'completed',
      results: [fileResult(0, 'One.pdf', damaged), fileResult(1, 'Two.pdf', damaged)],
    }),
  };
  await render(withProviders(<LibraryScreen library={library} />));
  await fireEvent.press(await screen.findByRole('button', { name: 'Import PDFs' }));
  expect(
    within(await screen.findByRole('alert')).getByText(
      '2 PDFs could not be imported. Choose another copy of this PDF to import.',
    ),
  ).toBeTruthy();
});

it('shows a picker failure in an error toast and shows nothing when Files is dismissed', async () => {
  const failing: PublicationLibrary = {
    ...favoriteActions,
    list: async () => [],
    importOne: async () => ({ status: 'cancelled' }),
    importMany: async () => ({
      status: 'error',
      error: { category: 'permissionDenied', message: 'Muse could not open Files.' },
    }),
  };
  const first = await render(withProviders(<LibraryScreen library={failing} />));
  await fireEvent.press(await screen.findByRole('button', { name: 'Import PDFs' }));
  expect(
    within(await screen.findByRole('alert')).getByText('Muse could not open Files.'),
  ).toBeTruthy();
  await first.unmount();

  const dismissed: PublicationLibrary = {
    ...favoriteActions,
    list: async () => [],
    importOne: async () => ({ status: 'cancelled' }),
    importMany: async () => ({ status: 'cancelled', results: [] }),
  };
  await render(withProviders(<LibraryScreen library={dismissed} />));
  await fireEvent.press(await screen.findByRole('button', { name: 'Import PDFs' }));
  expect(await screen.findByRole('button', { name: 'Import PDFs' })).toBeEnabled();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('dismisses the toast on tap and after five seconds', async () => {
  jest.useFakeTimers();
  try {
    await render(
      withProviders(
        <LibraryScreen library={libraryImporting({ status: 'imported', publication })} />,
      ),
    );
    await fireEvent.press(await screen.findByRole('button', { name: 'Import PDFs' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.queryByRole('alert')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Import PDFs' }));
    await fireEvent.press(await screen.findByRole('alert'));
    expect(screen.queryByRole('alert')).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

it('requests cancellation on unmount and ignores late screen results', async () => {
  let finish!: () => void;
  let signal: AbortSignal | undefined;
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  const library: PublicationLibrary = {
    ...favoriteActions,
    list: async () => [],
    importOne: async () => ({ status: 'cancelled' }),
    importMany: async (options) => {
      signal = options?.signal;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return {
        status: 'completed',
        results: [fileResult(0, 'Field Notes.pdf', { status: 'imported', publication })],
      };
    },
  };
  const view = (shown: boolean) =>
    withProviders(shown ? <LibraryScreen library={library} /> : null);
  const rendered = await render(view(true));
  await fireEvent.press(await screen.findByRole('button', { name: 'Import PDFs' }));
  await rendered.rerender(view(false));
  expect(signal?.aborted).toBe(true);
  announce.mockClear();
  await act(async () => finish());
  expect(announce).not.toHaveBeenCalled();
  expect(screen.queryByRole('alert')).toBeNull();
  announce.mockRestore();
});
