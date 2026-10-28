import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Snackbar } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { usePlanAccess } from '@/hooks/use-plan-access';
import { useTheme } from '@/hooks/use-theme';
import {
    fetchPaymentOrder,
    fetchPendingSubscriptionOrder,
    fetchCurrentPlan,
    fetchPlanCatalog,
    getStoredAuthToken,
    purchaseSubscription,
    quoteSubscription,
    type PaymentOrderStatus,
    type PlanCatalog,
    type PlanOffer,
    type ScheduledSubscription,
    type SubscriptionQuote,
} from '@/services/auth-api';
import { getUserFacingErrorMessage } from '@/services/user-facing-error';
import { hasPlanFeature } from '@/utils/plan-access';

type SnackbarKind = 'info' | 'success' | 'error';

const TIER_COLORS: Record<string, { background: string; border: string; accent: string }> = {
    free: { background: '#E7F8F0', border: '#9AD6B7', accent: '#16794B' },
    bronze: { background: '#FFF1E8', border: '#E8B18A', accent: '#A44E20' },
    silver: { background: '#EEF2F6', border: '#B9C4CF', accent: '#586575' },
    gold: { background: '#FFF7DF', border: '#E8C65A', accent: '#956900' },
};

function money(value: number): string {
    return `${new Intl.NumberFormat('fa-IR').format(value)} تومان`;
}

function formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? 'پس از تأیید پرداخت'
        : new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

function getChangeDescription(quote: SubscriptionQuote): string {
    if (quote.change_type === 'upgrade') {
        return `ارتقای فوری؛ اعتبار ${money(quote.credit_amount)} بابت زمان باقی‌ماندهٔ اشتراک فعلی کسر شده است. پایان دسترسی در ${formatDate(quote.ends_at)} حفظ می‌شود.`;
    }
    if (quote.change_type === 'scheduled') {
        return `این پلن پس از پایان اشتراک فعلی، از ${formatDate(quote.starts_at)} فعال می‌شود. مبلغ دوره اکنون پرداخت می‌شود.`;
    }
    return `اشتراک پس از تأیید پرداخت فعال می‌شود و تا ${formatDate(quote.ends_at)} اعتبار دارد.`;
}

