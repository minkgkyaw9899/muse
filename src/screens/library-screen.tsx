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
import { PublicationRow } from '@/features/library/publication-row';
import { detectTabBarKind } from '@/theme/glass-capability';
import { useAppTheme } from '@/theme/theme-provider';
import { EmptyState } from '@/ui/empty-state';
import { HeaderAction } from '@/ui/header-action';
import { ScrollList } from '@/ui/scroll-list';
import { useToast } from '@/ui/toast';
import { summarizeImport } from './import-result-message';

const headerSearchAvailable = detectTabBarKind() === 'fallback';

/** The route injects the production Library; tests can supply the same public interface. */
export function LibraryScreen({
  library: suppliedLibrary,
  searchQuery = '',
  searchOnly = false,
  favoritesOnly = false,
}: {
  library?: PublicationLibrary;
  searchQuery?: string;
  searchOnly?: boolean;
  favoritesOnly?: boolean;
}) {
  const title = favoritesOnly ? 'Favorites' : 'Library';
  const { tokens } = useAppTheme();
  const toast = useToast();
  const [searching, setSearching] = useState(false);
  const [localQuery, setLocalQuery] = useState('');
  const libraryRef = useRef<PublicationLibrary | null>(null);
  libraryRef.current ??= suppliedLibrary ?? getAppLibrary();
  const library = libraryRef.current;
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const readVersion = useRef(0);
  const reload = useRef<() => void>(() => {});
  const [publications, setPublications] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (Platform.OS === 'ios' && message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    setLoading(true);
    setLoadFailed(false);
    setMessage(null);
    function refresh() {
      const version = ++readVersion.current;
      const current = () => active && version === readVersion.current;
      library
        .list()
        .then((listed) => {
          if (current()) {
            setPublications(listed);
            setLoadFailed(false);
            setMessage(null);
          }
        })
        .catch(() => {
          if (current()) {
            setLoadFailed(true);
            setMessage(`Muse could not load the ${title}. Reopen the app and try again.`);
          }
        })
        .finally(() => {
          if (current()) setLoading(false);
        });
    }
    reload.current = refresh;
    const unsubscribe = library.subscribe(refresh);
    refresh();
    return () => {
      active = false;
      mounted.current = false;
      controller.current?.abort();
      unsubscribe();
    };
  }, [library, title]);

  async function onFavorite(publication: Publication) {
    setSaving((current) => new Set(current).add(publication.id));
    try {
      const result = await library.setFavorite(publication.id, !publication.isFavorite);
      if (!mounted.current) return;
      if (result.status === 'saved') {
        // A snapshot started before this durable write cannot restore its old favorite state.
        readVersion.current += 1;
        setPublications((current) =>
          current.map((row) => (row.id === result.publication.id ? result.publication : row)),
        );
      } else {
        toast.show({ kind: 'error', message: result.error.message });
      }
    } catch {
      if (mounted.current)
        toast.show({
          kind: 'error',
          message: 'Muse could not save this favorite. Please try again.',
        });
    } finally {
      if (mounted.current)
        setSaving((current) => {
          const next = new Set(current);
          next.delete(publication.id);
          return next;
        });
    }
  }

  function addPublications(added: Publication[]) {
    if (added.length === 0) return;
    readVersion.current += 1;
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
  const collection = favoritesOnly
    ? publications.filter((publication) => publication.isFavorite)
    : publications;
  const visiblePublications = collection.filter((publication) =>
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
                {title}
              </Text>
              <View className="max-w-full flex-row flex-wrap items-center gap-2">
                {headerSearchAvailable || favoritesOnly ? (
                  <HeaderAction
                    label={`Search ${title}`}
                    icon={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
                    onPress={() => setSearching(true)}
                  />
                ) : null}
                {!favoritesOnly ? (
                  <>
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
                  </>
                ) : null}
              </View>
            </View>
          ) : null}
          {searching && !searchOnly ? (
            <View className="flex-row flex-wrap items-center gap-2">
              <TextInput
                accessibilityLabel={`Search ${title} titles`}
                placeholder={`Search ${title}`}
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
          {loadFailed ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Retry loading ${title}`}
              onPress={() => {
                setLoading(true);
                setLoadFailed(false);
                setMessage(null);
                reload.current();
              }}
              className="min-h-11 justify-center rounded-full border border-separator bg-surface px-4 active:opacity-60"
            >
              <Text className="text-accent-text text-base">Try again</Text>
            </Pressable>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <PublicationRow
          publication={item}
          saving={saving.has(item.id)}
          onFavorite={() => {
            void onFavorite(item);
          }}
        />
      )}
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator
            accessibilityLabel={`Loading ${title}`}
            colorClassName="accent-accent"
          />
        ) : null
      }
      keyboardShouldPersistTaps="handled"
      ListFooterComponent={
        !loading && !loadFailed && query && visiblePublications.length === 0 ? (
          <Text accessibilityLiveRegion="polite" className="py-6 text-base text-muted-text">
            {favoritesOnly ? 'No matching favorites' : 'No matching publications'}
          </Text>
        ) : !loading && !loadFailed && collection.length === 0 ? (
          <View className="min-h-80">
            <EmptyState
              icon={
                favoritesOnly
                  ? { ios: 'heart', android: 'favorite', web: 'favorite' }
                  : { ios: 'books.vertical', android: 'library_books', web: 'library_books' }
              }
              title={favoritesOnly ? 'No favorites yet' : 'Your library is empty'}
              description={
                favoritesOnly
                  ? 'Mark a publication as a favorite to find it here quickly.'
                  : 'Publications you import will appear here.'
              }
            />
          </View>
        ) : null
      }
    />
  );
}
