import { GlassView } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import androidBold from 'expo-symbols/androidWeights/bold';
import { Pressable, Text, View } from 'react-native';

import type { SymbolName } from '@/components/tab-bar';
import { detectTabBarKind } from '@/theme/glass-capability';
import { useAppTheme } from '@/theme/theme-provider';

const glassAvailable = detectTabBarKind() === 'glass';
/** Half the 56-point minimum control height: a circle for icons, a pill for text. */
const ACTION_RADIUS = 28;

/** Accessible Library header action with a complete non-glass surface. */
export function HeaderAction({
  label,
  hint,
  icon,
  text,
  disabled = false,
  onPress,
}: {
  label: string;
  hint?: string;
  icon?: SymbolName;
  text?: string;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const { tokens, scheme } = useAppTheme();
  const content = (
    <View
      className={`min-h-14 min-w-14 items-center justify-center px-4 ${disabled ? 'opacity-40' : ''}`}
    >
      {icon ? (
        <SymbolView
          accessible={false}
          name={icon}
          weight={{ ios: 'bold', android: androidBold }}
          tintColor={tokens.accent}
          size={32}
        />
      ) : (
        <Text className="font-semibold text-text text-xl">{text}</Text>
      )}
    </View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className="rounded-full active:opacity-60"
    >
      {glassAvailable ? (
        <GlassView
          glassEffectStyle="regular"
          colorScheme={scheme}
          isInteractive={!disabled}
          style={{ borderRadius: ACTION_RADIUS }}
        >
          {content}
        </GlassView>
      ) : (
        <View className="rounded-full border border-separator bg-surface">{content}</View>
      )}
    </Pressable>
  );
}
