import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme/theme-provider';
import { ScrollList } from '@/ui/scroll-list';
import type { Publication } from './publication-library';

export type PublicationMenuProps = {
  publication: Publication;
  disabled: boolean;
  onRename(): void;
  onFavorite(): void;
  onRemove(): void;
};

/** Accessible web adapter for the same action contract as the native system menu. */
export function PublicationMenu(props: PublicationMenuProps) {
  const { tokens } = useAppTheme();
  const [open, setOpen] = useState(false);
  const { publication, disabled } = props;
  const actions = [
    { label: `Rename ${publication.title}`, run: props.onRename },
    {
      label: `${publication.isFavorite ? 'Unfavorite' : 'Favorite'} ${publication.title}`,
      run: props.onFavorite,
    },
    { label: `Remove ${publication.title}`, run: props.onRemove },
  ];
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Publication actions for ${publication.title}`}
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        className="min-h-11 min-w-11 items-center justify-center rounded-full active:opacity-60"
      >
        <SymbolView
          accessible={false}
          name={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }}
          tintColor={tokens.mutedText}
          size={24}
        />
      </Pressable>
      <Modal visible={open} animationType="none" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: tokens.canvas }} accessibilityViewIsModal>
          <ScrollList
            className="flex-1"
            data={[]}
            contentContainerClassName="grow px-5 py-6"
            ListHeaderComponent={
              <View className="gap-3">
                <Text
                  accessibilityRole="header"
                  selectable
                  className="font-bold text-2xl text-text"
                >
                  {publication.title}
                </Text>
                {actions.map((action) => (
                  <Pressable
                    key={action.label}
                    accessibilityRole="button"
                    accessibilityLabel={action.label}
                    disabled={disabled}
                    accessibilityState={{ disabled }}
                    onPress={() => {
                      setOpen(false);
                      action.run();
                    }}
                    className="min-h-11 justify-center rounded-xl border border-separator bg-surface px-4 py-3 active:opacity-60"
                  >
                    <Text
                      className={
                        action.run === props.onRemove
                          ? 'text-base text-destructive'
                          : 'text-base text-text'
                      }
                    >
                      {action.label}
                    </Text>
                  </Pressable>
                ))}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cancel publication actions"
                  onPress={() => setOpen(false)}
                  className="min-h-11 justify-center px-4 py-3"
                >
                  <Text className="text-accent-text text-base">Cancel</Text>
                </Pressable>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}
