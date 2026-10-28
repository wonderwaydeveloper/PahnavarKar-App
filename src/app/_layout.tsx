import { Stack, type ErrorBoundaryProps } from 'expo-router';
import * as Network from 'expo-network';
import * as SplashScreen from 'expo-splash-screen';
import { onlineManager, QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AppState, I18nManager, Pressable, StatusBar, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { NetworkStatusBanner } from '@/components/network-status-banner';
import { AppProvider, AuthProvider, PlanAccessProvider } from '@/context';
import { useAppContext } from '@/hooks/use-app-context';
import { registerPlanAccessBackgroundTask } from '@/services/plan-access-background';
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
      <View style={styles.appContent}>
        <NetworkStatusBanner />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen name="payment-return" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(tools)" options={{ headerShown: false }} />
        </Stack>
      </View>
    </>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 10 * 60 * 1000,
        staleTime: 30 * 1000,
        refetchOnReconnect: true,
      },
    },
  }));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      focusManager.setFocused(status === 'active');
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    onlineManager.setEventListener((setOnline) => {
      let receivedNetworkEvent = false;
      let isActive = true;
      const subscription = Network.addNetworkStateListener((state) => {
        receivedNetworkEvent = true;
        setOnline(state.isConnected !== false && state.isInternetReachable !== false);
      });

      void Network.getNetworkStateAsync()
        .then((state) => {
          if (isActive && !receivedNetworkEvent) {
            setOnline(state.isConnected !== false && state.isInternetReachable !== false);
          }
        })
        .catch((error: unknown) => {
          console.error('دریافت وضعیت اولیهٔ اتصال شبکه ناموفق بود.', error);
        });

      return () => {
        isActive = false;
        subscription.remove();
      };
    });
  }, []);

  useEffect(() => {
    void registerPlanAccessBackgroundTask().catch((error: unknown) => {
      console.error('ثبت به‌روزرسانی پس‌زمینهٔ دسترسی ناموفق بود.', error);
    });
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppProvider>
            <AuthProvider>
              <PlanAccessProvider>
                <AppContent />
              </PlanAccessProvider>
            </AuthProvider>
          </AppProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const isDark = useColorScheme() === 'dark';
  const colors = isDark
    ? { background: '#041E28', surface: '#082933', text: '#F4FAFF', secondary: '#B7D4E1', primary: '#4BD1E0', onPrimary: '#00363F', border: '#244A57' }
    : { background: '#EFF8FA', surface: '#FFFFFF', text: '#102A39', secondary: '#4B6275', primary: '#26C6DA', onPrimary: '#00363F', border: '#BBD9DE' };

  useEffect(() => {
    console.error('خطای پیش‌بینی‌نشده در مسیریابی برنامه رخ داد.', error);
  }, [error]);

  return (
    <View style={[errorStyles.container, { backgroundColor: colors.background }]}>
      <View style={[errorStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text accessibilityRole="header" style={[errorStyles.title, { color: colors.text }]}>صفحه بارگذاری نشد</Text>
        <Text accessibilityRole="alert" style={[errorStyles.message, { color: colors.secondary }]}>
          مشکلی پیش آمد. دوباره تلاش کنید؛ اگر مشکل ادامه داشت، برنامه را ببندید و دوباره باز کنید.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void retry()}
          style={({ pressed }) => [errorStyles.button, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={[errorStyles.buttonText, { color: colors.onPrimary }]}>بارگذاری دوباره</Text>
        </Pressable>
      </View>
    </View>
  );
}

const errorStyles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  card: { alignItems: 'center', gap: 16, borderWidth: 1, borderRadius: 20, padding: 24 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  message: { fontSize: 15, lineHeight: 24, textAlign: 'center' },
  button: { minHeight: 48, minWidth: 170, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingHorizontal: 20 },
  buttonText: { fontSize: 15, fontWeight: '700' },
});

const styles = StyleSheet.create({
  appContent: { flex: 1 },
});
