import { Text, View } from 'react-native';

import type { SymbolName } from '@/components/tab-bar';
import { IconBadge } from './icon-badge';

export function EmptyState({
  icon,
  title,
  description,
}: {
  icon: SymbolName;
  title: string;
  description: string;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-3 px-6 pb-24">
      <IconBadge name={icon} active size="lg" />
      <Text className="mt-3 text-center font-semibold text-text text-xl">{title}</Text>
      <Text className="text-center text-base text-muted-text leading-6">{description}</Text>
    </View>
  );
}
