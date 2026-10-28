import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { usePlanAccess } from '@/hooks/use-plan-access';
import { useTheme } from '@/hooks/use-theme';
import { fetchPaymentOrder, getStoredAuthToken, type PaymentOrderStatus } from '@/services/auth-api';
import { getUserFacingErrorMessage } from '@/services/user-facing-error';

type ReturnState = 'loading' | 'pending' | 'succeeded' | 'failed' | 'error';

export default function PaymentReturnScreen() {
    const theme = useTheme();
    const router = useRouter();
    const { orderId } = useLocalSearchParams<{ orderId?: string }>();
    const { refresh: refreshPlanAccess } = usePlanAccess();
    const [state, setState] = useState<ReturnState>('loading');
    const [errorMessage, setErrorMessage] = useState('');
    const [attempt, setAttempt] = useState(0);

    const checkOrder = useCallback(async () => {
        const id = Number(orderId);
        if (!Number.isSafeInteger(id) || id < 1) {
            setState('error');
            setErrorMessage('شناسهٔ سفارش پرداخت معتبر نیست.');
            return;
        }

        try {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('برای بررسی پرداخت، دوباره وارد حساب کاربری شوید.');

            const result: PaymentOrderStatus = await fetchPaymentOrder(token, id);
            if (result.order.status === 'succeeded') {
                await refreshPlanAccess();
                setState('succeeded');
                return;
            }
            if (result.order.status === 'failed') {
                setState('failed');
                return;
            }
            setState('pending');
        } catch (error) {
            setState('error');
            setErrorMessage(getUserFacingErrorMessage(error, 'بررسی وضعیت پرداخت ناموفق بود.'));
        }
    }, [orderId, refreshPlanAccess]);

    useEffect(() => {
        const timer = setTimeout(() => {
            void checkOrder();
        }, 0);

        return () => clearTimeout(timer);
    }, [attempt, checkOrder]);

    useEffect(() => {
        if (state !== 'pending') return;

        const timer = setInterval(() => setAttempt((value) => value + 1), 4000);
        const subscription = AppState.addEventListener('change', (appState) => {
            if (appState === 'active') setAttempt((value) => value + 1);
        });

        return () => {
            clearInterval(timer);
            subscription.remove();
        };
    }, [state]);

    const isLoading = state === 'loading' || state === 'pending';
    const icon = state === 'succeeded'
        ? 'check-circle-outline'
        : state === 'failed' || state === 'error' ? 'close-circle-outline' : 'progress-clock';
    const iconColor = state === 'succeeded'
        ? theme.success
        : state === 'failed' || state === 'error' ? theme.error : theme.primaryText;
    const title = state === 'succeeded'
        ? 'پرداخت با موفقیت تأیید شد'
        : state === 'failed' ? 'پرداخت تکمیل نشد'
            : state === 'error' ? 'بررسی پرداخت ناموفق بود' : 'در حال بررسی پرداخت';
    const description = state === 'succeeded'
        ? 'دسترسی پلن شما به‌روز شد. برای مشاهدهٔ وضعیت اشتراک به صفحهٔ پلن‌ها برگردید.'
        : state === 'failed' ? 'وضعیت سفارش ناموفق ثبت شده است. می‌توانید دوباره برای خرید اقدام کنید.'
            : state === 'error' ? errorMessage
                : 'پرداخت در درگاه انجام شده است؟ چند لحظه برای دریافت تأیید نهایی صبر کنید.';

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
                {state === 'error' && (
                    <Pressable accessibilityRole="button" onPress={() => setAttempt((value) => value + 1)}>
                        <ThemedText type="smallBold" themeColor="primaryText">تلاش دوباره</ThemedText>
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
    description: { lineHeight: 24, textAlign: 'center' },
    button: {
        minHeight: 48,
        alignSelf: 'stretch',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: Radius.md,
        marginTop: Spacing.two,
    },
});
