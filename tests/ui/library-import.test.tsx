import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import type { Publication, PublicationLibrary } from '@/features/library/publication-library';
import { LibraryScreen } from '@/screens/library-screen';
import { createInMemoryPreferenceStore } from '@/testing/in-memory-preference-store';
import { ThemeProvider } from '@/theme/theme-provider';

const publication: Publication = {
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

it('waits for the initial Library snapshot before accepting an import', async () => {
  let finishListing!: (rows: Publication[]) => void;
  const importOne = jest.fn(async () => ({ status: 'imported' as const, publication }));
  const library: PublicationLibrary = {
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
  await render(
    <ThemeProvider store={createInMemoryPreferenceStore()}>
      <LibraryScreen library={library} />
    </ThemeProvider>,
  );
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
  await render(
    <ThemeProvider store={createInMemoryPreferenceStore()}>
      <LibraryScreen library={library} />
    </ThemeProvider>,
  );
  expect(
    await screen.findByText('Muse could not load the Library. Reopen the app and try again.'),
  ).toBeTruthy();
  const action = screen.getByRole('button', { name: 'Import PDFs' });
  expect(action).toBeDisabled();
  await fireEvent.press(action);
  expect(importOne).not.toHaveBeenCalled();
  expect(screen.queryByText('Your library is empty')).toBeNull();
});

it('announces the imported publication to iOS VoiceOver', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  const library: PublicationLibrary = {
    importMany: async () => {
      const result = await library.importOne();
      return {
        status: 'completed',
        results: [{ index: 0, sourceFilename: publication.sourceFilename, result }],
      };
    },
    list: async () => [],
    importOne: async () => ({ status: 'imported', publication }),
  };
  await render(
    <ThemeProvider store={createInMemoryPreferenceStore()}>
      <LibraryScreen library={library} />
    </ThemeProvider>,
  );
  await fireEvent.press(await screen.findByRole('button', { name: 'Import PDFs' }));
  expect(await screen.findByText('Field Notes was imported.')).toBeTruthy();
  expect(announce).toHaveBeenCalledWith('Field Notes was imported.');
  announce.mockRestore();
});

it('offers an accessible import action and shows durable publication metadata', async () => {
  let publications: Publication[] = [];
  const library: PublicationLibrary = {
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
  await render(
    <ThemeProvider store={createInMemoryPreferenceStore()}>
      <LibraryScreen library={library} />
    </ThemeProvider>,
  );

  const importAction = await screen.findByRole('button', { name: 'Import PDFs' });
  expect(screen.getByText('Your library is empty')).toBeTruthy();
  await fireEvent.press(importAction);

  expect(await screen.findByText('Field Notes')).toBeTruthy();
  expect(screen.getByText(/2 pages/)).toBeTruthy();
  expect(screen.queryByText('Your library is empty')).toBeNull();
});

it('shows an actionable error and retains the import action after a corrupt PDF', async () => {
  const library: PublicationLibrary = {
    importMany: async () => {
      const result = await library.importOne();
      return {
        status: 'completed',
        results: [{ index: 0, sourceFilename: publication.sourceFilename, result }],
      };
    },
    list: async () => [],
    importOne: async () => ({
      status: 'error',
      error: { category: 'corrupt', message: 'This file is damaged and cannot be read.' },
    }),
  };
  await render(
    <ThemeProvider store={createInMemoryPreferenceStore()}>
      <LibraryScreen library={library} />
    </ThemeProvider>,
  );

  await fireEvent.press(await screen.findByRole('button', { name: 'Import PDFs' }));
  expect(await screen.findByText('This file is damaged and cannot be read.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Import PDFs' })).toBeTruthy();
  expect(screen.getByText('Your library is empty')).toBeTruthy();
});

it('shows a successful import from its returned record without requiring another Library read', async () => {
  let listCalls = 0;
  const library: PublicationLibrary = {
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
  await render(
    <ThemeProvider store={createInMemoryPreferenceStore()}>
      <LibraryScreen library={library} />
    </ThemeProvider>,
  );

  await fireEvent.press(await screen.findByRole('button', { name: 'Import PDFs' }));
  expect(await screen.findByText('Field Notes')).toBeTruthy();
  expect(screen.getByText('Field Notes was imported.')).toBeTruthy();
});

it('shows completed-file progress and independent mixed results while retaining successful publications', async () => {
  let finish!: () => void;
  let publish!: NonNullable<Parameters<PublicationLibrary['importMany']>[0]>['onProgress'];
  const library: PublicationLibrary = {
    list: async () => [],
    importOne: async () => ({ status: 'cancelled' }),
    importMany: async (options) => {
      publish = options?.onProgress;
      publish?.({ completed: 0, total: 3 });
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return {
        status: 'completed',
        results: [
          {
            index: 0,
            sourceFilename: 'Field Notes.pdf',
            result: { status: 'imported', publication },
          },
          {
            index: 1,
            sourceFilename: 'Damaged.pdf',
            result: {
              status: 'error',
              error: {
                category: 'corrupt',
                message: 'Choose another copy of this PDF to import.',
              },
            },
          },
          {
            index: 2,
            sourceFilename: 'Notes copy.pdf',
            result: { status: 'duplicate', publication },
          },
        ],
      };
    },
  };
  await render(
    <ThemeProvider store={createInMemoryPreferenceStore()}>
      <LibraryScreen library={library} />
    </ThemeProvider>,
  );
  await fireEvent.press(await screen.findByRole('button', { name: 'Import PDFs' }));
  expect(await screen.findByText('0 of 3 files completed')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Import PDFs' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel import' })).toBeEnabled();
  await act(async () =>
    publish?.({
      completed: 1,
      total: 3,
      file: {
        index: 0,
        sourceFilename: 'Field Notes.pdf',
        result: { status: 'imported', publication },
      },
    }),
  );
  expect(screen.getByText('1 of 3 files completed')).toBeTruthy();
  expect(screen.getByText('Field Notes')).toBeTruthy();
  await act(async () => finish());
  expect(await screen.findByText('Choose another copy of this PDF to import.')).toBeTruthy();
  expect(screen.getByText('Notes copy.pdf')).toBeTruthy();
  expect(
    screen.getByText('Already in Library. Your existing publication is unchanged.'),
  ).toBeTruthy();
  expect(screen.getAllByText('Field Notes')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Import PDFs' })).toBeEnabled();
});

it('cancels remaining work without losing a completed publication or hiding per-file outcomes', async () => {
  let finish!: () => void;
  let signal: AbortSignal | undefined;
  const library: PublicationLibrary = {
    list: async () => [],
    importOne: async () => ({ status: 'cancelled' }),
    importMany: async (options) => {
      signal = options?.signal;
      options?.onProgress?.({
        completed: 1,
        total: 2,
        file: {
          index: 0,
          sourceFilename: 'Field Notes.pdf',
          result: { status: 'imported', publication },
        },
      });
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return {
        status: 'cancelled',
        results: [
          {
            index: 0,
            sourceFilename: 'Field Notes.pdf',
            result: { status: 'imported', publication },
          },
          { index: 1, sourceFilename: 'Later.pdf', result: { status: 'cancelled' } },
        ],
      };
    },
  };
  await render(
    <ThemeProvider store={createInMemoryPreferenceStore()}>
      <LibraryScreen library={library} />
    </ThemeProvider>,
  );
  await fireEvent.press(await screen.findByRole('button', { name: 'Import PDFs' }));
  expect(await screen.findByText('Field Notes')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Cancel import' }));
  expect(signal?.aborted).toBe(true);
  expect(screen.getByRole('button', { name: 'Cancel import' })).toBeDisabled();
  await act(async () => finish());
  expect(await screen.findByText('Cancelled. This file was not imported.')).toBeTruthy();
  expect(
    screen.getByText('Import cancelled. Completed publications remain in Library.'),
  ).toBeTruthy();
  expect(screen.getAllByText('Field Notes')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Import PDFs' })).toBeEnabled();
});

it('requests cancellation on unmount and ignores late screen results', async () => {
  let finish!: () => void;
  let signal: AbortSignal | undefined;
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  const library: PublicationLibrary = {
    list: async () => [],
    importOne: async () => ({ status: 'cancelled' }),
    importMany: async (options) => {
      signal = options?.signal;
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return {
        status: 'completed',
        results: [
          {
            index: 0,
            sourceFilename: 'Field Notes.pdf',
            result: { status: 'imported', publication },
          },
        ],
      };
    },
  };
  const rendered = await render(
    <ThemeProvider store={createInMemoryPreferenceStore()}>
      <LibraryScreen library={library} />
    </ThemeProvider>,
  );
  await fireEvent.press(await screen.findByRole('button', { name: 'Import PDFs' }));
  await rendered.unmount();
  expect(signal?.aborted).toBe(true);
  announce.mockClear();
  await act(async () => finish());
  expect(announce).not.toHaveBeenCalled();
  announce.mockRestore();
});
