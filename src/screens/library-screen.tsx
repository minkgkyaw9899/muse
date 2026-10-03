import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Keyboard,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getAppLibrary } from '@/features/library/app-library';
import type {
  FileImportResult,
  Publication,
  PublicationLibrary,
} from '@/features/library/publication-library';
import { detectTabBarKind } from '@/theme/glass-capability';
import { useAppTheme } from '@/theme/theme-provider';
import { EmptyState } from '@/ui/empty-state';
import { HeaderAction } from '@/ui/header-action';
import { ScrollList } from '@/ui/scroll-list';
import { useToast } from '@/ui/toast';
import { summarizeImport } from './import-result-message';

const headerSearchAvailable = detectTabBarKind() === 'fallback';

function formatImportDate(isoDate: string): string {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(isoDate));
}

function PublicationRow({ publication }: { publication: Publication }) {
  const date = formatImportDate(publication.importedAt);
  const pageLabel = `${publication.pageCount} ${publication.pageCount === 1 ? 'page' : 'pages'}`;
  return (
    <View
      accessible
      accessibilityLabel={`${publication.title}, ${pageLabel}, imported ${date}`}
      className="min-h-20 justify-center border-separator border-b py-3"
    >
      <Text className="font-semibold text-lg text-text">{publication.title}</Text>
      <Text className="text-base text-muted-text">
        {pageLabel} · {date}
      </Text>
    </View>
  );
}

/** The route injects the production Library; tests can supply the same public interface. */
export function LibraryScreen({
  library: suppliedLibrary,
  searchQuery = '',
  searchOnly = false,
}: {
  library?: PublicationLibrary;
  searchQuery?: string;
  searchOnly?: boolean;
}) {
  const { tokens } = useAppTheme();
  const toast = useToast();
  const [searching, setSearching] = useState(false);
  const [localQuery, setLocalQuery] = useState('');
  const libraryRef = useRef<PublicationLibrary | null>(null);
  libraryRef.current ??= suppliedLibrary ?? getAppLibrary();
  const library = libraryRef.current;
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios' && message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    setLoading(true);
    setLoadFailed(false);
    setMessage(null);
    library
      .list()
      .then((listed) => {
        if (active) setPublications(listed);
      })
      .catch(() => {
        if (active) {
          setLoadFailed(true);
          setMessage('Muse could not load the Library. Reopen the app and try again.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      mounted.current = false;
      controller.current?.abort();
    };
  }, [library]);

  function addPublications(added: Publication[]) {
    setPublications((current) => [
      ...new Map(
        [...added, ...current].map((publication) => [publication.id, publication]),
      ).values(),
    ]);
  }

  function importedPublication(file: FileImportResult): Publication[] {
    return file.result.status === 'imported' ? [file.result.publication] : [];
  }

  async function onImport() {
    if (loading || loadFailed || controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    setImporting(true);
    try {
      const batch = await library.importMany({
        signal: abort.signal,
        // Rows appear as each file completes; the outcome itself is reported once, in a toast.
        onProgress: (event) => {
          if (!mounted.current || controller.current !== abort) return;
          if (event.file) addPublications(importedPublication(event.file));
        },
      });
      if (!mounted.current || controller.current !== abort) return;
      if (batch.status === 'error') {
        toast.show({ kind: 'error', message: batch.error.message });
      } else {
        addPublications(batch.results.flatMap(importedPublication));
        const summary = summarizeImport(batch.results);
        if (summary) toast.show(summary);
      }
    } catch {
      if (mounted.current)
        toast.show({
          kind: 'error',
          message:
            'Muse could not finish this import. Completed publications remain in Library. Please try again.',
        });
    } finally {
      if (mounted.current) setImporting(false);
      if (controller.current === abort) controller.current = null;
    }
  }

  const query = (searchOnly ? searchQuery : localQuery).trim().toLocaleLowerCase();
  const visiblePublications = publications.filter((publication) =>
    publication.title.toLocaleLowerCase().includes(query),
  );
  // The list must be the screen's first child: iOS finds the tab's scroll view there to minimize the bar.
  return (
    <ScrollList
      className="flex-1 bg-canvas"
      data={visiblePublications}
      keyExtractor={(publication) => publication.id}
      estimatedItemSize={80}
      recycleItems={false}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="grow px-5 pb-8"
      ListHeaderComponent={
        <View className="gap-3 pt-4 pb-3">
          {!searchOnly ? (
            <View className="flex-row flex-wrap items-center justify-between gap-3">
              <Text
                accessibilityRole="header"
                className="min-w-36 flex-1 font-bold text-4xl text-text"
              >
                Library
              </Text>
              <View className="max-w-full flex-row flex-wrap items-center gap-2">
                {headerSearchAvailable ? (
                  <HeaderAction
                    label="Search Library"
                    icon={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
                    onPress={() => setSearching(true)}
                  />
                ) : null}
                <HeaderAction
                  label="Import PDFs"
                  hint="Add PDFs to your Library"
                  icon={{ ios: 'plus', android: 'add', web: 'add' }}
                  disabled={loading || loadFailed || importing}
                  onPress={() => {
                    void onImport();
                  }}
                />
                <HeaderAction
                  label="Edit Library"
                  hint="Library editing is coming later"
                  text="Edit"
                  disabled
                />
              </View>
            </View>
          ) : null}
          {searching && !searchOnly ? (
            <View className="flex-row flex-wrap items-center gap-2">
              <TextInput
                accessibilityLabel="Search Library titles"
                placeholder="Search Library"
                placeholderTextColor={tokens.mutedText}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                value={localQuery}
                onChangeText={setLocalQuery}
                returnKeyType="search"
                className="min-h-14 min-w-36 flex-1 rounded-full border border-separator bg-surface px-4 text-base text-text"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel search"
                onPress={() => {
                  setSearching(false);
                  setLocalQuery('');
                  Keyboard.dismiss();
                }}
                className="min-h-11 justify-center px-2 active:opacity-60"
              >
                <Text className="text-accent-text text-base">Cancel</Text>
              </Pressable>
            </View>
          ) : null}
          {message ? (
            <Text accessibilityLiveRegion="polite" className="text-base text-muted-text">
              {message}
            </Text>
          ) : null}
        </View>
      }
      renderItem={({ item }) => <PublicationRow publication={item} />}
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator accessibilityLabel="Loading Library" colorClassName="accent-accent" />
        ) : null
      }
      keyboardShouldPersistTaps="handled"
      ListFooterComponent={
        !loading && !loadFailed && query && visiblePublications.length === 0 ? (
          <Text accessibilityLiveRegion="polite" className="py-6 text-base text-muted-text">
            No matching publications
          </Text>
        ) : !loading && !loadFailed && publications.length === 0 ? (
          <View className="min-h-80">
            <EmptyState
              icon={{ ios: 'books.vertical', android: 'library_books', web: 'library_books' }}
              title="Your library is empty"
              description="Publications you import will appear here."
            />
          </View>
        ) : null
      }
    />
  );
}