export default function PlansScreen() {
    const theme = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { user } = useAuth();
    const { planAccess, refresh: refreshPlanAccess } = usePlanAccess();
    const [catalog, setCatalog] = useState<PlanCatalog | null>(null);
    const [selectedTier, setSelectedTier] = useState('bronze');
    const [selectedDuration, setSelectedDuration] = useState('1_month');
    const [expandedFeatures, setExpandedFeatures] = useState<Record<string, boolean>>({});
    const [discountCode, setDiscountCode] = useState('');
    const [quote, setQuote] = useState<SubscriptionQuote | null>(null);
    const [quoteDiscountCode, setQuoteDiscountCode] = useState('');
    const [quoteError, setQuoteError] = useState('');
    const [loadingCatalog, setLoadingCatalog] = useState(true);
    const [loadingQuote, setLoadingQuote] = useState(false);
    const [purchasing, setPurchasing] = useState(false);
    const [pendingOrderId, setPendingOrderId] = useState<number | null>(null);
    const [pendingOrderDetails, setPendingOrderDetails] = useState<PaymentOrderStatus['order'] | null>(null);
    const [scheduledSubscription, setScheduledSubscription] = useState<ScheduledSubscription | null>(null);
    const [orderStatus, setOrderStatus] = useState<PaymentOrderStatus['order']['status'] | null>(null);
    const [message, setMessage] = useState('');
    const [messageKind, setMessageKind] = useState<SnackbarKind>('info');
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const quoteRequestId = useRef(0);

    const currentTier = planAccess?.key ?? 'free';
    const currentTierName = planAccess?.is_unlimited
        ? 'دسترسی مدیریتی نامحدود'
        : catalog?.tiers.find((tier) => tier.key === currentTier)?.name ?? 'رایگان';
    const selectedOfferKey = `${selectedTier}_${selectedDuration}`;
    const selectedOffer = catalog?.offers.find((offer) => offer.key === selectedOfferKey) ?? null;
    const normalizedDiscountCode = discountCode.trim().toUpperCase();
    const hasCurrentQuote = quote?.plan_key === selectedOfferKey
        && quoteDiscountCode === normalizedDiscountCode;
    const selectedTierInfo = catalog?.tiers.find((tier) => tier.key === selectedTier);
    const selectedTierColor = TIER_COLORS[selectedTier] ?? TIER_COLORS.free;
    const selectedFeatures = catalog
        ? Object.entries(catalog.feature_catalog).filter(([key]) => hasPlanFeature(selectedTierInfo, key))
        : [];

    const showMessage = (text: string, kind: SnackbarKind = 'info') => {
        setMessage(text);
        setMessageKind(kind);
        setSnackbarVisible(true);
    };

    const invalidateQuote = () => {
        quoteRequestId.current += 1;
        setQuote(null);
        setQuoteDiscountCode('');
        setQuoteError('');
        setLoadingQuote(false);
    };

    const loadCatalog = useCallback(async () => {
        try {
            const data = await fetchPlanCatalog();
            setCatalog(data);
            const firstOffer = data.offers.find((offer) => offer.is_available);
            if (firstOffer) {
                setSelectedTier(firstOffer.tier);
                setSelectedDuration(firstOffer.duration);
            }
        } catch (error) {
            showMessage(getUserFacingErrorMessage(error, 'بارگذاری پلن‌ها ناموفق بود.'), 'error');
        } finally {
            setLoadingCatalog(false);
        }
    }, []);

    useEffect(() => {
        let mounted = true;
        const fetchCatalog = async () => {
            try {
                const data = await fetchPlanCatalog();
                if (!mounted) return;
                setCatalog(data);
                const firstOffer = data.offers.find((offer) => offer.is_available);
                if (firstOffer) {
                    setSelectedTier(firstOffer.tier);
                    setSelectedDuration(firstOffer.duration);
                }
            } catch (error) {
                if (mounted) showMessage(getUserFacingErrorMessage(error, 'بارگذاری پلن‌ها ناموفق بود.'), 'error');
            } finally {
                if (mounted) setLoadingCatalog(false);
            }
        };
        void fetchCatalog();
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        if (!user) return;
        let mounted = true;
        const loadSubscription = async () => {
            try {
                const token = await getStoredAuthToken();
                if (!token) throw new Error('نشست کاربری برای دریافت اشتراک در دسترس نیست.');
                const result = await fetchCurrentPlan(token);
                if (mounted) setScheduledSubscription(result.scheduled_subscription);
            } catch (error) {
                if (mounted) showMessage(getUserFacingErrorMessage(error, 'دریافت وضعیت اشتراک ناموفق بود.'), 'error');
            }
        };
        void loadSubscription();
        return () => {
            mounted = false;
        };
    }, [user]);

    const refreshSubscriptionState = useCallback(async () => {
        await refreshPlanAccess();
        const token = await getStoredAuthToken();
        if (!token) {
            throw new Error('نشست کاربری برای دریافت وضعیت جدید پلن در دسترس نیست.');
        }
        const current = await fetchCurrentPlan(token);
        setScheduledSubscription(current.scheduled_subscription);
    }, [refreshPlanAccess]);

    const checkOrder = useCallback(async (orderId: number) => {
        const token = await getStoredAuthToken();
        if (!token) {
            throw new Error('نشست کاربری در دسترس نیست. دوباره وارد شوید.');
        }
        const result = await fetchPaymentOrder(token, orderId);
        setPendingOrderDetails(result.order);
        setOrderStatus(result.order.status);
        if (result.order.status === 'succeeded') {
            setPendingOrderId(null);
            setPendingOrderDetails(null);
            try {
                await refreshSubscriptionState();
                showMessage('پرداخت با موفقیت تأیید شد و دسترسی پلن به‌روز شد.', 'success');
            } catch (error) {
                const detail = error instanceof Error ? ` ${error.message}` : '';
                showMessage(`پرداخت تأیید شد، اما به‌روزرسانی وضعیت پلن ناموفق بود.${detail}`, 'error');
            }
        } else if (result.order.status === 'failed') {
            setPendingOrderId(null);
            setPendingOrderDetails(null);
            showMessage('پرداخت تکمیل نشد. می‌توانید دوباره برای خرید اقدام کنید.', 'error');
        }
        return result;
    }, [refreshSubscriptionState]);

    useEffect(() => {
        if (!user) {
            setPendingOrderId(null);
            setPendingOrderDetails(null);
            return;
        }

        let mounted = true;
        const restorePendingOrder = async () => {
            try {
                const token = await getStoredAuthToken();
                if (!token) throw new Error('نشست کاربری برای بررسی سفارش در دسترس نیست.');
                const result = await fetchPendingSubscriptionOrder(token);
                if (!mounted) return;
                if (!result.order) {
                    setPendingOrderId(null);
                    setPendingOrderDetails(null);
                    return;
                }

                setPendingOrderId(result.order.id);
                setPendingOrderDetails(result.order);
                setOrderStatus(result.order.status);
                await checkOrder(result.order.id);
            } catch (error) {
                if (mounted) {
                    showMessage(getUserFacingErrorMessage(error, 'بازیابی وضعیت خرید ناموفق بود.'), 'error');
                }
            }
        };

        void restorePendingOrder();
        return () => {
            mounted = false;
        };
    }, [user, checkOrder]);

    useEffect(() => {
        if (!pendingOrderId) return;

        const poll = async () => {
            if (AppState.currentState !== 'active') return;
            try {
                await checkOrder(pendingOrderId);
            } catch (error) {
                showMessage(getUserFacingErrorMessage(error, 'بررسی وضعیت پرداخت ناموفق بود.'), 'error');
            }
        };
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active') void poll();
        });
        const timer = setInterval(() => void poll(), 7000);

        return () => {
            subscription.remove();
            clearInterval(timer);
        };
    }, [checkOrder, pendingOrderId]);

    const loadQuote = useCallback(async (code: string) => {
        if (!selectedOffer) return;
        if (!user) return;
        const requestId = ++quoteRequestId.current;
        const requestedDiscountCode = code.trim().toUpperCase();
        setLoadingQuote(true);
        setQuote(null);
        setQuoteDiscountCode('');
        setQuoteError('');
        try {
            const token = await getStoredAuthToken();
            if (!token) {
                throw new Error('نشست کاربری برای دریافت مبلغ نهایی در دسترس نیست. دوباره وارد شوید.');
            }
            const result = await quoteSubscription(token, {
                plan_key: selectedOffer.key,
                ...(requestedDiscountCode ? { discount_code: requestedDiscountCode } : {}),
            });
            if (requestId === quoteRequestId.current) {
                setQuote(result);
                setQuoteDiscountCode(requestedDiscountCode);
            }
        } catch (error) {
            if (requestId === quoteRequestId.current) {
                const errorMessage = getUserFacingErrorMessage(error, 'محاسبه مبلغ نهایی ناموفق بود.');
                setQuoteError(errorMessage);
            }
        } finally {
            if (requestId === quoteRequestId.current) setLoadingQuote(false);
        }
    }, [selectedOffer, user]);

    const handlePurchase = async () => {
        if (!user) {
            router.push('/auth?returnTo=plans');
            return;
        }
        if (purchasing || pendingOrderId) return;
        setPurchasing(true);
        setQuoteError('');
        try {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('نشست کاربری در دسترس نیست. دوباره وارد شوید.');
            const requestedDiscountCode = discountCode.trim().toUpperCase();
            const previousQuote = hasCurrentQuote ? quote : null;
            const currentQuote = await quoteSubscription(token, {
                plan_key: selectedOfferKey,
                ...(requestedDiscountCode ? { discount_code: requestedDiscountCode } : {}),
            });
            setQuote(currentQuote);
            setQuoteDiscountCode(requestedDiscountCode);
            setQuoteError('');
            if (
                !previousQuote
                || previousQuote.payable_amount !== currentQuote.payable_amount
                || previousQuote.gross_amount !== currentQuote.gross_amount
                || previousQuote.credit_amount !== currentQuote.credit_amount
                || previousQuote.discount_amount !== currentQuote.discount_amount
                || previousQuote.duration_days !== currentQuote.duration_days
                || previousQuote.change_type !== currentQuote.change_type
                || previousQuote.source_subscription_id !== currentQuote.source_subscription_id
                || previousQuote.source_plan_key !== currentQuote.source_plan_key
            ) {
                showMessage(previousQuote
                    ? 'مبلغ یا شرایط پلن تغییر کرده است؛ جزئیات به‌روز را بررسی و دوباره تأیید کنید.'
                    : 'مبلغ نهایی محاسبه شد؛ جزئیات را بررسی و برای ادامه دوباره تأیید کنید.');
                return;
            }

            const result = await purchaseSubscription(
                token,
                {
                    plan_key: selectedOfferKey,
                    ...(discountCode.trim() ? { discount_code: discountCode.trim() } : {}),
                    expected_quote: {
                        gross_amount: currentQuote.gross_amount,
                        payable_amount: currentQuote.payable_amount,
                        credit_amount: currentQuote.credit_amount,
                        discount_amount: currentQuote.discount_amount,
                        duration_days: currentQuote.duration_days,
                        change_type: currentQuote.change_type,
                        source_subscription_id: currentQuote.source_subscription_id,
                        source_plan_key: currentQuote.source_plan_key,
                    },
                },
                Crypto.randomUUID(),
            );
            setOrderStatus(result.order.status);
            if (result.order.status === 'succeeded') {
                try {
                    await refreshSubscriptionState();
                    showMessage(currentQuote.change_type === 'scheduled'
                        ? 'خرید انجام شد؛ پلن جدید پس از پایان اشتراک فعلی فعال می‌شود.'
                        : 'خرید انجام شد و دسترسی پلن به‌روز شد.', 'success');
                } catch (error) {
                    const detail = error instanceof Error ? ` ${error.message}` : '';
                    showMessage(`پرداخت با موفقیت انجام شد، اما به‌روزرسانی وضعیت پلن ناموفق بود.${detail}`, 'error');
                }
                return;
            }

            setPendingOrderId(result.order.id);
            showMessage('سفارش ایجاد شد. پس از پرداخت، برای بازگشت به برنامه اقدام کنید.');
            if (result.payment?.redirect_url) {
                await WebBrowser.openAuthSessionAsync(
                    result.payment.redirect_url,
                    Linking.createURL('payment-return'),
                );
                await checkOrder(result.order.id);
            }
        } catch (error) {
            invalidateQuote();
            showMessage(getUserFacingErrorMessage(error, 'شروع خرید پلن ناموفق بود.'), 'error');
        } finally {
            setPurchasing(false);
        }
    };

    const checkPendingOrderStatus = async () => {
        if (!pendingOrderId) return;
        setPurchasing(true);
        try {
            const result = await checkOrder(pendingOrderId);
            if (result.order.status === 'pending') {
                showMessage('سفارش هنوز در انتظار پرداخت است. در صورت پرداخت، منتظر تأیید درگاه بمانید.');
            } else if (result.order.status === 'processing') {
                showMessage('پرداخت دریافت شده و در حال تأیید نهایی است.');
            }
        } catch (error) {
            showMessage(getUserFacingErrorMessage(error, 'بررسی وضعیت پرداخت ناموفق بود.'), 'error');
        } finally {
            setPurchasing(false);
        }
    };

    const continuePendingPayment = async () => {
        if (!pendingOrderId) return;
        setPurchasing(true);
        try {
            const result = await checkOrder(pendingOrderId);
            const redirectUrl = result.payments.find((payment) => payment.redirect_url)?.redirect_url;
            if (result.order.status === 'pending' && redirectUrl) {
                await WebBrowser.openAuthSessionAsync(
                    redirectUrl,
                    Linking.createURL('payment-return'),
                );
            } else if (result.order.status === 'pending') {
                showMessage('پیوند درگاه برای این سفارش در دسترس نیست؛ وضعیت را بعداً دوباره بررسی کنید.', 'error');
            } else if (result.order.status === 'processing') {
                showMessage('پرداخت در حال تأیید است؛ فعلاً نیازی به پرداخت دوباره نیست.');
            }
        } catch (error) {
            showMessage(getUserFacingErrorMessage(error, 'ادامهٔ پرداخت ناموفق بود.'), 'error');
        } finally {
            setPurchasing(false);
        }
    };

    const priceLabels = (offer: PlanOffer) => offer.is_available ? money(offer.price) : 'قیمت به‌زودی';

    return (
        <ThemedView style={styles.container}>
            <ScrollView
                contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.five }]}
                showsVerticalScrollIndicator={false}
            >
                <View style={[styles.heroCard, { backgroundColor: theme.primaryContainer, borderColor: theme.border }]}>
                    <View style={styles.heroTopRow}>
                        <View style={[styles.heroIcon, { backgroundColor: theme.surface }]}>
                            <MaterialCommunityIcons
                                name={planAccess?.is_unlimited ? 'shield-star-outline' : 'star-four-points'}
                                size={24}
                                color={planAccess?.is_unlimited ? theme.success : theme.primaryText}
                            />
                        </View>
                        <View style={styles.flex}>
                            <ThemedText type="smallBold" themeColor="primaryText">
                                {planAccess?.is_unlimited ? 'دسترسی مدیریتی' : 'اشتراک پهناور کار'}
                            </ThemedText>
                            <ThemedText type="subtitle">{currentTierName}</ThemedText>
                        </View>
                        {user ? (
                            <View style={[styles.statusPill, { backgroundColor: theme.surface }]}>
                                <MaterialCommunityIcons name="check-circle" size={15} color={theme.success} />
                                <ThemedText type="smallBold" style={{ color: theme.success }}>فعال</ThemedText>
                            </View>
                        ) : (
                            <Pressable
                                accessibilityRole="button"
                                onPress={() => router.push({ pathname: '/auth', params: { returnTo: 'plans' } })}
                                style={[styles.statusPill, { backgroundColor: theme.surface }]}
                            >
                                <ThemedText type="smallBold" themeColor="primaryText">ورود</ThemedText>
                            </Pressable>
                        )}
                    </View>
                    {scheduledSubscription && (
                        <View style={[styles.scheduledCard, { backgroundColor: theme.surface }]}>
                            <MaterialCommunityIcons name="calendar-clock-outline" size={17} color={theme.primaryText} />
                            <ThemedText type="small" style={styles.flex}>
                                پلن بعدی: {catalog?.tiers.find((tier) => tier.key === scheduledSubscription.plan_key.split('_')[0])?.name ?? 'پلن زمان‌بندی‌شده'} از {formatDate(scheduledSubscription.starts_at)}
                            </ThemedText>
                        </View>
                    )}
                </View>

                {pendingOrderId && (
                    <View style={[styles.pendingOrderCard, { backgroundColor: theme.surface, borderColor: theme.warning }]}>
                        <View style={styles.pendingOrderHeader}>
                            <View style={[styles.pendingOrderIcon, { backgroundColor: theme.warningFill }]}>
                                <MaterialCommunityIcons name="progress-clock" size={20} color={theme.warning} />
                            </View>
                            <View style={styles.flex}>
                                <ThemedText type="bodyBold">خرید اشتراک در جریان است</ThemedText>
                                <ThemedText type="small" themeColor="textSecondary">
                                    {pendingOrderDetails?.plan_key ?? 'سفارش اشتراک'}
                                    {' · '}
                                    {orderStatus === 'processing' ? 'در حال تأیید' : 'در انتظار پرداخت'}
                                </ThemedText>
                            </View>
                        </View>
                        {pendingOrderDetails && (
                            <ThemedText type="small" themeColor="textSecondary">
                                مبلغ قابل پرداخت: {money(pendingOrderDetails.gross_amount - pendingOrderDetails.discount_amount)}
                            </ThemedText>
                        )}
                        <View style={styles.pendingOrderActions}>
                            <Pressable
                                accessibilityRole="button"
                                disabled={purchasing}
                                onPress={() => void checkPendingOrderStatus()}
                                style={[styles.pendingActionButton, { borderColor: theme.border }]}
                            >
                                {purchasing
                                    ? <ActivityIndicator size="small" color={theme.primaryText} />
                                    : <ThemedText type="smallBold" themeColor="primaryText">بررسی وضعیت</ThemedText>}
                            </Pressable>
                            {orderStatus !== 'processing' && (
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={purchasing}
                                    onPress={() => void continuePendingPayment()}
                                    style={[styles.pendingActionButton, { backgroundColor: theme.primary }]}
                                >
                                    <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>ادامهٔ پرداخت</ThemedText>
                                </Pressable>
                            )}
                        </View>
                    </View>
                )}

                <View style={styles.headingBlock}>
                    <ThemedText type="subtitle">پلن مناسب خود را انتخاب کنید</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.intro}>
                        امکانات و دوره‌ها را مقایسه کنید؛ مبلغ نهایی را سرور محاسبه می‌کند.
                    </ThemedText>
                </View>

                {loadingCatalog ? (
                    <View style={styles.loading}>
                        <ActivityIndicator color={theme.primaryText} />
                        <ThemedText type="small" themeColor="textSecondary">در حال دریافت پلن‌ها…</ThemedText>
                    </View>
                ) : catalog ? (
                    <>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={styles.tierSelector}
                        >
                            {catalog.tiers.map((tier) => {
                                const color = TIER_COLORS[tier.key] ?? TIER_COLORS.free;
                                const selected = selectedTier === tier.key;
                                return (
                                    <Pressable
                                        key={tier.key}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected, disabled: purchasing }}
                                        disabled={purchasing}
                                        onPress={() => {
                                            setSelectedTier(tier.key);
                                            invalidateQuote();
                                        }}
                                        style={[
                                            styles.tierOption,
                                            { backgroundColor: selected ? color.background : theme.surface, borderColor: selected ? color.accent : theme.border },
                                            selected && styles.selectedTierOption,
                                        ]}
                                    >
                                        <View style={[styles.tierBadge, { backgroundColor: selected ? theme.surface : color.background }]}>
                                            <MaterialCommunityIcons name={tier.key === 'free' ? 'gift-outline' : 'crown-outline'} size={19} color={color.accent} />
                                        </View>
                                        <ThemedText type="smallBold" style={{ color: selected ? color.accent : theme.text }}>{tier.name}</ThemedText>
                                        {tier.key === currentTier && (
                                            <View style={[styles.currentPlanDot, { backgroundColor: color.accent }]} />
                                        )}
                                        {selected && (
                                            <View style={[styles.selectedPlanMarker, { backgroundColor: color.accent }]}>
                                                <MaterialCommunityIcons name="check" size={12} color="#FFFFFF" />
                                            </View>
                                        )}
                                    </Pressable>
                                );
                            })}
                        </ScrollView>

                        <View style={[styles.benefitsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                            <View style={styles.benefitsHeader}>
                                <View style={[styles.benefitsIcon, { backgroundColor: selectedTierColor.background }]}>
                                    <MaterialCommunityIcons name="star-outline" size={18} color={selectedTierColor.accent} />
                                </View>
                                <View style={styles.flex}>
                                    <ThemedText type="bodyBold">{selectedTierInfo?.name}</ThemedText>
                                    <ThemedText type="small" themeColor="textSecondary">
                                        {selectedFeatures.length
                                            ? `${new Intl.NumberFormat('fa-IR').format(selectedFeatures.length)} امکان در این پلن`
                                            : 'امکانات پایه برنامه'}
                                    </ThemedText>
                                </View>
                                {selectedTier === currentTier && (
                                    <View style={[styles.currentLabel, { backgroundColor: selectedTierColor.background }]}>
                                        <ThemedText type="smallBold" style={{ color: selectedTierColor.accent }}>پلن فعلی</ThemedText>
                                    </View>
                                )}
                            </View>
                            <View style={[styles.featureList, { borderTopColor: theme.border }]}>
                                {selectedFeatures.slice(0, expandedFeatures[selectedTier] ? selectedFeatures.length : 5).map(([key, feature]) => (
                                    <View key={key} style={styles.featureRow}>
                                        <MaterialCommunityIcons name="check-circle" size={17} color={selectedTierColor.accent} />
                                        <ThemedText type="small" style={styles.flex}>{feature.label}</ThemedText>
                                    </View>
                                ))}
                                {selectedFeatures.length > 5 && (
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityState={{ expanded: Boolean(expandedFeatures[selectedTier]) }}
                                        onPress={() => setExpandedFeatures((current) => ({
                                            ...current,
                                            [selectedTier]: !current[selectedTier],
                                        }))}
                                        style={styles.expandFeaturesButton}
                                    >
                                        <ThemedText type="smallBold" style={{ color: selectedTierColor.accent }}>
                                            {expandedFeatures[selectedTier]
                                                ? 'مشاهدهٔ کمتر'
                                                : `مشاهدهٔ ${new Intl.NumberFormat('fa-IR').format(selectedFeatures.length - 5)} امکان دیگر`}
                                        </ThemedText>
                                        <MaterialCommunityIcons
                                            name={expandedFeatures[selectedTier] ? 'chevron-up' : 'chevron-down'}
                                            size={18}
                                            color={selectedTierColor.accent}
                                        />
                                    </Pressable>
                                )}
                                {!selectedFeatures.length && (
                                    <ThemedText type="small" themeColor="textSecondary">
                                        ابزارهای پایه و امکانات رایگان برنامه در دسترس شماست.
                                    </ThemedText>
                                )}
                            </View>
                        </View>

                        <View style={[styles.selectionPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                            <View style={styles.sectionHeading}>
                                <MaterialCommunityIcons name="calendar-range" size={20} color={theme.primaryText} />
                                <ThemedText type="bodyBold">انتخاب دوره</ThemedText>
                            </View>
                            <View style={styles.durationWrap}>
                                {catalog.durations.map((duration) => {
                                    const offer = catalog.offers.find((item) => item.tier === selectedTier && item.duration === duration.key);
                                    const selected = selectedDuration === duration.key;
                                    return (
                                        <Pressable
                                            key={duration.key}
                                            accessibilityRole="button"
                                            accessibilityState={{ selected, disabled: !offer?.is_available || purchasing }}
                                            disabled={!offer?.is_available || purchasing}
                                            onPress={() => {
                                                setSelectedDuration(duration.key);
                                                invalidateQuote();
                                            }}
                                            style={[
                                                styles.durationChip,
                                                { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primaryContainer : theme.surface },
                                                !offer?.is_available && styles.disabledChip,
                                            ]}
                                        >
                                            <ThemedText type="smallBold" style={selected ? { color: theme.primaryText } : undefined}>{duration.name}</ThemedText>
                                            <ThemedText type="small" themeColor="textSecondary">{offer ? priceLabels(offer) : 'ناموجود'}</ThemedText>
                                        </Pressable>
                                    );
                                })}
                            </View>

                            <ThemedText type="smallBold" style={styles.inputLabel}>کد تخفیف (اختیاری)</ThemedText>
                            <View style={[styles.discountInputWrap, { borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}>
                                <TextInput
                                    value={discountCode}
                                    editable={!purchasing}
                                    onChangeText={(value) => {
                                        setDiscountCode(value);
                                        invalidateQuote();
                                    }}
                                    placeholder="کد تخفیف"
                                    placeholderTextColor={theme.textMuted}
                                    autoCapitalize="characters"
                                    autoCorrect={false}
                                    style={[styles.discountInput, { color: theme.text }]}
                                    accessibilityLabel="کد تخفیف"
                                />
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityState={{ disabled: loadingQuote || purchasing }}
                                    disabled={loadingQuote || purchasing}
                                    onPress={() => void loadQuote(discountCode)}
                                    style={styles.discountAction}
                                >
                                    <ThemedText type="smallBold" themeColor="primaryText">{loadingQuote ? 'بررسی…' : 'محاسبه مبلغ'}</ThemedText>
                                </Pressable>
                            </View>
                            {quoteError ? (
                                <ThemedText type="small" style={[styles.quoteFeedback, { color: theme.error }]} accessibilityRole="alert">
                                    {quoteError}
                                </ThemedText>
                            ) : null}

                            {!user ? (
                                <ThemedText type="small" themeColor="textSecondary" style={styles.quoteInfo}>
                                    برای دریافت مبلغ نهایی و خرید پلن، ابتدا وارد حساب شوید.
                                </ThemedText>
                            ) : loadingQuote ? (
                                <View style={styles.quoteLoading}><ActivityIndicator size="small" color={theme.primaryText} /><ThemedText type="small" themeColor="textSecondary">محاسبه مبلغ نهایی…</ThemedText></View>
                            ) : hasCurrentQuote && quote ? (
                                <View style={[styles.quoteCard, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                                    <PriceLine
                                        label={quote.credit_amount > 0 ? 'ارزش متناسب پلن جدید' : 'قیمت دوره'}
                                        value={money(quote.gross_amount + quote.credit_amount)}
                                        theme={theme}
                                    />
                                    {quote.credit_amount > 0 && <PriceLine label="اعتبار اشتراک فعلی" value={`− ${money(quote.credit_amount)}`} theme={theme} />}
                                    {quote.discount_amount > 0 && <PriceLine label="تخفیف" value={`− ${money(quote.discount_amount)}`} theme={theme} />}
                                    {quoteDiscountCode ? (
                                        <ThemedText
                                            type="small"
                                            style={[styles.quoteFeedback, { color: quote.discount_amount > 0 ? theme.success : theme.textSecondary }]}
                                        >
                                            {quote.discount_amount > 0
                                                ? 'کد تخفیف با موفقیت اعمال شد.'
                                                : 'کد بررسی شد؛ تخفیفی برای این خرید اعمال نشد.'}
                                        </ThemedText>
                                    ) : null}
                                    <PriceLine label="مبلغ قابل پرداخت" value={money(quote.payable_amount)} theme={theme} strong />
                                    <ThemedText type="small" themeColor="textSecondary" style={styles.quoteInfo}>{getChangeDescription(quote)}</ThemedText>
                                </View>
                            ) : (
                                <ThemedText type="small" themeColor="textSecondary" style={styles.quoteInfo}>
                                    {selectedOffer?.is_available ? 'برای مشاهده مبلغ نهایی و اعتبار باقی‌مانده، محاسبه مبلغ را انتخاب کنید.' : 'این بازه تا تعیین قیمت برای خرید در دسترس نیست.'}
                                </ThemedText>
                            )}

                            <Pressable
                                accessibilityRole="button"
                                disabled={!selectedOffer?.is_available || purchasing || loadingQuote || Boolean(pendingOrderId)}
                                onPress={() => void handlePurchase()}
                                style={({ pressed }) => [
                                    styles.purchaseButton,
                                    { backgroundColor: theme.primary, opacity: pressed ? 0.86 : 1 },
                                    (!selectedOffer?.is_available || purchasing || loadingQuote || Boolean(pendingOrderId)) && styles.disabledButton,
                                ]}
                            >
                                {purchasing ? <ActivityIndicator color={theme.onPrimary} /> : (
                                    <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
                                        {!user ? 'ورود برای خرید' : !hasCurrentQuote ? 'محاسبه مبلغ نهایی' : quote?.change_type === 'upgrade' ? 'تأیید و ارتقا' : quote?.change_type === 'scheduled' ? 'تأیید پلن بعدی' : 'تأیید و خرید'}
                                    </ThemedText>
                                )}
                            </Pressable>
                        </View>
                    </>
                ) : (
                    <View style={styles.loading}>
                        <ThemedText type="small" themeColor="textSecondary">اطلاعات پلن‌ها در دسترس نیست.</ThemedText>
                        <Pressable accessibilityRole="button" onPress={() => {
                            setLoadingCatalog(true);
                            void loadCatalog();
                        }}>
                            <ThemedText type="smallBold" themeColor="primaryText">تلاش دوباره</ThemedText>
                        </Pressable>
                    </View>
                )}
            </ScrollView>
            <Snackbar
                visible={snackbarVisible}
                onDismiss={() => setSnackbarVisible(false)}
                duration={5000}
                style={{
                    backgroundColor: messageKind === 'error'
                        ? theme.errorFill
                        : messageKind === 'success' ? theme.successFill : theme.infoFill,
                    borderRadius: Radius.md,
                }}
                action={{
                    label: 'بستن',
                    onPress: () => setSnackbarVisible(false),
                    labelStyle: { color: theme.onStatus },
                }}
            >
                <ThemedText
                    type="small"
                    accessibilityRole={messageKind === 'error' ? 'alert' : undefined}
                    style={{ color: theme.onStatus }}
                >
                    {message}
                </ThemedText>
            </Snackbar>
        </ThemedView>
    );
}

function PriceLine({
    label,
    value,
    theme,
    strong = false,
}: {
    label: string;
    value: string;
    theme: ReturnType<typeof useTheme>;
    strong?: boolean;
}) {
    return (
        <View style={styles.priceLine}>
            <ThemedText type={strong ? 'smallBold' : 'small'} themeColor={strong ? 'text' : 'textSecondary'}>{label}</ThemedText>
            <ThemedText type={strong ? 'bodyBold' : 'smallBold'} style={{ color: strong ? theme.primaryText : theme.text }}>{value}</ThemedText>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.four, gap: Spacing.three },
    flex: { flex: 1 },
    heroCard: {
        borderWidth: 1,
        borderRadius: 24,
        padding: Spacing.four,
        gap: Spacing.two,
    },
    heroTopRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
    heroIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    statusPill: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 999, paddingHorizontal: Spacing.two },
    scheduledCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderRadius: Radius.md, padding: Spacing.two },
    headingBlock: { gap: Spacing.one },
    intro: { lineHeight: 22 },
    loading: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.five },
    tierSelector: { gap: Spacing.two, paddingVertical: 2, paddingHorizontal: 1 },
    tierOption: { width: 98, minHeight: 112, borderWidth: 1, borderRadius: 20, padding: Spacing.two, alignItems: 'center', justifyContent: 'center', gap: 7, position: 'relative' },
    selectedTierOption: { borderWidth: 2 },
    tierBadge: { width: 40, height: 40, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    currentPlanDot: { width: 6, height: 6, borderRadius: 3, position: 'absolute', top: 9, left: 9 },
    selectedPlanMarker: { position: 'absolute', top: -5, right: -5, width: 21, height: 21, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    benefitsCard: { borderWidth: 1, borderRadius: 22, padding: Spacing.three, gap: Spacing.two },
    benefitsHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
    benefitsIcon: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    currentLabel: { borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 5 },
    featureList: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two, gap: Spacing.one },
    featureRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: 2 },
    expandFeaturesButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: Spacing.one, paddingHorizontal: Spacing.one },
    selectionPanel: { borderWidth: 1, borderRadius: 22, padding: Spacing.three, gap: Spacing.two },
    sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
    durationWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
    durationChip: { flexGrow: 1, minWidth: '45%', borderWidth: 1, borderRadius: 16, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, alignItems: 'center', gap: 4 },
    disabledChip: { opacity: 0.45 },
    inputLabel: { marginTop: Spacing.one },
    discountInputWrap: { minHeight: 48, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.two, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
    discountInput: { flex: 1, minHeight: 44, textAlign: 'left', writingDirection: 'ltr', fontSize: 14, fontFamily: 'AppFont-Regular' },
    discountAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: Spacing.one },
    quoteInfo: { lineHeight: 22 },
    quoteFeedback: { lineHeight: 21 },
    quoteLoading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
    quoteCard: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.two, gap: Spacing.two },
    priceLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
    purchaseButton: { minHeight: 50, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.one },
    disabledButton: { opacity: 0.5 },
    pendingBox: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#9AAAB4', paddingTop: Spacing.two, gap: Spacing.two, alignItems: 'center' },
    pendingOrderCard: { borderWidth: 1, borderRadius: 20, padding: Spacing.three, gap: Spacing.three },
    pendingOrderHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
    pendingOrderIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    pendingOrderActions: { flexDirection: 'row', gap: Spacing.two },
    pendingActionButton: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.two },
});