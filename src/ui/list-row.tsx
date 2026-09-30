import { SymbolView } from 'expo-symbols';
import { Pressable, Text, View } from 'react-native';

import type { SymbolName } from '@/components/tab-bar';
import { useAppTheme } from '@/theme/theme-provider';
import { IconBadge } from './icon-badge';

type Props = {
  icon: SymbolName;
  title: string;
  /** Secondary text shown before the trailing indicator. */
  value?: string;
  /** `button` rows navigate (chevron); `radio` rows select (check when selected). */
  role: 'button' | 'radio';
  selected?: boolean;
  /** Draw the inset divider above this row (every row except the first). */
  divider?: boolean;
  onPress: () => void;
};

/** Flat settings-style row: icon badge, title, optional value, trailing chevron or check. */
export function ListRow({ icon, title, value, role, selected = false, divider, onPress }: Props) {
  const { tokens } = useAppTheme();

  return (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={value ? `${title}, ${value}` : title}
      accessibilityState={role === 'radio' ? { selected, checked: selected } : undefined}
      onPress={onPress}
      className="min-h-20 flex-row items-center gap-4 active:opacity-60"
    >
      <IconBadge name={icon} active={selected || role === 'button'} />
      <View
        className={`min-h-20 flex-1 flex-row items-center gap-2 ${
          divider ? 'border-separator border-t' : ''
        }`}
      >
        <Text className={`flex-1 text-lg text-text ${selected ? 'font-semibold' : ''}`}>
          {title}
        </Text>
        {value ? <Text className="text-lg text-muted-text">{value}</Text> : null}
        {role === 'button' ? (
          <SymbolView
            name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
            tintColor={tokens.mutedText}
            size={16}
          />
        ) : null}
        {role === 'radio' && selected ? (
          <SymbolView
            name={{ ios: 'checkmark', android: 'check', web: 'check' }}
            weight="bold"
            tintColor={tokens.accent}
            size={22}
          />
        ) : null}
      </View>
    </Pressable>
  );
}
