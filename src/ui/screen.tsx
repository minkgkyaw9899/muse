import type { PropsWithChildren } from 'react';
import { Text } from 'react-native';

import { ScrollList } from './scroll-list';

/** Root scaffold for a tab destination: canvas, large title, consistent gutters. */
export function Screen({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <ScrollList
      className="flex-1 bg-canvas"
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
