import { Typography } from '@/constants/typography';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from 'react-native';
import { onlineManager, useQueryClient } from '@tanstack/react-query';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { CACHE_KEYS } from '@/services/cache-policy';
import { useOnlineRefetch } from '@/hooks/use-online-refetch';
import { useOfflinePageNotice } from '@/hooks/use-offline-page-notice';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { useTheme } from '@/hooks/use-theme';
import { ACCOUNT_OFFLINE_CACHE, saveOfflineCacheValue } from '@/services/account-offline-cache';
import { fetchPaymentOrder, getStoredAuthToken, isTemporaryApiFailure, type PaymentOrderStatus } from '@/services/auth-api';
import { getUserFacingErrorMessage } from '@/services/user-facing-error';

type ReturnState = 'loading' | 'pending' | 'succeeded' | 'failed' | 'error' | 'access-error';
const MAX_AUTOMATIC_CHECKS = 6;

export default function PaymentReturnScreen() {
    const theme = useTheme();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { user, isLoading: authLoading } = useAuth();
    const { orderId } = useLocalSearchParams<{ orderId?: string }>();
    const isOnline = useOnlineStatus();
    const [state, setState] = useState<ReturnState>('loading');
    const [errorMessage, setErrorMessage] = useState('');
    const [attempt, setAttempt] = useState(0);
    const [autoPolling, setAutoPolling] = useState(true);
    const automaticChecks = useRef(0);
    const checkInFlight = useRef(false);
    const [hasConfirmedPendingStatus, setHasConfirmedPendingStatus] = useState(false);

    const awaitingPaymentResult = state !== 'succeeded' && state !== 'failed';
    const hasOfflinePaymentData = hasConfirmedPendingStatus || state === 'access-error';
    useOfflinePageNotice(!isOnline && awaitingPaymentResult ? {
        hasSavedData: hasOfflinePaymentData,
        message: state === 'access-error'
            ? 'پرداخت تأیید شد؛ به‌روزرسانی اشتراک نیاز به اتصال دارد.'
            : hasConfirmedPendingStatus
                ? 'نتیجهٔ پرداخت هنوز قطعی نیست.'
                : 'اتصال به سرور برای تأیید پرداخت لازم است.',
        details: state === 'access-error'
            ? ['پرداخت موفق بوده است؛ برای تازه‌سازی دسترسی پلن دوباره متصل شوید.']
            : hasConfirmedPendingStatus
            ? ['آخرین وضعیت سفارش در انتظار تأیید بوده است؛ نتیجهٔ نهایی پس از اتصال دوباره بررسی می‌شود.']
            : ['وضعیت پرداخت هنوز از سرور دریافت نشده است.'],
    } : null);

    const checkOrder = useCallback(async (keepPendingOnFailure = false) => {
        if (authLoading || checkInFlight.current) return;
        checkInFlight.current = true;
        try {
            const id = Number(orderId);
            if (!Number.isSafeInteger(id) || id < 1) {
                setState('error');
                setErrorMessage('شناسهٔ سفارش پرداخت معتبر نیست.');
                return;
            }
            if (!onlineManager.isOnline()) {
                setState('pending');
                setErrorMessage('اتصال به سرور برقرار نیست؛ وضعیت پرداخت پس از اتصال دوباره بررسی می‌شود.');
                return;
            }

            const token = await getStoredAuthToken();
            if (!token) throw new Error('برای بررسی پرداخت، دوباره وارد حساب کاربری شوید.');

            const result: PaymentOrderStatus = await fetchPaymentOrder(token, id);
            setErrorMessage('');
            if (result.order.status === 'succeeded') {
                setHasConfirmedPendingStatus(false);
                try {
                    if (!user) throw new Error('برای به‌روزرسانی وضعیت اشتراک، دوباره وارد حساب کاربری شوید.');
                    const emptyPendingOrder = { order: null, payments: [] };
                    queryClient.setQueryData(CACHE_KEYS.pendingSubscriptionOrder(user.id), emptyPendingOrder);
                    await saveOfflineCacheValue(
                        user.id,
                        ACCOUNT_OFFLINE_CACHE.pendingSubscriptionOrder,
                        emptyPendingOrder,
                    );
                    await Promise.all([
                        queryClient.invalidateQueries({ queryKey: CACHE_KEYS.currentPlan(user.id) }),
                        queryClient.invalidateQueries({ queryKey: CACHE_KEYS.walletOverview(user.id) }),
                        queryClient.invalidateQueries({
                            queryKey: CACHE_KEYS.pendingSubscriptionOrder(user.id),
                            refetchType: 'none',
                        }),
                        queryClient.invalidateQueries({ queryKey: CACHE_KEYS.planCatalog }),
                    ]);
                    await queryClient.refetchQueries({
                        queryKey: CACHE_KEYS.planAccess(user.id),
                        type: 'active',
                    }, {
                        throwOnError: true,
                    });
                    setState('succeeded');
                } catch (error) {
                    setState('access-error');
                    setErrorMessage(getUserFacingErrorMessage(error, 'به‌روزرسانی دسترسی اشتراک ناموفق بود.'));
                }
                return;
            }
            if (result.order.status === 'failed') {
                setHasConfirmedPendingStatus(false);
                if (user) {
                    const emptyPendingOrder = { order: null, payments: [] };
                    queryClient.setQueryData(CACHE_KEYS.pendingSubscriptionOrder(user.id), emptyPendingOrder);
                    await saveOfflineCacheValue(
                        user.id,
                        ACCOUNT_OFFLINE_CACHE.pendingSubscriptionOrder,
                        emptyPendingOrder,
                    );
                    await Promise.all([
                        queryClient.invalidateQueries({ queryKey: CACHE_KEYS.walletOverview(user.id) }),
                        queryClient.invalidateQueries({
                            queryKey: CACHE_KEYS.pendingSubscriptionOrder(user.id),
                            refetchType: 'none',
                        }),
                        queryClient.invalidateQueries({ queryKey: CACHE_KEYS.planCatalog }),
                    ]);
                }
                setState('failed');
                return;
            }
            setHasConfirmedPendingStatus(true);
            setState('pending');
        } catch (error) {
            setState(keepPendingOnFailure || isTemporaryApiFailure(error) ? 'pending' : 'error');
            setErrorMessage(getUserFacingErrorMessage(error, 'بررسی وضعیت پرداخت ناموفق بود.'));
        } finally {
            checkInFlight.current = false;
        }
    }, [authLoading, orderId, queryClient, user]);
    useOnlineRefetch(() => {
        if (state === 'succeeded' || state === 'failed') return;
        automaticChecks.current = 0;
        setAutoPolling(true);
        void checkOrder(true);
    }, !authLoading);

    useEffect(() => {
        const timer = setTimeout(() => {
            void checkOrder();
        }, 0);

        return () => clearTimeout(timer);
    }, [attempt, checkOrder]);

    useEffect(() => {
        if (state !== 'pending') return;

        const checkAutomatically = async () => {
            if (checkInFlight.current) return;
            if (!onlineManager.isOnline()) return;
            if (automaticChecks.current >= MAX_AUTOMATIC_CHECKS) {
                setAutoPolling(false);
                return;
            }
            automaticChecks.current += 1;
            await checkOrder(true);
        };
        if (!autoPolling || !isOnline) return;

        const timer = setInterval(() => void checkAutomatically(), 4000);
        const subscription = AppState.addEventListener('change', (appState) => {
            if (appState === 'active') void checkAutomatically();
        });

        return () => {
            clearInterval(timer);
            subscription.remove();
        };
    }, [autoPolling, checkOrder, isOnline, state]);

    const isLoading = state === 'loading';
    const icon = state === 'succeeded'
        ? 'check-circle-outline'
        : state === 'failed' || state === 'error' || state === 'access-error' ? 'close-circle-outline' : 'progress-clock';
    const iconColor = state === 'succeeded'
        ? theme.success
        : state === 'failed' || state === 'error' || state === 'access-error' ? theme.error : theme.primaryText;
    const title = state === 'succeeded'
        ? 'پرداخت با موفقیت تأیید شد'
        : state === 'failed' ? 'پرداخت تکمیل نشد'
            : state === 'access-error' ? 'پرداخت تأیید شد'
            : state === 'error' ? 'بررسی پرداخت ناموفق بود'
                : state === 'pending' ? 'نتیجهٔ پرداخت هنوز قطعی نیست' : 'در حال بررسی پرداخت';
    const description = state === 'succeeded'
        ? 'دسترسی پلن شما به‌روز شد. برای مشاهدهٔ وضعیت اشتراک به صفحهٔ پلن‌ها برگردید.'
        : state === 'failed' ? 'وضعیت سفارش ناموفق ثبت شده است. می‌توانید دوباره برای خرید اقدام کنید.'
            : state === 'access-error' ? `پرداخت موفق بود، اما وضعیت اشتراک به‌روز نشد. ${errorMessage}`
            : state === 'error' ? errorMessage
                : `${errorMessage ? `آخرین بررسی موفق نبود: ${errorMessage} ` : ''}نتیجهٔ پرداخت هنوز قطعی نشده است و سفارش تا تأیید نهایی باز می‌ماند. لازم نیست این صفحه را باز نگه دارید؛ تا مشخص‌شدن نتیجه پرداخت دیگری انجام ندهید. می‌توانید بعداً از صفحهٔ پلن‌ها وضعیت سفارش را بررسی کنید.`;

    return (
        <ThemedView style={styles.container}>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                {isLoading
                    ? <ActivityIndicator size="large" color={theme.primaryText} />
                    : <MaterialCommunityIcons name={icon} size={52} color={iconColor} />}
                <ThemedText type="title" style={styles.title}>{title}</ThemedText>
                <ThemedText type="body" themeColor="textSecondary" style={styles.description}>
                    {description}
                </ThemedText>
                {(state === 'error' || state === 'access-error' || state === 'pending') && (
                    <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                            automaticChecks.current = 0;
                            setAutoPolling(true);
                            setState('loading');
                            setAttempt((value) => value + 1);
                        }}
                    >
                        <ThemedText type="smallBold" themeColor="primaryText">
                            {state === 'pending' ? 'بررسی وضعیت دوباره' : 'تلاش دوباره'}
                        </ThemedText>
                    </Pressable>
                )}
                <Pressable
                    accessibilityRole="button"
                    onPress={() => router.replace('/(tabs)/account/plans')}
                    style={[styles.button, { backgroundColor: theme.primary }]}
                >
                    <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>بازگشت به پلن‌ها</ThemedText>
                </Pressable>
            </View>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: Spacing.four },
    card: {
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: Radius.lg,
        gap: Spacing.three,
        padding: Spacing.five,
    },
    title: { textAlign: 'center' },
    description: { lineHeight: Typography.lineHeight.comfortable, textAlign: 'center' },
    button: {
        minHeight: 48,
        alignSelf: 'stretch',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: Radius.md,
        marginTop: Spacing.two,
    },
});
