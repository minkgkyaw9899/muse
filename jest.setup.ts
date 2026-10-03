// Reanimated and worklets need native modules; use their official jest mocks.
jest.mock('react-native-reanimated', () => ({
  ...require('react-native-reanimated/mock'),
  useReducedMotion: () => false,
}));
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));

type MockListProps = {
  data: unknown[];
  renderItem(info: { item: unknown; index: number }): unknown;
  keyExtractor?(item: unknown, index: number): string;
  ListHeaderComponent?: unknown;
  ListFooterComponent?: unknown;
  ListEmptyComponent?: unknown;
  contentContainerStyle?: unknown;
  style?: unknown;
  contentInsetAdjustmentBehavior?: string;
  keyboardShouldPersistTaps?: string;
};

// LegendList renders rows only after it measures a layout, which React Native Testing Library never
// provides. This shim keeps its public contract (data, renderItem, header, empty state and footer)
// so rendered tests still observe the screens' real output.
jest.mock('@legendapp/list/react-native', () => {
  const { createElement, isValidElement } = require('react');
  const { ScrollView, View } = require('react-native');
  const part = (component: unknown) =>
    isValidElement(component)
      ? component
      : typeof component === 'function'
        ? createElement(component as never)
        : null;
  return {
    LegendList: ({
      data,
      renderItem,
      keyExtractor,
      ListHeaderComponent,
      ListFooterComponent,
      ListEmptyComponent,
      contentContainerStyle,
      style,
      contentInsetAdjustmentBehavior,
      keyboardShouldPersistTaps,
    }: MockListProps) =>
      createElement(
        ScrollView,
        { style, contentContainerStyle, contentInsetAdjustmentBehavior, keyboardShouldPersistTaps },
        part(ListHeaderComponent),
        data.length === 0
          ? part(ListEmptyComponent)
          : data.map((item: unknown, index: number) =>
              createElement(
                View,
                { key: keyExtractor ? keyExtractor(item, index) : index },
                renderItem({ item, index }),
              ),
            ),
        part(ListFooterComponent),
      ),
  };
});
