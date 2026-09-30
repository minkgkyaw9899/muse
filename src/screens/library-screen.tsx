import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';

import { createExpoPublicationLibrary } from '@/features/library/expo-publication-adapters';
import type { Publication, PublicationLibrary } from '@/features/library/publication-library';
import { EmptyState } from '@/ui/empty-state';

let appLibrary: PublicationLibrary | null = null;
function defaultLibrary(): PublicationLibrary {
  appLibrary ??= createExpoPublicationLibrary();
  return appLibrary;
}

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
export function LibraryScreen({ library: suppliedLibrary }: { library?: PublicationLibrary }) {
  const libraryRef = useRef<PublicationLibrary | null>(null);
  libraryRef.current ??= suppliedLibrary ?? defaultLibrary();
  const library = libraryRef.current;
  const controller = useRef<AbortController | null>(null);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      const announcement = message ?? (importing ? 'Importing PDF.' : null);
      if (announcement) AccessibilityInfo.announceForAccessibility(announcement);
    }
  }, [message, importing]);

  useEffect(() => {
    let active = true;
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
      controller.current?.abort();
    };
  }, [library]);

  async function onImport() {
    if (loading || loadFailed || importing) return;
    const abort = new AbortController();
    controller.current = abort;
    setImporting(true);
    setMessage(null);
    try {
      const result = await library.importOne({ signal: abort.signal });
      if (abort.signal.aborted) return;
      if (result.status === 'error') {
        setMessage(result.error.message);
      } else if (result.status === 'duplicate') {
        setMessage('Already in Library. Your existing publication is unchanged.');
      } else if (result.status === 'imported') {
        setPublications((current) => [result.publication, ...current]);
        setMessage(`${result.publication.title} was imported.`);
      }
    } catch {
      if (!abort.signal.aborted) setMessage('Muse could not import this PDF. Please try again.');
    } finally {
      if (!abort.signal.aborted) setImporting(false);
      if (controller.current === abort) controller.current = null;
    }
  }

  return (
    <View className="flex-1 bg-canvas">
      <FlatList
        data={publications}
        keyExtractor={(publication) => publication.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="grow px-5 pb-8"
        ListHeaderComponent={
          <View className="gap-3 pt-4 pb-3">
            <Text accessibilityRole="header" className="font-bold text-4xl text-text">
              Library
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Import PDF"
              accessibilityState={{ disabled: loading || loadFailed || importing }}
              disabled={loading || loadFailed || importing}
              onPress={onImport}
              className="min-h-11 self-start justify-center rounded-xl bg-surface px-5 active:opacity-60"
            >
              <Text className="font-semibold text-base text-text">Import PDF</Text>
            </Pressable>
            {importing ? (
              <View className="flex-row items-center gap-2" accessibilityLiveRegion="polite">
                <ActivityIndicator colorClassName="accent-accent" />
                <Text className="text-base text-muted-text">Importing PDF…</Text>
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
            <ActivityIndicator colorClassName="accent-accent" />
          ) : loadFailed ? null : (
            <View className="min-h-80">
              <EmptyState
                icon={{ ios: 'books.vertical', android: 'library_books', web: 'library_books' }}
                title="Your library is empty"
                description="Publications you import will appear here."
              />
            </View>
          )
        }
      />
    </View>
  );
}
