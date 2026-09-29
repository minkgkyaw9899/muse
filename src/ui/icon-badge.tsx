import { SymbolView } from 'expo-symbols';
import { View } from 'react-native';

import type { SymbolName } from '@/components/tab-bar';
import { useAppTheme } from '@/theme/theme-provider';

/** Soft circular container for a symbol. `active` uses the accent color. */
export function IconBadge({
  name,
  active = false,
  size = 'md',
}: {
  name: SymbolName;
  active?: boolean;
  size?: 'md' | 'lg';
}) {
  const { tokens } = useAppTheme();
  const large = size === 'lg';

  return (
    <View
      className={`items-center justify-center rounded-full bg-surface ${large ? 'size-24' : 'size-12'}`}
    >
      <SymbolView
        name={name}
        tintColor={active ? tokens.accent : tokens.mutedText}
        size={large ? 40 : 24}
      />
    </View>
  );
}
