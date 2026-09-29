import { isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform } from 'react-native';

export type TabBarKind = 'glass' | 'fallback';

export type GlassCapability = {
  os: string;
  liquidGlass: boolean;
  glassEffectApi: boolean;
};

/** Glass is used only when the OS and the runtime API both report support (iOS 26+). */
export function resolveTabBarKind({
  os,
  liquidGlass,
  glassEffectApi,
}: GlassCapability): TabBarKind {
  return os === 'ios' && liquidGlass && glassEffectApi ? 'glass' : 'fallback';
}

export function detectTabBarKind(): TabBarKind {
  return resolveTabBarKind({
    os: Platform.OS,
    liquidGlass: isLiquidGlassAvailable(),
    glassEffectApi: isGlassEffectAPIAvailable(),
  });
}
