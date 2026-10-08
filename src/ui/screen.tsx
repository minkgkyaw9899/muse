import type { PropsWithChildren } from 'react';
import { Platform, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScrollList } from './scroll-list';

/** Root scaffold for a tab destination: canvas, large title, consistent gutters. */
export function Screen({ title, children }: PropsWithChildren<{ title: string }>) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollList
      className="flex-1 bg-canvas"
      contentContainerStyle={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerClassName="grow px-5 pb-8"
      data={[]}
      renderItem={() => null}
      recycleItems={false}
      ListHeaderComponent={
        <>
          <Text accessibilityRole="header" className="pt-4 pb-3 font-bold text-4xl text-text">
            {title}
          </Text>
          {children}
        </>
      }
    />
  );
}
