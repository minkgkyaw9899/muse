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
  const action = screen.getByRole('button', { name: 'Import PDF' });
  expect(action).toBeDisabled();
  await fireEvent.press(action);
  expect(importOne).not.toHaveBeenCalled();
  await act(async () => finishListing([]));
  expect(screen.getByRole('button', { name: 'Import PDF' })).toBeEnabled();
  await fireEvent.press(screen.getByRole('button', { name: 'Import PDF' }));
  expect(await screen.findByText('Field Notes')).toBeTruthy();
});

it('keeps import disabled when the initial Library snapshot is unavailable', async () => {
  const importOne = jest.fn(async () => ({ status: 'duplicate' as const, publication }));
  const library: PublicationLibrary = {
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
  const action = screen.getByRole('button', { name: 'Import PDF' });
  expect(action).toBeDisabled();
  await fireEvent.press(action);
  expect(importOne).not.toHaveBeenCalled();
  expect(screen.queryByText('Your library is empty')).toBeNull();
});

it('announces the imported publication to iOS VoiceOver', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  const library: PublicationLibrary = {
    list: async () => [],
    importOne: async () => ({ status: 'imported', publication }),
  };
  await render(
    <ThemeProvider store={createInMemoryPreferenceStore()}>
      <LibraryScreen library={library} />
    </ThemeProvider>,
  );
  await fireEvent.press(await screen.findByRole('button', { name: 'Import PDF' }));
  expect(await screen.findByText('Field Notes was imported.')).toBeTruthy();
  expect(announce).toHaveBeenCalledWith('Field Notes was imported.');
  announce.mockRestore();
});

it('offers an accessible import action and shows durable publication metadata', async () => {
  let publications: Publication[] = [];
  const library: PublicationLibrary = {
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

  const importAction = await screen.findByRole('button', { name: 'Import PDF' });
  expect(screen.getByText('Your library is empty')).toBeTruthy();
  await fireEvent.press(importAction);

  expect(await screen.findByText('Field Notes')).toBeTruthy();
  expect(screen.getByText(/2 pages/)).toBeTruthy();
  expect(screen.queryByText('Your library is empty')).toBeNull();
});

it('shows an actionable error and retains the import action after a corrupt PDF', async () => {
  const library: PublicationLibrary = {
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

  await fireEvent.press(await screen.findByRole('button', { name: 'Import PDF' }));
  expect(await screen.findByText('This file is damaged and cannot be read.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Import PDF' })).toBeTruthy();
  expect(screen.getByText('Your library is empty')).toBeTruthy();
});

it('shows a successful import from its returned record without requiring another Library read', async () => {
  let listCalls = 0;
  const library: PublicationLibrary = {
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

  await fireEvent.press(await screen.findByRole('button', { name: 'Import PDF' }));
  expect(await screen.findByText('Field Notes')).toBeTruthy();
  expect(screen.getByText('Field Notes was imported.')).toBeTruthy();
});
