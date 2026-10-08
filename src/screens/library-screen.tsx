import { useEffect, useMemo, useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAppLibrary } from '@/features/library/app-library';
import { LibrarySortControl } from '@/features/library/library-sort-control';
import {
  type PublicationAction,
  PublicationActionDialog,
} from '@/features/library/publication-action-dialog';
import type {
  FileImportResult,
  Publication,
  PublicationLibrary,
} from '@/features/library/publication-library';
import { type PublicationSort, queryPublications } from '@/features/library/publication-query';
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
  const insets = useSafeAreaInsets();
  const compactHeader = headerSearchAvailable && !favoritesOnly;
  const { tokens } = useAppTheme();
  const toast = useToast();
  const [sort, setSort] = useState<PublicationSort>('imported-desc');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmation, setConfirmation] = useState<Publication[] | null>(null);
  const [removing, setRemoving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [localQuery, setLocalQuery] = useState('');
  const libraryRef = useRef<PublicationLibrary | null>(null);
  libraryRef.current ??= suppliedLibrary ?? getAppLibrary();
  const library = libraryRef.current;
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const readVersion = useRef(0);
  // Returned import records remain visible until a successful snapshot includes them.
  const pendingImportedIds = useRef(new Set<string>());
  // A committed import can notify the Library before its worker reports progress. Do not revive it.
  const removedDuringImport = useRef(new Set<string>());
  const reload = useRef<() => void>(() => {});
  const [publications, setPublications] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<PublicationAction | null>(null);

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
            const pending = new Set(pendingImportedIds.current);
            for (const publication of listed) pending.delete(publication.id);
            pendingImportedIds.current = pending;
            setPublications((previous) => [
              ...listed,
              ...previous.filter((publication) => pending.has(publication.id)),
            ]);
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
    const unsubscribe = library.subscribe((change) => {
      if (change?.kind === 'removed') {
        pendingImportedIds.current.delete(change.id);
        if (controller.current) removedDuringImport.current.add(change.id);
        setPublications((current) => current.filter((row) => row.id !== change.id));
      }
      refresh();
    });
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
        // Recover the complete current collection, including commits made by another screen.
        reload.current();
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
    for (const publication of added) pendingImportedIds.current.add(publication.id);
    readVersion.current += 1;
    setPublications((current) => [
      ...new Map(
        [...added, ...current].map((publication) => [publication.id, publication]),
      ).values(),
    ]);
    reload.current();
  }

  function importedPublication(file: FileImportResult): Publication[] {
    return file.result.status === 'imported' ? [file.result.publication] : [];
  }

  async function onImport() {
    if (loading || loadFailed || controller.current) return;
    const abort = new AbortController();
    removedDuringImport.current.clear();
    const received = new Set<string>();
    function receive(added: Publication[]) {
      const unseen = added.filter(
        (publication) =>
          !received.has(publication.id) && !removedDuringImport.current.has(publication.id),
      );
      for (const publication of unseen) received.add(publication.id);
      addPublications(unseen);
    }
    controller.current = abort;
    setImporting(true);
    try {
      const batch = await library.importMany({
        signal: abort.signal,
        // Rows appear as each file completes; the outcome itself is reported once, in a toast.
        onProgress: (event) => {
          if (!mounted.current || controller.current !== abort) return;
          if (event.file) receive(importedPublication(event.file));
        },
      });
      if (!mounted.current || controller.current !== abort) return;
      if (batch.status === 'error') {
        toast.show({ kind: 'error', message: batch.error.message });
      } else {
        receive(batch.results.flatMap(importedPublication));
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
      if (controller.current !== abort) removedDuringImport.current.clear();
    }
  }

  const query = (searchOnly ? searchQuery : localQuery).trim().toLocaleLowerCase();
  const collection = useMemo(
    () =>
      favoritesOnly ? publications.filter((publication) => publication.isFavorite) : publications,
    [publications, favoritesOnly],
  );
  const visiblePublications = useMemo(
    () => queryPublications(collection, { search: query, sort }),
    [collection, query, sort],
  );
  const recent = useMemo(
    () => queryPublications(collection, { search: query, recentOnly: true }),
    [collection, query],
  );
  const visibleIds = useMemo(
    () => new Set(visiblePublications.map((row) => row.id)),
    [visiblePublications],
  );
  const selectedVisible = visiblePublications.filter((row) => selected.has(row.id));
  useEffect(() => {
    setSelected((current) => {
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [visibleIds]);

  function applyCommittedRemovals(ids: ReadonlySet<string>) {
    readVersion.current += 1;
    for (const id of ids) {
      pendingImportedIds.current.delete(id);
      if (controller.current) removedDuringImport.current.add(id);
    }
    setPublications((current) => current.filter((row) => !ids.has(row.id)));
    reload.current();
  }

  async function removeSelection(_draft: string, signal: AbortSignal) {
    if (!confirmation || removing)
      return {
        status: 'error' as const,
        error: { category: 'storage' as const, message: 'Removal is already running.' },
      };
    setRemoving(true);
    try {
      const results = await library.removeMany(
        confirmation.map((row) => row.id),
        { signal },
      );
      if (mounted.current) {
        const removed = new Set(
          results.filter(({ result }) => result.status === 'removed').map(({ id }) => id),
        );
        applyCommittedRemovals(removed);
        setSelected(
          new Set(confirmation.filter((row) => !removed.has(row.id)).map((row) => row.id)),
        );
        const unprocessed = confirmation.length - results.length;
        const failed = results.filter(({ result }) => result.status === 'error');
        const cleanupPending = results.some(
          ({ result }) => result.status === 'removed' && result.cleanupPending,
        );
        toast.show({
          kind: failed.length || cleanupPending ? 'error' : 'success',
          message:
            `${removed.size} ${removed.size === 1 ? 'publication' : 'publications'} removed.` +
            (failed.length
              ? ` ${failed.length} could not be removed. They remain selected; try again.`
              : '') +
            (unprocessed ? ` ${unprocessed} not processed. They remain selected.` : '') +
            (cleanupPending ? ' Reopen Muse to finish freeing storage.' : ''),
        });
        if (!failed.length && !unprocessed) setSelecting(false);
      }
      return { status: 'removed' as const, cleanupPending: false };
    } finally {
      if (mounted.current) setRemoving(false);
    }
  }
  // The list must be the screen's first child: iOS finds the tab's scroll view there to minimize the bar.
  return (
    <>
      <ScrollList
        className="flex-1 bg-canvas"
        data={visiblePublications}
        keyExtractor={(publication) => publication.id}
        estimatedItemSize={80}
        recycleItems={false}
        contentContainerStyle={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="grow px-5 pb-8"
        ListHeaderComponent={
          <View className="gap-3 pt-4 pb-3">
            {!searchOnly ? (
              <View
                className={
                  compactHeader
                    ? 'flex-row items-center gap-2'
                    : 'flex-row flex-wrap items-center justify-between gap-3'
                }
              >
                <Text
                  accessibilityRole="header"
                  numberOfLines={compactHeader ? 1 : undefined}
                  className={`${compactHeader ? 'min-w-0' : 'min-w-36'} flex-1 font-bold text-4xl text-text`}
                >
                  {title}
                </Text>
                <View
                  className={
                    compactHeader
                      ? 'shrink-0 flex-row items-center'
                      : 'max-w-full flex-row flex-wrap items-center gap-2'
                  }
                >
                  {headerSearchAvailable || favoritesOnly ? (
                    <HeaderAction
                      compact={compactHeader}
                      label={`Search ${title}`}
                      icon={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
                      onPress={() => setSearching(true)}
                    />
                  ) : null}
                  {!favoritesOnly ? (
                    <>
                      <HeaderAction
                        compact={compactHeader}
                        label="Import PDFs"
                        hint="Add PDFs to your Library"
                        icon={{ ios: 'plus', android: 'add', web: 'add' }}
                        disabled={loading || loadFailed || importing || selecting}
                        onPress={() => {
                          void onImport();
                        }}
                      />
                      <HeaderAction
                        compact={compactHeader}
                        icon={{ ios: 'pencil', android: 'edit', web: 'edit' }}
                        label="Edit Library"
                        hint="Select publications to remove"
                        disabled={
                          loading || loadFailed || importing || selecting || collection.length === 0
                        }
                        onPress={() => setSelecting(true)}
                      />
                    </>
                  ) : null}
                </View>
              </View>
            ) : null}
            {searchOnly ? (
              <View className="items-end">
                <HeaderAction
                  label="Edit Library"
                  hint="Select matching publications to remove"
                  icon={{ ios: 'pencil', android: 'edit', web: 'edit' }}
                  disabled={
                    loading ||
                    loadFailed ||
                    importing ||
                    selecting ||
                    visiblePublications.length === 0
                  }
                  onPress={() => setSelecting(true)}
                />
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
            {!favoritesOnly ? (
              <LibrarySortControl
                value={sort}
                onChange={setSort}
                disabled={loading || loadFailed || removing}
              />
            ) : null}
            {selecting ? (
              <View className="gap-2">
                <Text accessibilityLiveRegion="polite" className="text-base text-text">
                  {selectedVisible.length} selected
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  <HeaderAction
                    label="Select all visible publications"
                    text="Select all"
                    disabled={removing || visiblePublications.length === 0}
                    onPress={() => setSelected(new Set(visibleIds))}
                  />
                  <HeaderAction
                    label="Remove selected publications"
                    text="Remove"
                    disabled={removing || selectedVisible.length === 0}
                    onPress={() => setConfirmation([...selectedVisible])}
                  />
                  <HeaderAction
                    label="Cancel selection"
                    text="Cancel"
                    disabled={removing}
                    onPress={() => {
                      setSelecting(false);
                      setSelected(new Set());
                    }}
                  />
                </View>
              </View>
            ) : null}
            {!favoritesOnly && !searchOnly && !selecting && recent.length ? (
              <View>
                <Text accessibilityRole="header" className="font-semibold text-xl text-text">
                  Recent
                </Text>
                {recent.map((item) => (
                  <PublicationRow
                    key={item.id}
                    publication={item}
                    saving={saving.has(item.id)}
                    onFavorite={() => {
                      void onFavorite(item);
                    }}
                    onRename={() => setAction({ kind: 'rename', publication: item })}
                    onRemove={() => setAction({ kind: 'remove', publication: item })}
                  />
                ))}
              </View>
            ) : null}
            {!favoritesOnly && collection.length ? (
              <Text accessibilityRole="header" className="font-semibold text-xl text-text">
                All publications
              </Text>
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
            saving={removing || saving.has(item.id)}
            selecting={selecting}
            selected={selected.has(item.id)}
            onSelect={() =>
              setSelected((current) => {
                const next = new Set(current);
                if (next.has(item.id)) next.delete(item.id);
                else next.add(item.id);
                return next;
              })
            }
            onFavorite={() => {
              void onFavorite(item);
            }}
            onRename={() => setAction({ kind: 'rename', publication: item })}
            onRemove={() => setAction({ kind: 'remove', publication: item })}
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
      {confirmation?.[0] ? (
        <PublicationActionDialog
          action={{ kind: 'remove', publication: confirmation[0], count: confirmation.length }}
          onDismiss={() => setConfirmation(null)}
          onSubmit={removeSelection}
        />
      ) : null}
      {action ? (
        <PublicationActionDialog
          key={`${action.kind}-${action.publication.id}`}
          action={action}
          onDismiss={() => setAction(null)}
          onSubmit={async (draft) => {
            if (action.kind === 'rename') {
              const result = await library.rename(action.publication.id, draft);
              if (mounted.current && result.status === 'saved') {
                readVersion.current += 1;
                setPublications((current) =>
                  current.map((row) =>
                    row.id === result.publication.id ? result.publication : row,
                  ),
                );
                reload.current();
              }
              return result;
            }
            const result = await library.remove(action.publication.id);
            if (mounted.current && result.status === 'removed') {
              applyCommittedRemovals(new Set([action.publication.id]));
              if (result.cleanupPending)
                toast.show({
                  kind: 'error',
                  message: 'Publication removed. Reopen Muse to finish freeing its storage.',
                });
            }
            return result;
          }}
        />
      ) : null}
    </>
  );
}
