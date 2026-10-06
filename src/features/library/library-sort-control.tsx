import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAppTheme } from '@/theme/theme-provider';
import { type PublicationSort, publicationSortLabels } from './publication-query';

export function LibrarySortControl({
  value,
  onChange,
  disabled = false,
}: {
  value: PublicationSort;
  onChange(value: PublicationSort): void;
  disabled?: boolean;
}) {
  const { tokens } = useAppTheme();
  const [expanded, setExpanded] = useState(false);
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sort publications"
        accessibilityValue={{ text: publicationSortLabels[value] }}
        accessibilityState={{ expanded, disabled }}
        disabled={disabled}
        onPress={() => setExpanded(!expanded)}
        className="min-h-11 flex-row items-center gap-2 py-2 active:opacity-60"
      >
        <SymbolView
          accessible={false}
          name={{ ios: 'arrow.up.arrow.down', android: 'sort', web: 'sort' }}
          tintColor={tokens.accent}
          size={20}
        />
        <Text className="text-base text-text">{publicationSortLabels[value]}</Text>
      </Pressable>
      {expanded ? (
        <View className="rounded-xl border border-separator bg-surface px-3">
          {(Object.entries(publicationSortLabels) as [PublicationSort, string][]).map(
            ([sort, label]) => (
              <Pressable
                key={sort}
                accessibilityRole="radio"
                accessibilityLabel={label}
                accessibilityState={{ checked: value === sort, disabled }}
                disabled={disabled}
                onPress={() => {
                  onChange(sort);
                  setExpanded(false);
                }}
                className="min-h-11 flex-row items-center justify-between gap-3 py-3 active:opacity-60"
              >
                <Text className="text-base text-text">{label}</Text>
                {value === sort ? (
                  <SymbolView
                    accessible={false}
                    name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                    tintColor={tokens.accent}
                    size={20}
                  />
                ) : null}
              </Pressable>
            ),
          )}
        </View>
      ) : null}
    </View>
  );
}
