import { Typography } from '@/constants/typography';
import { Stack, usePathname, useRouter, type ErrorBoundaryProps } from 'expo-router';
import { Colors, getAppHeaderColors } from '@/constants/theme';
import type { NotificationResponse } from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { onlineManager, QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  BackHandler,
  I18nManager,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
  useColorScheme,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AccountAccessBanner, AccountSuspensionOverlay } from '@/components/account-access-feedback';
import { StartupLogoAnimation } from '@/components/startup-logo-animation';
import { AppFeedbackProvider, AppProvider, AuthProvider, PlanAccessProvider } from '@/context';
import { useAppContext } from '@/hooks/use-app-context';
import { useAuth } from '@/hooks/use-auth';
import { registerPlanAccessBackgroundTask } from '@/services/plan-access-background';
import { DEFAULT_QUERY_CACHE_OPTIONS } from '@/services/cache-policy';
import { AuthApiError, isTemporaryApiFailure } from '@/services/auth-api';
import {
  getServerConnectivityStatus,
  subscribeToServerConnectivity,
  setServerConnectivityAppActive,
  stopServerConnectivityMonitoring,
} from '@/services/server-connectivity';
import { NavigationBar } from 'expo-navigation-bar';
import * as SystemUI from 'expo-system-ui';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);
SplashScreen.preventAutoHideAsync().catch((error: unknown) => {
  console.error('جلوگیری از بسته‌شدن زودهنگام صفحهٔ آغاز ناموفق بود.', error);
});

function AppContent() {
  const { themeReady } = useAppContext();

  if (!themeReady) {
    return null;
  }

  return <FontLoadedApp />;
}

function NotificationResponseHandler() {
  const router = useRouter();
  const { user } = useAuth();
  const lastResponseIdentifier = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let active = true;
    let subscription: { remove: () => void } | undefined;

    const openInbox = (response: NotificationResponse) => {
      if (!active || lastResponseIdentifier.current === response.notification.request.identifier) return;
      lastResponseIdentifier.current = response.notification.request.identifier;
      if (typeof response.notification.request.content.data?.event !== 'string') return;

      router.push(user ? '/(tabs)/account/notifications' as never : '/auth?returnTo=notifications' as never);
    };

    void import('expo-notifications')
      .then(async (Notifications) => {
        if (!active) return;
        const handleResponse = (response: NotificationResponse) => {
          openInbox(response);
          void Notifications.clearLastNotificationResponseAsync().catch((error: unknown) => {
            console.error('پاک‌کردن پاسخ اعلان بازشده ناموفق بود.', error);
          });
        };
        subscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
        const lastResponse = await Notifications.getLastNotificationResponseAsync();
        if (lastResponse) handleResponse(lastResponse);
      })
      .catch((error: unknown) => {
        console.error('راه‌اندازی مسیر بازشدن اعلان ناموفق بود.', error);
      });

    return () => {
      active = false;
      subscription?.remove();
    };
  }, [router, user]);

  return null;
}

function FontLoadedApp() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, colors } = useAppContext();
  const insets = useSafeAreaInsets();
  const headerColors = getAppHeaderColors(colors, theme);
  const headerBackgroundColor = headerColors.background;
  const splashHiddenRef = useRef(false);
  const [splashScreenHidden, setSplashScreenHidden] = useState(false);
  const [startupAnimationComplete, setStartupAnimationComplete] = useState(false);
  const lastExitPromptAt = useRef(0);
  const finishStartupAnimation = useCallback(() => setStartupAnimationComplete(true), []);

  useEffect(() => {
    lastExitPromptAt.current = 0;
  }, [pathname]);

  useEffect(() => {
    if (Platform.OS !== 'android' || !startupAnimationComplete) return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) return false;

      const now = Date.now();
      if (now - lastExitPromptAt.current < 2000) return false;

      lastExitPromptAt.current = now;
      ToastAndroid.show('برای خروج از برنامه دوباره کلیک کنید', ToastAndroid.SHORT);
      return true;
    });

    return () => subscription.remove();
  }, [router, startupAnimationComplete]);

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
          setSplashScreenHidden(true);
        }
      } catch (error) {
        console.error('به‌روزرسانی رابط سیستم ناموفق بود.', error);
        if (!splashHiddenRef.current && !cancelled) {
          try {
            await SplashScreen.hideAsync();
            splashHiddenRef.current = true;
            setSplashScreenHidden(true);
          } catch (hideError) {
            console.error('بستن صفحهٔ آغاز ناموفق بود.', hideError);
          }
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
      <StatusBar
        barStyle={headerColors.statusBarStyle}
      />
      <View
        pointerEvents="none"
        style={[styles.statusBarBackground, { height: insets.top, backgroundColor: headerBackgroundColor }]}
      />
      <NavigationBar style={theme === 'dark' ? 'light' : 'dark'} />
      <View style={styles.appContent}>
        <NotificationResponseHandler />
        <AccountAccessBanner />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen name="payment-return" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(tools)" options={{ headerShown: false }} />
        </Stack>
        <AccountSuspensionOverlay />
      </View>
      {!startupAnimationComplete ? (
        <StartupLogoAnimation
          startAnimation={splashScreenHidden}
          onComplete={finishStartupAnimation}
        />
      ) : null}
    </>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        ...DEFAULT_QUERY_CACHE_OPTIONS,
        refetchOnReconnect: true,
        retry: (failureCount, error) => (
          failureCount < 1
          && !(error instanceof AuthApiError)
          && isTemporaryApiFailure(error)
        ),
        retryDelay: 1000,
      },
    },
  }));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      focusManager.setFocused(status === 'active');
      setServerConnectivityAppActive(status === 'active');
    });
    setServerConnectivityAppActive(
      AppState.currentState !== 'background' && AppState.currentState !== 'inactive',
    );

    return () => {
      subscription.remove();
      setServerConnectivityAppActive(false);
    };
  }, []);

  useEffect(() => {
    onlineManager.setEventListener((setOnline) => {
      const updateOnlineStatus = () => {
        setOnline(getServerConnectivityStatus() === 'connected');
      };
      updateOnlineStatus();
      const unsubscribe = subscribeToServerConnectivity(updateOnlineStatus);
      return () => {
        unsubscribe();
      };
    });

    return () => {
      onlineManager.setEventListener(() => () => {});
      stopServerConnectivityMonitoring();
    };
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
            <AppFeedbackProvider>
              <AuthProvider>
                <PlanAccessProvider>
                  <AppContent />
                </PlanAccessProvider>
              </AuthProvider>
            </AppFeedbackProvider>
          </AppProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];

  useEffect(() => {
    console.error('خطای پیش‌بینی‌نشده در مسیریابی برنامه رخ داد.', error);
  }, [error]);

  return (
    <View style={[errorStyles.container, { backgroundColor: colors.background }]}>
      <View style={[errorStyles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text accessibilityRole="header" style={[errorStyles.title, { color: colors.text }]}>صفحه بارگذاری نشد</Text>
        <Text accessibilityRole="alert" style={[errorStyles.message, { color: colors.textSecondary }]}>
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
  title: { fontSize: Typography.fontSize.titleSmall, fontWeight: '700', textAlign: 'center' },
  message: { fontSize: Typography.fontSize.body, lineHeight: Typography.lineHeight.comfortable, textAlign: 'center' },
  button: { minHeight: 48, minWidth: 170, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingHorizontal: 20 },
  buttonText: { fontSize: Typography.fontSize.body, fontWeight: '700' },
});

const styles = StyleSheet.create({
  statusBarBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  appContent: { flex: 1 },
});
