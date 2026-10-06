import { MenuView } from '@expo/ui/community/menu';
import { SymbolView } from 'expo-symbols';
import { View } from 'react-native';
import { useAppTheme } from '@/theme/theme-provider';
import type { PublicationMenuProps } from './publication-menu';

/** Expo's system menu owns presentation and dismissal on iOS and Android. */
export function PublicationMenu({
  publication,
  disabled,
  onRename,
  onFavorite,
  onRemove,
}: PublicationMenuProps) {
  const { tokens } = useAppTheme();
  return (
    <MenuView
      shouldOpenOnLongPress={false}
      actions={[
        { id: 'rename', title: `Rename ${publication.title}`, attributes: { disabled } },
        {
          id: 'favorite',
          title: `${publication.isFavorite ? 'Unfavorite' : 'Favorite'} ${publication.title}`,
          attributes: { disabled },
        },
        {
          id: 'remove',
          title: `Remove ${publication.title}`,
          attributes: { disabled, destructive: true },
        },
      ]}
      onPressAction={({ nativeEvent }) => {
        if (disabled) return;
        if (nativeEvent.event === 'rename') onRename();
        if (nativeEvent.event === 'favorite') onFavorite();
        if (nativeEvent.event === 'remove') onRemove();
      }}
    >
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={`Publication actions for ${publication.title}`}
        accessibilityState={{ disabled, busy: disabled }}
        className="min-h-11 min-w-11 items-center justify-center"
      >
        <SymbolView
          accessible={false}
          name={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }}
          tintColor={tokens.mutedText}
          size={24}
        />
      </View>
    </MenuView>
  );
}
