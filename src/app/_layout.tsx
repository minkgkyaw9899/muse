import { PortalHost } from '@rn-primitives/portal';
import { ThemeProvider as NavigationThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { ThemeProvider, useAppTheme } from '@/theme/theme-provider';

import '../global.css';

SplashScreen.preventAutoHideAsync();

function Shell() {
  const { navigationTheme } = useAppTheme();
  return (
    <NavigationThemeProvider value={navigationTheme}>
      <AnimatedSplashOverlay />
      <AppTabs />
      <PortalHost />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  );
}
