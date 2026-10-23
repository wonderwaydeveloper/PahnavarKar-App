import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { I18nManager, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppProvider, AuthProvider } from '@/context';
import { useAppContext } from '@/hooks/use-app-context';
import { NavigationBar } from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';
import { SafeAreaProvider } from 'react-native-safe-area-context';

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);
SplashScreen.preventAutoHideAsync().catch(() => undefined);

function AppContent() {
  const { themeReady } = useAppContext();

  if (!themeReady) {
    return null;
  }

  return <FontLoadedApp />;
}

function FontLoadedApp() {
  const { theme, colors } = useAppContext();
  const isLightTheme = theme === 'light';
  const headerBackgroundColor = isLightTheme ? colors.primary : colors.surface;
  const splashHiddenRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const syncSystemUi = async () => {
      try {
        await SystemUI.setBackgroundColorAsync(colors.background);

        if (!splashHiddenRef.current && !cancelled) {
          await new Promise<void>((resolve) => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => resolve());
            });
          });
          await SplashScreen.hideAsync();
          splashHiddenRef.current = true;
        }
      } catch {
        if (!splashHiddenRef.current && !cancelled) {
          await SplashScreen.hideAsync();
          splashHiddenRef.current = true;
        }
      }
    };

    void syncSystemUi();

    return () => {
      cancelled = true;
    };
  }, [colors.background]);

  return (
    <>
      <StatusBar barStyle={isLightTheme ? 'dark-content' : 'light-content'} backgroundColor={headerBackgroundColor} />
      <NavigationBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(tools)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
