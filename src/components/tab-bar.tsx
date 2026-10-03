import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/theme-provider';

type PlatformSymbols = Exclude<SymbolViewProps['name'], string>;

/** A symbol with a name on every platform (SymbolView allows omitting some). */
export type SymbolName = {
  ios: NonNullable<PlatformSymbols['ios']>;
  android: NonNullable<PlatformSymbols['android']>;
  web: NonNullable<PlatformSymbols['web']>;
};

export type TabBarItem = {
  key: string;
  label: string;
  icon: { inactive: SymbolName; active: SymbolName };
};

function TabIcon({ item, active }: { item: TabBarItem; active: boolean }) {
  const { tokens } = useAppTheme();
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const wasActive = useRef(active);

  useEffect(() => {
    // Telegram-style bounce: dip, then spring past 1 and settle. Only on becoming active.
    if (active && !wasActive.current && !reduceMotion) {
      scale.value = withSequence(
        withTiming(0.72, { duration: 90 }),
        withSpring(1, { damping: 6, stiffness: 320, mass: 0.6 }),
      );
    }
    wasActive.current = active;
  }, [active, reduceMotion, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={style}>
      <SymbolView
        name={active ? item.icon.active : item.icon.inactive}
        weight={active ? 'bold' : 'regular'}
        tintColor={active ? tokens.accentText : tokens.mutedText}
        size={28}
      />
    </Animated.View>
  );
}

export function TabBarView({
  items,
  activeKey,
  onSelect,
}: {
  items: TabBarItem[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      accessibilityRole="tablist"
      className="flex-row border-separator border-t bg-canvas px-2 pt-3"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}
    >
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(item.key)}
            className="min-h-14 flex-1 items-center justify-center gap-1 py-1"
          >
            <TabIcon item={item} active={active} />
            <Text
              className={`text-sm ${active ? 'font-semibold text-accent-text' : 'text-muted-text'}`}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
