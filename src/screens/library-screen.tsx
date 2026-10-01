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
import type {
  FileImportResult,
  Publication,
  PublicationLibrary,
} from '@/features/library/publication-library';
import { EmptyState } from '@/ui/empty-state';
import { describeImportResult } from './import-result-message';

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

type LibraryRow =
  | { kind: 'publication'; publication: Publication }
  | { kind: 'result'; file: FileImportResult }
  | { kind: 'heading'; title: string };

function ImportResultRow({ file }: { file: FileImportResult }) {
  return (
    <View
      accessible
      accessibilityLabel={`${file.sourceFilename}, ${describeImportResult(file.result)}`}
      className="min-h-20 justify-center gap-1 py-3"
    >
      <Text className="font-semibold text-base text-text">{file.sourceFilename}</Text>
      <Text className="text-base text-muted-text">{describeImportResult(file.result)}</Text>
      <View className="absolute right-0 bottom-0 left-2 border-separator border-b" />
    </View>
  );
}

/** The route injects the production Library; tests can supply the same public interface. */
export function LibraryScreen({ library: suppliedLibrary }: { library?: PublicationLibrary }) {
  const libraryRef = useRef<PublicationLibrary | null>(null);
  libraryRef.current ??= suppliedLibrary ?? defaultLibrary();
  const library = libraryRef.current;
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [fileResults, setFileResults] = useState<FileImportResult[]>([]);
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const progressText = progress
    ? `${progress.completed} of ${progress.total} files completed`
    : 'Selecting PDFs…';

  useEffect(() => {
    if (Platform.OS === 'ios') {
      const announcement = message ?? (importing ? progressText : null);
      if (announcement) AccessibilityInfo.announceForAccessibility(announcement);
    }
  }, [message, importing, progressText]);

  useEffect(() => {
    let active = true;
    mounted.current = true;
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

  function acceptFile(file: FileImportResult) {
    setFileResults((current) =>
      [...current.filter((entry) => entry.index !== file.index), file].sort(
        (a, b) => a.index - b.index,
      ),
    );
    if (file.result.status === 'imported') {
      const publication = file.result.publication;
      setPublications((current) =>
        current.some((entry) => entry.id === publication.id) ? current : [publication, ...current],
      );
    }
  }

  async function onImport() {
    if (loading || loadFailed || controller.current) return;
    const abort = new AbortController();
    controller.current = abort;
    setImporting(true);
    setCancelling(false);
    setMessage(null);
    setProgress(null);
    setFileResults([]);
    try {
      const batch = await library.importMany({
        signal: abort.signal,
        onProgress: (event) => {
          if (!mounted.current || controller.current !== abort) return;
          setProgress({ completed: event.completed, total: event.total });
          if (event.file) acceptFile(event.file);
        },
      });
      if (!mounted.current || controller.current !== abort) return;
      if (batch.status === 'error') {
        setMessage(batch.error.message);
      } else {
        setFileResults(batch.results);
        const imported = batch.results.flatMap((file) =>
          file.result.status === 'imported' ? [file.result.publication] : [],
        );
        setPublications((current) => [
          ...new Map(
            [...imported, ...current].map((publication) => [publication.id, publication]),
          ).values(),
        ]);
        setProgress({ completed: batch.results.length, total: batch.results.length });
        setMessage(
          batch.results.length === 0
            ? null
            : batch.results.length === 1
              ? describeImportResult(batch.results[0].result)
              : batch.status === 'cancelled'
                ? 'Import cancelled. Completed publications remain in Library.'
                : 'Import finished. Review each file’s result below.',
        );
      }
    } catch {
      if (mounted.current)
        setMessage(
          'Muse could not finish this import. Completed publications remain in Library. Please try again.',
        );
    } finally {
      if (mounted.current) setImporting(false);
      if (controller.current === abort) controller.current = null;
    }
  }

  function onCancel() {
    setCancelling(true);
    controller.current?.abort();
  }

  const rows: LibraryRow[] = [
    ...(fileResults.length
      ? [
          { kind: 'heading' as const, title: 'Import results' },
          ...fileResults.map((file) => ({ kind: 'result' as const, file })),
        ]
      : []),
    ...(fileResults.length && publications.length
      ? [{ kind: 'heading' as const, title: 'All publications' }]
      : []),
    ...publications.map((publication) => ({ kind: 'publication' as const, publication })),
  ];

  return (
    <View className="flex-1 bg-canvas">
      <FlatList
        data={rows}
        keyExtractor={(row) =>
          row.kind === 'publication'
            ? `publication-${row.publication.id}`
            : row.kind === 'result'
              ? `result-${row.file.index}`
              : row.title
        }
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="grow px-5 pb-8"
        ListHeaderComponent={
          <View className="gap-3 pt-4 pb-3">
            <Text accessibilityRole="header" className="font-bold text-4xl text-text">
              Library
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Import PDFs"
              accessibilityState={{ disabled: loading || loadFailed || importing }}
              disabled={loading || loadFailed || importing}
              onPress={() => {
                void onImport();
              }}
              className="min-h-11 self-start justify-center rounded-xl bg-surface px-5 active:opacity-60"
            >
              <Text className="font-semibold text-base text-text">Import PDFs</Text>
            </Pressable>
            {importing ? (
              <View className="flex-row items-center gap-2" accessibilityLiveRegion="polite">
                <ActivityIndicator colorClassName="accent-accent" />
                <Text className="flex-1 text-base text-muted-text">{progressText}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cancel import"
                  accessibilityState={{ disabled: cancelling }}
                  disabled={cancelling}
                  onPress={onCancel}
                  className="min-h-11 justify-center rounded-xl bg-surface px-4 active:opacity-60"
                >
                  <Text className="font-semibold text-base text-text">
                    {cancelling ? 'Cancelling…' : 'Cancel'}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {message && fileResults.length !== 1 ? (
              <Text accessibilityLiveRegion="polite" className="text-base text-muted-text">
                {message}
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) =>
          item.kind === 'publication' ? (
            <PublicationRow publication={item.publication} />
          ) : item.kind === 'result' ? (
            <ImportResultRow file={item.file} />
          ) : (
            <Text accessibilityRole="header" className="pt-4 pb-2 font-semibold text-xl text-text">
              {item.title}
            </Text>
          )
        }
        ListEmptyComponent={loading ? <ActivityIndicator colorClassName="accent-accent" /> : null}
        ListFooterComponent={
          !loading && !loadFailed && publications.length === 0 ? (
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
    </View>
  );
}
