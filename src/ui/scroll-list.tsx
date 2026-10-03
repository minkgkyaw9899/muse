import { LegendList } from '@legendapp/list/react-native';
import type { ComponentProps } from 'react';
import { withUniwind } from 'uniwind';

type ClassNames = { className?: string; contentContainerClassName?: string };

/**
 * The app's only scrolling primitive (constitution principle 9). It is a `LegendList` that accepts
 * Uniwind class names, and screens use it for static content too: pass `data={[]}` and put the
 * content in `ListHeaderComponent`. Keep it the first element of a tab screen so iOS can find the
 * scroll view and minimize the native tab bar.
 */
export const ScrollList = withUniwind(LegendList) as typeof LegendList &
  ((props: ComponentProps<typeof LegendList> & ClassNames) => ReturnType<typeof LegendList>);
