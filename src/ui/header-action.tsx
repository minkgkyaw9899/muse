import { GlassView } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import androidBold from 'expo-symbols/androidWeights/bold';
import { Pressable, Text, View } from 'react-native';

import type { SymbolName } from '@/components/tab-bar';
import { detectTabBarKind } from '@/theme/glass-capability';
import { useAppTheme } from '@/theme/theme-provider';

const glassAvailable = detectTabBarKind() === 'glass';
/** Glass icons have a 40-point surface; text actions retain their 56-point pill. */
const ACTION_RADIUS = 28;

/** Accessible Library header action with a complete non-glass surface. */
export function HeaderAction({
  label,
  hint,
  icon,
  text,
  compact = false,
  disabled = false,
  onPress,
}: {
  label: string;
  hint?: string;
  icon?: SymbolName;
  text?: string;
  compact?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const { tokens, scheme } = useAppTheme();
  const smallGlassIcon = glassAvailable && !!icon;
  const content = (
    <View
      className={`${compact ? 'h-11 w-11' : smallGlassIcon ? 'h-10 w-10' : 'min-h-14 min-w-14 px-4'} items-center justify-center ${disabled ? 'opacity-40' : ''}`}
    >
      {icon ? (
        <SymbolView
          accessible={false}
          name={icon}
          weight={{ ios: 'bold', android: androidBold }}
          tintColor={tokens.accent}
          size={22}
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
      className="min-h-11 min-w-11 items-center justify-center rounded-full active:opacity-60"
    >
      {compact ? (
        content
      ) : glassAvailable ? (
        <GlassView
          glassEffectStyle="regular"
          colorScheme={scheme}
          isInteractive={!disabled}
          style={{ borderRadius: smallGlassIcon ? 20 : ACTION_RADIUS }}
        >
          {content}
        </GlassView>
      ) : (
        <View className="rounded-full border border-separator bg-surface">{content}</View>
      )}
    </Pressable>
  );
}
