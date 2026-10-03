import { SymbolView } from 'expo-symbols';
import { Pressable, Text, View } from 'react-native';

import { useAppTheme } from '@/theme/theme-provider';
import type { Publication } from './publication-library';
import { PublicationMenu } from './publication-menu';

/** One compact, accessible presentation for Library, Search and Favorites. */
export function PublicationRow({
  publication,
  saving = false,
  onFavorite,
  onRename,
  onRemove,
}: {
  publication: Publication;
  saving?: boolean;
  onFavorite: () => void;
  onRename: () => void;
  onRemove: () => void;
}) {
  const { tokens } = useAppTheme();
  const date = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(publication.lastOpenedAt ?? publication.importedAt));
  const dateLabel = publication.lastOpenedAt ? 'last opened' : 'imported';
  const pageLabel = `${publication.pageCount} ${publication.pageCount === 1 ? 'page' : 'pages'}`;
  return (
    <View className="min-h-20 flex-row items-center gap-3 border-separator border-b py-3">
      <View
        accessible
        accessibilityLabel={`${publication.title}, ${pageLabel}, ${dateLabel} ${date}`}
        className="min-w-0 flex-1 justify-center"
      >
        <Text className="font-semibold text-lg text-text">{publication.title}</Text>
        <Text className="text-base text-muted-text">
          {pageLabel} · {date}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${publication.isFavorite ? 'Unfavorite' : 'Favorite'} ${publication.title}`}
        accessibilityHint="Change whether this publication appears in Favorites"
        accessibilityState={{ selected: publication.isFavorite, disabled: saving, busy: saving }}
        disabled={saving}
        onPress={onFavorite}
        className="min-h-11 min-w-11 items-center justify-center rounded-full active:opacity-60"
      >
        <SymbolView
          accessible={false}
          name={{
            ios: publication.isFavorite ? 'heart.fill' : 'heart',
            android: publication.isFavorite ? 'favorite' : 'favorite_border',
            web: publication.isFavorite ? 'favorite' : 'favorite_border',
          }}
          tintColor={publication.isFavorite ? tokens.accent : tokens.mutedText}
          size={24}
        />
      </Pressable>
      <PublicationMenu
        publication={publication}
        disabled={saving}
        onFavorite={onFavorite}
        onRename={onRename}
        onRemove={onRemove}
      />
    </View>
  );
}
