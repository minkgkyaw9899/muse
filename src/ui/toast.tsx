import { GlassView } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AccessibilityInfo, Platform, Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SymbolName } from '@/components/tab-bar';
import { detectTabBarKind } from '@/theme/glass-capability';
import { useAppTheme } from '@/theme/theme-provider';

export type ToastKind = 'success' | 'error';
export type ToastRequest = { kind: ToastKind; message: string };
type ActiveToast = ToastRequest & { id: number };

/** Errors stay longer because they usually need to be read and acted on. */
const DURATION_MS: Record<ToastKind, number> = { success: 5000, error: 8000 };
const TOAST_RADIUS = 24;
/** The native tab bar's height cannot be measured: this clears its floating bar and the JS fallback bar. */
const TAB_BAR_CLEARANCE = 76;
const glassAvailable = detectTabBarKind() === 'glass';

const ICONS: Record<ToastKind, SymbolName> = {
  success: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  error: { ios: 'exclamationmark.triangle.fill', android: 'error', web: 'error' },
};

const ToastContext = createContext<{ show(toast: ToastRequest): void } | null>(null);

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}

function ActiveToastView({ toast, onDismiss }: { toast: ActiveToast; onDismiss(): void }) {
  const { tokens, scheme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();

  const content = (
    <View className="min-h-14 flex-row items-center gap-3 px-4 py-3">
      <SymbolView
        accessible={false}
        name={ICONS[toast.kind]}
        tintColor={toast.kind === 'error' ? tokens.destructive : tokens.accentText}
        size={24}
      />
      <Text className="flex-1 text-base text-text">{toast.message}</Text>
    </View>
  );

  // Bottom placement keeps the Library header actions (+ and Edit) tappable while a toast is up.
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: insets.bottom + TAB_BAR_CLEARANCE,
        paddingHorizontal: 16,
        pointerEvents: 'box-none',
      }}
    >
      <Animated.View
        key={toast.id}
        entering={reduceMotion ? undefined : FadeInDown.duration(200)}
        exiting={reduceMotion ? undefined : FadeOutDown.duration(150)}
      >
        <Pressable
          accessibilityRole="alert"
          accessibilityLabel={toast.message}
          accessibilityHint="Tap to dismiss"
          onPress={onDismiss}
          className="rounded-3xl"
        >
          {glassAvailable ? (
            <GlassView
              glassEffectStyle="regular"
              colorScheme={scheme}
              style={{ borderRadius: TOAST_RADIUS }}
            >
              {content}
            </GlassView>
          ) : (
            <View className="rounded-3xl border border-separator bg-surface">{content}</View>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

function ToastView({ toast, onDismiss }: { toast: ActiveToast | null; onDismiss(): void }) {
  return toast ? <ActiveToastView toast={toast} onDismiss={onDismiss} /> : null;
}

/** One toast at a time: a new one replaces the current one. Mount once near the app root. */
export function ToastProvider({ children }: PropsWithChildren) {
  const [toast, setToast] = useState<ActiveToast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const show = useCallback(
    (request: ToastRequest) => {
      clearTimer();
      nextId.current += 1;
      setToast({ ...request, id: nextId.current });
      if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(request.message);
      timer.current = setTimeout(dismiss, DURATION_MS[request.kind]);
    },
    [clearTimer, dismiss],
  );

  useEffect(() => clearTimer, [clearTimer]);

  const value = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastView toast={toast} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
