import { Typography } from '@/constants/typography';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import { useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Animated, AppState, Pressable, RefreshControl, ScrollView, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import { TabView } from 'react-native-tab-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppTextInput } from '@/components/app-text';
import { ErrorNoticeCard } from '@/components/error-notice-card';
import { OfflineDataNotice } from '@/components/offline-data-notice';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useAppFeedback } from '@/hooks/use-app-feedback';
import { useAppContext } from '@/hooks/use-app-context';
import { useOnlineRefetch } from '@/hooks/use-online-refetch';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { usePlanAccess } from '@/hooks/use-plan-access';
import { useTheme } from '@/hooks/use-theme';
import { CACHE_KEYS, CACHE_POLICY } from '@/services/cache-policy';
import {
    fetchPaymentOrder,
    fetchPendingSubscriptionOrder,
    fetchPlanCatalog,
    fetchWalletOverview,
    getStoredAuthToken,
    isTemporaryApiFailure,
    type PlanCatalog,
    purchaseSubscription,
    reconcileSubscriptionOrder,
    quoteSubscription,
    type PlanOffer,
    type SubscriptionPaymentMethod,
    type SubscriptionPurchaseInput,
    type SubscriptionQuote,
} from '@/services/auth-api';
import {
    clearPendingSubscriptionPurchaseAttempt,
    getPendingSubscriptionPurchaseAttempt,
    savePendingSubscriptionPurchaseAttempt,
    type PendingSubscriptionPurchaseAttempt,
} from '@/services/subscription-purchase-idempotency';
import { getUserFacingErrorMessage } from '@/services/user-facing-error';
import {
    ACCOUNT_OFFLINE_CACHE,
    fetchWithOfflineFallback,
    isPendingSubscriptionOrderCacheValue,
    isPlanCatalogCacheValue,
    isWalletOverviewCacheValue,
    saveOfflineCacheValue,
    withOfflineCacheMetadata,
    type OfflineAware,
} from '@/services/account-offline-cache';
import { hasPlanFeature } from '@/utils/plan-access';
import { formatPersianDate } from '@/utils/persian-date';
import { getPlanTierColor, getPlanTierIcon, getPlanTierLogoBackground, getPlanTierLogoForeground } from '@/utils/plan-tier-visual';

type SnackbarKind = 'info' | 'success' | 'error';
type SubscriptionChangeType = SubscriptionQuote['change_type'];

type PurchaseCompletion = {
    planKey: string;
    changeType: SubscriptionChangeType;
};

const planCatalogQueryKey = CACHE_KEYS.planCatalog;
const currentPlanQueryKey = CACHE_KEYS.currentPlan;
const walletQueryKey = CACHE_KEYS.walletOverview;
const pendingSubscriptionOrderQueryKey = CACHE_KEYS.pendingSubscriptionOrder;
const MAX_PENDING_ORDER_CHECKS = 8;
const persianNumberFormatter = new Intl.NumberFormat('fa-IR');
const FALLBACK_PLAN_TIER_ROUTES = [
    { key: 'free', title: 'رایگان' },
    { key: 'bronze', title: 'برنزی' },
    { key: 'silver', title: 'نقره‌ای' },
    { key: 'gold', title: 'طلایی' },
] as const;

function money(value: number): string {
    return `${persianNumberFormatter.format(value)} تومان`;
}

function formatDate(value: string): string {
    return formatPersianDate(value, { year: 'numeric', month: 'long', day: 'numeric' }) ?? 'پس از تأیید پرداخت';
}

function getChangeDescription(quote: SubscriptionQuote): string {
    if (quote.change_type === 'upgrade') {
        const duration = persianNumberFormatter.format(quote.duration_days);
        return `ارتقای فوری؛ پلن انتخاب‌شده به‌مدت ${duration} روز از امروز فعال است. اعتبار ${money(quote.credit_amount)} بابت زمان باقی‌ماندهٔ اشتراک فعلی کسر شده و دسترسی تا ${formatDate(quote.ends_at)} ادامه دارد.`;
    }
    if (quote.change_type === 'scheduled') {
        return `این پلن پس از پایان اشتراک فعلی، از ${formatDate(quote.starts_at)} فعال می‌شود. مبلغ دوره اکنون پرداخت می‌شود.`;
    }
    return `اشتراک پس از تأیید پرداخت فعال می‌شود و تا ${formatDate(quote.ends_at)} اعتبار دارد.`;
}

type PlanTierTabProps = {
    label: string;
    isActive: boolean;
    isCurrent: boolean;
    theme: ReturnType<typeof useTheme>;
    disabled: boolean;
    onPress: () => void;
};

function PlanTierTab({ label, isActive, isCurrent, theme, disabled, onPress }: PlanTierTabProps) {
    const [indicatorProgress] = useState(() => new Animated.Value(isActive ? 1 : 0));

    useEffect(() => {
        Animated.spring(indicatorProgress, {
            toValue: isActive ? 1 : 0,
            damping: 18,
            stiffness: 180,
            mass: 0.7,
            useNativeDriver: true,
        }).start();
    }, [indicatorProgress, isActive]);

    return (
        <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive, disabled }}
            accessibilityLabel={label}
            disabled={disabled}
            onPress={onPress}
            style={({ pressed }) => [
                styles.planTab,
                { backgroundColor: pressed ? theme.surfaceVariant : theme.surface },
            ]}
        >
            <View style={styles.planTabLabel}>
                <ThemedText
                    type={isActive ? 'smallBold' : 'small'}
                    numberOfLines={1}
                    style={{ color: isActive ? theme.primaryText : theme.textSecondary }}
                >
                    {label}
                </ThemedText>
                {isCurrent ? (
                    <View style={[styles.currentTierBadge, { backgroundColor: theme.primary }]}>
                        <ThemedText type="smallBold" style={{ color: theme.onPrimary, fontSize: Typography.fontSize.micro, lineHeight: Typography.lineHeight.compact }}>فعلی</ThemedText>
                    </View>
                ) : null}
            </View>
            <Animated.View
                style={[
                    styles.planTabIndicator,
                    {
                        backgroundColor: theme.primary,
                        opacity: indicatorProgress,
                        transform: [{ scaleX: indicatorProgress }],
                    },
                ]}
            />
        </Pressable>
    );
}

export default function PlanCatalogScreen() {
    const theme = useTheme();
    const { theme: appTheme } = useAppContext();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const { user } = useAuth();
    const { showFeedback } = useAppFeedback();
    const queryClient = useQueryClient();
    const isOnline = useOnlineStatus();
    const userId = user?.id ?? null;
    const financialRestricted = user?.restricted_capabilities?.includes('financial') ?? false;
    const { planAccess } = usePlanAccess();
    const catalogQuery = useQuery({
        queryKey: planCatalogQueryKey,
        queryFn: async (): Promise<OfflineAware<PlanCatalog>> => {
            if (userId === null) return fetchPlanCatalog();
            const result = await fetchWithOfflineFallback(
                userId,
                ACCOUNT_OFFLINE_CACHE.planCatalog,
                fetchPlanCatalog,
                isPlanCatalogCacheValue,
                { isOnline },
            );
            return withOfflineCacheMetadata(result);
        },
        staleTime: CACHE_POLICY.query.resources.planCatalog.staleTimeMs,
        retry: false,
        networkMode: 'always',
    });
    const walletQuery = useQuery({
        queryKey: walletQueryKey(userId ?? 0),
        enabled: userId !== null,
        queryFn: async (): Promise<OfflineAware<Awaited<ReturnType<typeof fetchWalletOverview>>>> => {
            if (userId === null) throw new Error('نشست کاربری برای دریافت موجودی کیف پول در دسترس نیست.');
            const result = await fetchWithOfflineFallback(
                userId,
                ACCOUNT_OFFLINE_CACHE.wallet,
                async () => {
                    const token = await getStoredAuthToken();
                    if (!token) throw new Error('نشست کاربری برای دریافت موجودی کیف پول در دسترس نیست.');
                    return fetchWalletOverview(token);
                },
                isWalletOverviewCacheValue,
                { isOnline },
            );
            return withOfflineCacheMetadata(result);
        },
        staleTime: CACHE_POLICY.query.resources.walletOverview.staleTimeMs,
        retry: false,
        networkMode: 'always',
    });
    const pendingSubscriptionOrderQuery = useQuery({
        queryKey: pendingSubscriptionOrderQueryKey(userId ?? 0),
        enabled: userId !== null,
        queryFn: async (): Promise<OfflineAware<Awaited<ReturnType<typeof fetchPendingSubscriptionOrder>>>> => {
            if (userId === null) throw new Error('نشست کاربری برای بررسی سفارش در دسترس نیست.');
            const result = await fetchWithOfflineFallback(
                userId,
                ACCOUNT_OFFLINE_CACHE.pendingSubscriptionOrder,
                async () => {
                    const token = await getStoredAuthToken();
                    if (!token) throw new Error('نشست کاربری برای بررسی سفارش در دسترس نیست.');
                    return fetchPendingSubscriptionOrder(token);
                },
                isPendingSubscriptionOrderCacheValue,
                { isOnline },
            );
            return withOfflineCacheMetadata(result);
        },
        staleTime: CACHE_POLICY.query.resources.pendingSubscriptionOrder.staleTimeMs,
        retry: false,
        networkMode: 'always',
    });
    const catalog = catalogQuery.data ?? null;
    const wallet = walletQuery.data ?? null;
    const [selectedTierOverride, setSelectedTierOverride] = useState<string | null>(null);
    const [fallbackTierIndex, setFallbackTierIndex] = useState(0);
    const [selectedDurationOverride, setSelectedDurationOverride] = useState<string | null>(null);
    const [expandedFeatures, setExpandedFeatures] = useState<Record<string, boolean>>({});
    const [discountCode, setDiscountCode] = useState('');
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<SubscriptionPaymentMethod>('gateway');
    const [quote, setQuote] = useState<SubscriptionQuote | null>(null);
    const [quoteUserId, setQuoteUserId] = useState<number | null>(null);
    const [quoteDiscountCode, setQuoteDiscountCode] = useState('');
    const [quoteError, setQuoteError] = useState('');
    const [loadingQuote, setLoadingQuote] = useState(false);
    const [purchasing, setPurchasing] = useState(false);
    const [completedPurchase, setCompletedPurchase] = useState<PurchaseCompletion | null>(null);
    const [pendingOrderError, setPendingOrderError] = useState('');
    const [pendingPurchaseAttempt, setPendingPurchaseAttempt] = useState<{
        userId: number;
        value: PendingSubscriptionPurchaseAttempt;
    } | null>(null);
    const [loadedPurchaseAttemptUserId, setLoadedPurchaseAttemptUserId] = useState<number | null>(null);
    const [purchaseAttemptLoadError, setPurchaseAttemptLoadError] = useState<{
        userId: number;
        message: string;
    } | null>(null);
    const quoteRequestId = useRef(0);
    const previousUserId = useRef(userId);
    const currentUserIdRef = useRef(userId);
    const pendingPurchaseAttemptRef = useRef<{
        userId: number;
        value: PendingSubscriptionPurchaseAttempt;
    } | null>(null);
    const purchaseActionInProgressRef = useRef(false);
    const purchaseActionIdRef = useRef(0);
    const restoredPendingOrderId = useRef<number | null>(null);
    const hasFocusedScreen = useRef(false);
    const pendingOrderPolling = useRef<{ orderId: number | null; checks: number; inFlight: boolean }>({
        orderId: null,
        checks: 0,
        inFlight: false,
    });
    const orderCheckInFlight = useRef<{
        userId: number | null;
        orderId: number;
        promise: ReturnType<typeof fetchPaymentOrder>;
    } | null>(null);

    const firstAvailableOffer = catalog?.offers.find((offer) => offer.is_available);
    const selectedTier = selectedTierOverride ?? firstAvailableOffer?.tier ?? 'bronze';
    const selectedDuration = selectedDurationOverride ?? firstAvailableOffer?.duration ?? '1_month';
    const pendingOrderDetails = pendingSubscriptionOrderQuery.data?.order ?? null;
    const pendingOrderPayments = pendingSubscriptionOrderQuery.data?.payments ?? [];
    const pendingOrderId = pendingOrderDetails?.id ?? null;
    const orderStatus = pendingOrderDetails?.status ?? null;
    const pendingOrderUnavailable = userId !== null
        && (
            !isOnline
            || pendingSubscriptionOrderQuery.isFetching
            || pendingSubscriptionOrderQuery.isError
            || pendingSubscriptionOrderQuery.data?.offlineCacheSavedAt !== undefined
        );
    const purchaseUnavailableOffline = !isOnline
        || catalogQuery.data?.offlineCacheSavedAt !== undefined
        || walletQuery.data?.offlineCacheSavedAt !== undefined
        || pendingSubscriptionOrderQuery.data?.offlineCacheSavedAt !== undefined;
    const purchaseInformationSources = [
        {
            label: 'کاتالوگ پلن‌ها',
            savedAt: catalogQuery.data?.offlineCacheSavedAt,
            receivedAt: catalogQuery.data ? catalogQuery.dataUpdatedAt : undefined,
        },
        {
            label: 'موجودی کیف پول',
            savedAt: walletQuery.data?.offlineCacheSavedAt,
            receivedAt: walletQuery.data ? walletQuery.dataUpdatedAt : undefined,
        },
        {
            label: 'وضعیت سفارش',
            savedAt: pendingSubscriptionOrderQuery.data?.offlineCacheSavedAt,
            receivedAt: pendingSubscriptionOrderQuery.data ? pendingSubscriptionOrderQuery.dataUpdatedAt : undefined,
        },
    ].flatMap((source) => {
        const timestamp = source.savedAt ?? source.receivedAt;
        return timestamp === undefined || timestamp <= 0
            ? []
            : [{ label: source.label, timestamp, kind: source.savedAt !== undefined ? 'saved' as const : 'received' as const }];
    });
    const pendingOrderLookupFailed = userId !== null && pendingSubscriptionOrderQuery.isError;
    const currentPurchaseAttempt = pendingPurchaseAttempt?.userId === userId
        ? pendingPurchaseAttempt.value
        : null;
    const purchaseAttemptUnavailable = userId !== null
        && (loadedPurchaseAttemptUserId !== userId || Boolean(purchaseAttemptLoadError?.userId === userId));
    const currentTier = planAccess?.key ?? 'free';
    const selectedOfferKey = `${selectedTier}_${selectedDuration}`;
    const selectedOffer = catalog?.offers.find((offer) => offer.key === selectedOfferKey) ?? null;
    const normalizedDiscountCode = discountCode.trim().toUpperCase();
    const hasCurrentQuote = quote?.plan_key === selectedOfferKey
        && quoteUserId === userId
        && quote.payment_method === selectedPaymentMethod
        && quoteDiscountCode === normalizedDiscountCode;
    const showMessage = useCallback((text: string, kind: SnackbarKind = 'info') => {
        showFeedback({ message: text, variant: kind });
    }, [showFeedback]);

    const beginPurchaseAction = () => {
        if (purchaseUnavailableOffline) {
            showMessage('برای خرید یا تکرار خرید، اتصال اینترنت و اطلاعات زندهٔ سرور لازم است.', 'error');
            return null;
        }
        if (purchaseActionInProgressRef.current) return null;
        purchaseActionInProgressRef.current = true;
        const actionId = ++purchaseActionIdRef.current;
        setPurchasing(true);
        return actionId;
    };

    const finishPurchaseAction = (actionId: number) => {
        if (purchaseActionIdRef.current !== actionId) return;
        purchaseActionInProgressRef.current = false;
        setPurchasing(false);
    };

    useLayoutEffect(() => {
        currentUserIdRef.current = userId;
    }, [userId]);

    const loadPendingPurchaseAttempt = useCallback(async (targetUserId: number) => {
        try {
            const value = await getPendingSubscriptionPurchaseAttempt(targetUserId);
            if (currentUserIdRef.current !== targetUserId) return;
            const attempt = value ? { userId: targetUserId, value } : null;
            pendingPurchaseAttemptRef.current = attempt;
            setPendingPurchaseAttempt(attempt);
            setLoadedPurchaseAttemptUserId(targetUserId);
            setPurchaseAttemptLoadError(null);
        } catch (error) {
            console.error('بازیابی وضعیت تلاش خرید اشتراک ناموفق بود.', error);
            if (currentUserIdRef.current === targetUserId) {
                setPurchaseAttemptLoadError({
                    userId: targetUserId,
                    message: 'بازیابی وضعیت تلاش قبلی خرید ناموفق بود؛ برای جلوگیری از پرداخت تکراری، ابتدا دوباره بررسی کنید.',
                });
            }
        }
    }, []);

    const clearPurchaseAttempt = useCallback(async (targetUserId: number) => {
        await clearPendingSubscriptionPurchaseAttempt(targetUserId);
        if (currentUserIdRef.current !== targetUserId) return;
        pendingPurchaseAttemptRef.current = null;
        setPendingPurchaseAttempt(null);
    }, []);

    useEffect(() => {
        if (userId === null) return;
        void Promise.resolve().then(() => loadPendingPurchaseAttempt(userId));
    }, [loadPendingPurchaseAttempt, userId]);

    const sharePendingOrderDetails = async () => {
        if (!pendingOrderDetails) return;
        const statusLabel = pendingOrderDetails.status === 'processing'
            ? 'در حال تأیید نهایی'
            : 'در انتظار تعیین تکلیف';
        try {
            await Share.share({
                title: 'جزئیات سفارش پرداخت پلن',
                message: [
                    'درخواست پیگیری پرداخت پلن',
                    `شماره سفارش: ${persianNumberFormatter.format(pendingOrderDetails.id)}`,
                    `شناسه سفارش: ${pendingOrderDetails.reference}`,
                    `پلن: ${pendingOrderDetails.plan_name ?? pendingOrderDetails.plan_key}`,
                    `مبلغ کل: ${money(pendingOrderDetails.gross_amount)}`,
                    `مبلغ درگاه: ${money(pendingOrderDetails.gateway_amount)}`,
                    `وضعیت سفارش: ${statusLabel}`,
                ].join('\n'),
            });
        } catch (error) {
            const errorMessage = getUserFacingErrorMessage(error, 'آماده‌سازی اطلاعات سفارش برای اشتراک‌گذاری ناموفق بود.');
            setPendingOrderError(errorMessage);
            showMessage(errorMessage, 'error');
        }
    };

    const invalidateQuote = useCallback(() => {
        quoteRequestId.current += 1;
        setQuote(null);
        setQuoteUserId(null);
        setQuoteDiscountCode('');
        setQuoteError('');
        setLoadingQuote(false);
    }, []);

    const recordPurchaseCompletion = useCallback((planKey: string, changeType: SubscriptionChangeType) => {
        quoteRequestId.current += 1;
        setCompletedPurchase({ planKey, changeType });
        setQuote(null);
        setQuoteUserId(null);
        setQuoteDiscountCode('');
        setQuoteError('');
        setLoadingQuote(false);
        setPendingOrderError('');
    }, []);

    useFocusEffect(useCallback(() => {
        if (!hasFocusedScreen.current) {
            hasFocusedScreen.current = true;
            return;
        }
        if (userId !== null) {
            void queryClient.invalidateQueries({ queryKey: walletQueryKey(userId) });
            void queryClient.invalidateQueries({ queryKey: pendingSubscriptionOrderQueryKey(userId) });
        }
        void queryClient.invalidateQueries({ queryKey: planCatalogQueryKey });
    }, [queryClient, userId]));

    const refreshPlanState = useCallback(async (targetUserId = userId) => {
        if (targetUserId === null) return;
        await queryClient.refetchQueries({
            queryKey: CACHE_KEYS.planAccess(targetUserId),
            type: 'active',
        }, {
            throwOnError: true,
        });
        await queryClient.invalidateQueries({ queryKey: currentPlanQueryKey(targetUserId) });
    }, [queryClient, userId]);

    const checkOrder = useCallback((orderId: number) => {
        const targetUserId = userId;
        const existingCheck = orderCheckInFlight.current;
        if (existingCheck?.userId === targetUserId && existingCheck.orderId === orderId) {
            return existingCheck.promise;
        }

        const checkPromise = (async () => {
            const token = await getStoredAuthToken();
            if (!token) {
                throw new Error('نشست کاربری در دسترس نیست. دوباره وارد شوید.');
            }
            const result = await fetchPaymentOrder(token, orderId);
            if (currentUserIdRef.current !== targetUserId) return result;
            setPendingOrderError('');
            if (result.order.status === 'succeeded') {
                recordPurchaseCompletion(result.order.plan_key, result.order.subscription_change_type);
                if (targetUserId !== null) {
                    queryClient.setQueryData(pendingSubscriptionOrderQueryKey(targetUserId), {
                        order: null,
                        payments: [],
                    });
                    await queryClient.invalidateQueries({ queryKey: walletQueryKey(targetUserId) });
                }
                try {
                    await refreshPlanState(targetUserId);
                    if (currentUserIdRef.current === targetUserId) {
                        showMessage('پرداخت با موفقیت تأیید شد و دسترسی پلن به‌روز شد.', 'success');
                    }
                } catch (error) {
                    if (currentUserIdRef.current !== targetUserId) return result;
                    const detail = ` ${getUserFacingErrorMessage(error, 'دوباره تلاش کنید.')}`;
                    showMessage(`پرداخت تأیید شد، اما به‌روزرسانی وضعیت پلن ناموفق بود.${detail}`, 'error');
                }
            } else if (result.order.status === 'failed') {
                setPendingOrderError('');
                if (targetUserId !== null) {
                    queryClient.setQueryData(pendingSubscriptionOrderQueryKey(targetUserId), {
                        order: null,
                        payments: [],
                    });
                    await queryClient.invalidateQueries({ queryKey: walletQueryKey(targetUserId) });
                }
                showMessage('پرداخت تکمیل نشد. می‌توانید دوباره برای خرید اقدام کنید.', 'error');
            } else if (targetUserId !== null) {
                queryClient.setQueryData(pendingSubscriptionOrderQueryKey(targetUserId), {
                    order: result.order,
                    payments: result.payments,
                });
            }
            return result;
        })();
        const check = { userId: targetUserId, orderId, promise: checkPromise };
        orderCheckInFlight.current = check;
        void checkPromise.then(
            () => {
                if (orderCheckInFlight.current === check) orderCheckInFlight.current = null;
            },
            () => {
                if (orderCheckInFlight.current === check) orderCheckInFlight.current = null;
            },
        );
        return checkPromise;
    }, [queryClient, recordPurchaseCompletion, refreshPlanState, showMessage, userId]);

    const processPurchaseResult = useCallback(async (
        result: Awaited<ReturnType<typeof purchaseSubscription>>,
        input: SubscriptionPurchaseInput,
        targetUserId: number,
    ) => {
        try {
            await clearPurchaseAttempt(targetUserId);
        } catch (error) {
            console.error('پاک‌کردن تلاش خرید تعیین‌تکلیف‌شده ناموفق بود؛ کلید برای جلوگیری از خرید تکراری حفظ شد.', error);
        }

        await queryClient.invalidateQueries({ queryKey: walletQueryKey(targetUserId) });
        if (currentUserIdRef.current !== targetUserId) return;

        if (result.order.status === 'succeeded') {
            recordPurchaseCompletion(result.order.plan_key, result.order.subscription_change_type);
            queryClient.setQueryData(pendingSubscriptionOrderQueryKey(targetUserId), {
                order: null,
                payments: [],
            });
            try {
                await refreshPlanState(targetUserId);
                if (currentUserIdRef.current === targetUserId) {
                    showMessage(result.order.subscription_change_type === 'scheduled'
                        ? 'خرید انجام شد؛ پلن جدید پس از پایان اشتراک فعلی فعال می‌شود.'
                        : 'خرید انجام شد و دسترسی پلن به‌روز شد.', 'success');
                }
            } catch (error) {
                if (currentUserIdRef.current !== targetUserId) return;
                const detail = ` ${getUserFacingErrorMessage(error, 'دوباره تلاش کنید.')}`;
                showMessage(`پرداخت با موفقیت انجام شد، اما به‌روزرسانی وضعیت پلن ناموفق بود.${detail}`, 'error');
            }
            return;
        }

        if (result.order.status === 'failed') {
            queryClient.setQueryData(pendingSubscriptionOrderQueryKey(targetUserId), {
                order: null,
                payments: [],
            });
            invalidateQuote();
            showMessage('پرداخت تکمیل نشد. می‌توانید پس از بررسی وضعیت کیف پول، دوباره اقدام کنید.', 'error');
            return;
        }

        restoredPendingOrderId.current = result.order.id;
        setPendingOrderError('');
        queryClient.setQueryData(pendingSubscriptionOrderQueryKey(targetUserId), {
            order: result.order,
            payments: result.payment ? [result.payment] : [],
        });
        showMessage('سفارش ایجاد شد. پس از پرداخت، برای بازگشت به برنامه اقدام کنید.');
        if (!result.payment?.redirect_url || currentUserIdRef.current !== targetUserId) return;

        try {
            await WebBrowser.openAuthSessionAsync(result.payment.redirect_url, input.app_return_url);
        } catch (error) {
            if (currentUserIdRef.current !== targetUserId) return;
            setPendingOrderError(getUserFacingErrorMessage(error, 'باز کردن درگاه پرداخت ناموفق بود.'));
            showMessage('سفارش ایجاد شده است، اما بازکردن درگاه ناموفق بود. وضعیت سفارش را بررسی کنید و تا مشخص‌شدن نتیجه پرداخت دیگری انجام ندهید.', 'error');
            return;
        }
        if (currentUserIdRef.current === targetUserId) {
            await checkOrder(result.order.id);
        }
    }, [checkOrder, clearPurchaseAttempt, invalidateQuote, queryClient, recordPurchaseCompletion, refreshPlanState, showMessage]);

    const continuePendingOrderPayment = async () => {
        if (!pendingOrderId || purchasing || purchaseActionInProgressRef.current) return;
        const payment = pendingOrderPayments.find(
            (item) => item.status === 'pending' && item.redirect_url,
        );
        if (!payment?.redirect_url) {
            showMessage('برای این سفارش لینک فعال درگاه در دسترس نیست؛ ابتدا وضعیت را استعلام کنید.');
            return;
        }

        const actionUserId = userId;
        if (actionUserId === null) return;
        const actionId = beginPurchaseAction();
        if (actionId === null) return;
        setPendingOrderError('');
        try {
            await WebBrowser.openAuthSessionAsync(
                payment.redirect_url,
                Linking.createURL('payment-return'),
            );
            await checkOrder(pendingOrderId);
        } catch (error) {
            if (currentUserIdRef.current !== actionUserId) return;
            const errorMessage = getUserFacingErrorMessage(error, 'ادامهٔ پرداخت ناموفق بود.');
            setPendingOrderError(errorMessage);
            showMessage(errorMessage, 'error');
        } finally {
            if (currentUserIdRef.current === actionUserId) finishPurchaseAction(actionId);
        }
    };

    const reconcilePendingOrder = async () => {
        if (!pendingOrderId || purchasing || purchaseActionInProgressRef.current) return;
        const actionUserId = userId;
        if (actionUserId === null) return;
        const actionId = beginPurchaseAction();
        if (actionId === null) return;
        setPendingOrderError('');
        try {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('نشست کاربری در دسترس نیست. دوباره وارد شوید.');
            if (currentUserIdRef.current !== actionUserId) return;
            await reconcileSubscriptionOrder(token, pendingOrderId);
            if (currentUserIdRef.current !== actionUserId) return;
            const result = await checkOrder(pendingOrderId);
            if (currentUserIdRef.current === actionUserId && result.order.status === 'pending') {
                showMessage('درگاه هنوز نتیجهٔ نهایی را اعلام نکرده است؛ سفارش باز می‌ماند و پرداخت دیگری انجام ندهید.');
            }
        } catch (error) {
            if (currentUserIdRef.current !== actionUserId) return;
            const errorMessage = getUserFacingErrorMessage(error, 'استعلام مستقیم پرداخت ناموفق بود.');
            setPendingOrderError(errorMessage);
            showMessage(errorMessage, 'error');
        } finally {
            if (currentUserIdRef.current === actionUserId) finishPurchaseAction(actionId);
        }
    };

    useEffect(() => {
        const oldUserId = previousUserId.current;
        if (oldUserId !== userId) {
            if (oldUserId !== null) {
                queryClient.removeQueries({ queryKey: walletQueryKey(oldUserId) });
                queryClient.removeQueries({ queryKey: currentPlanQueryKey(oldUserId) });
                queryClient.removeQueries({ queryKey: pendingSubscriptionOrderQueryKey(oldUserId) });
            }
            restoredPendingOrderId.current = null;
            pendingPurchaseAttemptRef.current = null;
            setPendingPurchaseAttempt(null);
            setLoadedPurchaseAttemptUserId(null);
            setPurchaseAttemptLoadError(null);
            purchaseActionInProgressRef.current = false;
            purchaseActionIdRef.current += 1;
            setPurchasing(false);
            quoteRequestId.current += 1;
            setQuote(null);
            setQuoteUserId(null);
            setQuoteDiscountCode('');
            setQuoteError('');
            setLoadingQuote(false);
            setCompletedPurchase(null);
            setPendingOrderError('');
            setDiscountCode('');
            setSelectedPaymentMethod('gateway');
            setSelectedTierOverride(null);
            setSelectedDurationOverride(null);
            setExpandedFeatures({});
        }
        previousUserId.current = userId;
    }, [queryClient, userId]);

    useEffect(() => {
        const order = pendingSubscriptionOrderQuery.data?.order;
        if (!order || pendingOrderUnavailable || restoredPendingOrderId.current === order.id) return;
        restoredPendingOrderId.current = order.id;
        void checkOrder(order.id).catch((error: unknown) => {
            if (currentUserIdRef.current === userId) {
                setPendingOrderError(getUserFacingErrorMessage(error, 'بازیابی وضعیت خرید ناموفق بود.'));
            }
        });
    }, [checkOrder, pendingOrderUnavailable, pendingSubscriptionOrderQuery.data?.order, userId]);

    useEffect(() => {
        if (!pendingOrderId) {
            pendingOrderPolling.current = { orderId: null, checks: 0, inFlight: false };
            return;
        }
        if (pendingOrderUnavailable) return;

        const polling = pendingOrderPolling.current.orderId === pendingOrderId
            ? pendingOrderPolling.current
            : { orderId: pendingOrderId, checks: 0, inFlight: false };
        pendingOrderPolling.current = polling;

        const poll = async () => {
            if (
                AppState.currentState !== 'active'
                || polling.inFlight
                || polling.checks >= MAX_PENDING_ORDER_CHECKS
            ) return;
            polling.inFlight = true;
            polling.checks += 1;
            try {
                await checkOrder(pendingOrderId);
            } catch (error) {
                if (currentUserIdRef.current === userId) {
                    setPendingOrderError(getUserFacingErrorMessage(error, 'بررسی وضعیت پرداخت ناموفق بود.'));
                }
            } finally {
                polling.inFlight = false;
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
    }, [checkOrder, pendingOrderId, pendingOrderUnavailable, userId]);

    const loadQuote = useCallback(async (
        code: string,
        paymentMethod: SubscriptionPaymentMethod = selectedPaymentMethod,
    ) => {
        if (!selectedOffer) return;
        if (!user) return;
        if (purchaseUnavailableOffline) {
            setQuote(null);
            setQuoteError('برای محاسبهٔ قیمت و خرید، اتصال اینترنت و اطلاعات زندهٔ سرور لازم است.');
            return;
        }
        const requestId = ++quoteRequestId.current;
        const requestedDiscountCode = code.trim().toUpperCase();
        setLoadingQuote(true);
        setQuote(null);
        setQuoteUserId(null);
        setQuoteDiscountCode('');
        setQuoteError('');
        try {
            const token = await getStoredAuthToken();
            if (!token) {
                throw new Error('نشست کاربری برای دریافت مبلغ نهایی در دسترس نیست. دوباره وارد شوید.');
            }
            const [latestWallet, result] = await Promise.all([
                fetchWalletOverview(token),
                quoteSubscription(token, {
                    plan_key: selectedOffer.key,
                    ...(requestedDiscountCode ? { discount_code: requestedDiscountCode } : {}),
                    payment_method: paymentMethod,
                }),
            ]);
            if (requestId === quoteRequestId.current && currentUserIdRef.current === userId && userId !== null) {
                await saveOfflineCacheValue(userId, ACCOUNT_OFFLINE_CACHE.wallet, latestWallet);
                queryClient.setQueryData(walletQueryKey(userId), latestWallet);
            }
            if (requestId === quoteRequestId.current) {
                setQuote(result);
                setQuoteUserId(userId);
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
    }, [purchaseUnavailableOffline, queryClient, selectedOffer, selectedPaymentMethod, user, userId]);

    const handlePurchase = async () => {
        if (!user) {
            router.push('/auth?returnTo=plans');
            return;
        }
        if (
            purchasing
            || pendingOrderId
            || pendingOrderUnavailable
            || purchaseActionInProgressRef.current
            || purchaseAttemptUnavailable
            || currentPurchaseAttempt
            || financialRestricted
            || purchaseUnavailableOffline
            || !selectedOffer?.is_available
        ) return;
        if (!hasCurrentQuote) {
            await loadQuote(discountCode);
            return;
        }
        const actionUserId = userId;
        if (actionUserId === null || currentUserIdRef.current !== actionUserId) return;
        const actionId = beginPurchaseAction();
        if (actionId === null) return;
        setQuoteError('');
        let orderCreated = false;
        let purchaseRequestStarted = false;
        let attempt: PendingSubscriptionPurchaseAttempt | null = null;
        try {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('نشست کاربری در دسترس نیست. دوباره وارد شوید.');
            if (currentUserIdRef.current !== actionUserId) return;
            const [latestWallet, currentQuote] = await Promise.all([
                fetchWalletOverview(token),
                quoteSubscription(token, {
                    plan_key: selectedOfferKey,
                    ...(normalizedDiscountCode ? { discount_code: normalizedDiscountCode } : {}),
                    payment_method: selectedPaymentMethod,
                }),
            ]);
            if (currentUserIdRef.current !== actionUserId) return;
            await saveOfflineCacheValue(actionUserId, ACCOUNT_OFFLINE_CACHE.wallet, latestWallet);
            queryClient.setQueryData(walletQueryKey(actionUserId), latestWallet);
            const requestedDiscountCode = normalizedDiscountCode;
            const previousQuote = hasCurrentQuote ? quote : null;
            setQuote(currentQuote);
            setQuoteUserId(actionUserId);
            setQuoteDiscountCode(requestedDiscountCode);
            setQuoteError('');
            if (
                !previousQuote
                || previousQuote.payable_amount !== currentQuote.payable_amount
                || previousQuote.gross_amount !== currentQuote.gross_amount
                || previousQuote.credit_amount !== currentQuote.credit_amount
                || previousQuote.discount_amount !== currentQuote.discount_amount
                || previousQuote.wallet_amount !== currentQuote.wallet_amount
                || previousQuote.gateway_amount !== currentQuote.gateway_amount
                || previousQuote.payment_method !== currentQuote.payment_method
                || previousQuote.duration_days !== currentQuote.duration_days
                || previousQuote.plan_key !== currentQuote.plan_key
                || previousQuote.tier !== currentQuote.tier
                || previousQuote.duration !== currentQuote.duration
                || previousQuote.change_type !== currentQuote.change_type
                || previousQuote.source_subscription_id !== currentQuote.source_subscription_id
                || previousQuote.source_plan_key !== currentQuote.source_plan_key
                || formatDate(previousQuote.starts_at) !== formatDate(currentQuote.starts_at)
                || formatDate(previousQuote.ends_at) !== formatDate(currentQuote.ends_at)
            ) {
                showMessage(previousQuote
                    ? 'مبلغ یا شرایط پلن تغییر کرده است؛ جزئیات به‌روز را بررسی و دوباره تأیید کنید.'
                    : 'مبلغ نهایی محاسبه شد؛ جزئیات را بررسی و برای ادامه دوباره تأیید کنید.');
                return;
            }

            const input: SubscriptionPurchaseInput = {
                plan_key: selectedOfferKey,
                ...(requestedDiscountCode ? { discount_code: requestedDiscountCode } : {}),
                payment_method: selectedPaymentMethod,
                app_return_url: Linking.createURL('payment-return'),
                expected_quote: {
                    gross_amount: currentQuote.gross_amount,
                    payable_amount: currentQuote.payable_amount,
                    wallet_amount: currentQuote.wallet_amount,
                    gateway_amount: currentQuote.gateway_amount,
                    credit_amount: currentQuote.credit_amount,
                    discount_amount: currentQuote.discount_amount,
                    duration_days: currentQuote.duration_days,
                    change_type: currentQuote.change_type,
                    source_subscription_id: currentQuote.source_subscription_id,
                    source_plan_key: currentQuote.source_plan_key,
                },
            };
            attempt = {
                idempotencyKey: Crypto.randomUUID(),
                input,
                createdAt: Date.now(),
            };
            await savePendingSubscriptionPurchaseAttempt(actionUserId, attempt);
            if (currentUserIdRef.current !== actionUserId) return;
            const scopedAttempt = { userId: actionUserId, value: attempt };
            pendingPurchaseAttemptRef.current = scopedAttempt;
            setPendingPurchaseAttempt(scopedAttempt);
            purchaseRequestStarted = true;
            const result = await purchaseSubscription(token, input, attempt.idempotencyKey);
            orderCreated = true;
            await processPurchaseResult(result, input, actionUserId);
        } catch (error) {
            const errorMessage = getUserFacingErrorMessage(error, 'شروع خرید پلن ناموفق بود.');
            if (purchaseRequestStarted && !orderCreated && attempt && isTemporaryApiFailure(error)) {
                try {
                    const token = await getStoredAuthToken();
                    if (!token) throw new Error('نشست کاربری برای بازیابی سفارش در دسترس نیست.');
                    if (currentUserIdRef.current !== actionUserId) return;
                    const pendingResult = await fetchPendingSubscriptionOrder(token);
                    if (currentUserIdRef.current !== actionUserId) return;
                    if (pendingResult.order) {
                        orderCreated = true;
                        restoredPendingOrderId.current = pendingResult.order.id;
                        queryClient.setQueryData(
                            pendingSubscriptionOrderQueryKey(actionUserId),
                            pendingResult,
                        );
                        if (currentUserIdRef.current !== actionUserId) return;
                        setPendingOrderError('');
                        showMessage('پاسخ آغاز پرداخت نامشخص بود؛ سفارش باز پیدا شد. از گزینه‌های همین صفحه برای ادامه یا استعلام استفاده کنید. کلید همان درخواست تا تعیین تکلیف نهایی حفظ می‌شود.', 'error');
                        return;
                    }
                } catch (recoveryError) {
                    if (currentUserIdRef.current !== actionUserId) return;
                    setPendingOrderError(
                        `${errorMessage} ${getUserFacingErrorMessage(recoveryError, 'بازیابی سفارش انجام نشد؛ همان درخواست را از کارت تلاش نامشخص دوباره ارسال کنید.')}`,
                    );
                    showMessage('نتیجهٔ ثبت سفارش مشخص نیست؛ برای جلوگیری از پرداخت تکراری، فقط همان درخواست ذخیره‌شده را دوباره ارسال کنید.', 'error');
                    return;
                }
                if (currentUserIdRef.current !== actionUserId) return;
                setPendingOrderError('نتیجهٔ ثبت سفارش هنوز مشخص نیست. فقط با همان کلید و جزئیات ذخیره‌شده تلاش کنید.');
                showMessage('سفارش هنوز در دسترس نیست؛ تلاش دوباره با همان کلید امن است و خرید تازه ایجاد نمی‌کند.', 'error');
                return;
            }
            if (orderCreated) {
                if (currentUserIdRef.current !== actionUserId) return;
                setPendingOrderError(errorMessage);
                showMessage('سفارش ثبت شده است، اما بررسی ادامهٔ آن ناموفق بود. وضعیت سفارش را دوباره بررسی کنید.', 'error');
            } else {
                if (attempt) {
                    try {
                        await clearPurchaseAttempt(actionUserId);
                    } catch (clearError) {
                        console.error('پاک‌کردن کلید تلاش خرید ناموفق بود؛ کلید برای جلوگیری از خرید تکراری حفظ شد.', clearError);
                    }
                }
                if (currentUserIdRef.current !== actionUserId) return;
                invalidateQuote();
                showMessage(errorMessage, 'error');
            }
        } finally {
            if (currentUserIdRef.current === actionUserId) finishPurchaseAction(actionId);
        }
    };

    const retryUncertainPurchase = async () => {
        const scopedAttempt = pendingPurchaseAttemptRef.current;
        if (
            !scopedAttempt
            || scopedAttempt.userId !== userId
            || purchasing
            || purchaseActionInProgressRef.current
            || pendingOrderId
            || pendingOrderUnavailable
        ) return;
        const actionUserId = scopedAttempt.userId;
        const actionId = beginPurchaseAction();
        if (actionId === null) return;
        setPendingOrderError('');
        try {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('نشست کاربری در دسترس نیست. دوباره وارد شوید.');
            if (currentUserIdRef.current !== actionUserId) return;
            const result = await purchaseSubscription(
                token,
                scopedAttempt.value.input,
                scopedAttempt.value.idempotencyKey,
            );
            if (currentUserIdRef.current !== actionUserId) return;
            await processPurchaseResult(result, scopedAttempt.value.input, actionUserId);
        } catch (error) {
            if (currentUserIdRef.current !== actionUserId) return;
            const errorMessage = getUserFacingErrorMessage(error, 'تلاش دوباره برای تعیین وضعیت خرید ناموفق بود.');
            if (isTemporaryApiFailure(error)) {
                try {
                    const token = await getStoredAuthToken();
                    if (!token) throw new Error('نشست کاربری برای بازیابی سفارش در دسترس نیست.');
                    if (currentUserIdRef.current !== actionUserId) return;
                    const pendingResult = await fetchPendingSubscriptionOrder(token);
                    if (currentUserIdRef.current !== actionUserId) return;
                    if (pendingResult.order) {
                        queryClient.setQueryData(
                            pendingSubscriptionOrderQueryKey(actionUserId),
                            pendingResult,
                        );
                        try {
                            await clearPurchaseAttempt(actionUserId);
                        } catch (clearError) {
                            console.error('پاک‌کردن تلاش خرید بازیابی‌شده ناموفق بود؛ کلید حفظ شد.', clearError);
                        }
                        if (currentUserIdRef.current !== actionUserId) return;
                        setPendingOrderError('');
                        showMessage('سفارش باز پیدا شد؛ از گزینه‌های پیگیری همین صفحه استفاده کنید.', 'error');
                        return;
                    }
                } catch (recoveryError) {
                    if (currentUserIdRef.current !== actionUserId) return;
                    setPendingOrderError(
                        `${errorMessage} ${getUserFacingErrorMessage(recoveryError, 'وضعیت سفارش هم قابل‌بازیابی نیست؛ فقط همین درخواست ذخیره‌شده را دوباره امتحان کنید.')}`,
                    );
                    return;
                }
                if (currentUserIdRef.current === actionUserId) {
                    setPendingOrderError('نتیجهٔ خرید هنوز مشخص نیست؛ برای جلوگیری از خرید تکراری، فقط همین درخواست ذخیره‌شده را دوباره امتحان کنید.');
                }
                return;
            }

            try {
                await clearPurchaseAttempt(actionUserId);
            } catch (clearError) {
                console.error('پاک‌کردن کلید تلاش خرید ناموفق بود؛ کلید حفظ شد.', clearError);
            }
            if (currentUserIdRef.current !== actionUserId) return;
            invalidateQuote();
            setPendingOrderError(errorMessage);
            showMessage(errorMessage, 'error');
        } finally {
            if (currentUserIdRef.current === actionUserId) finishPurchaseAction(actionId);
        }
    };

    const checkPendingOrderStatus = async () => {
        if (!pendingOrderId || purchaseActionInProgressRef.current) return;
        const actionUserId = userId;
        if (actionUserId === null) return;
        const actionId = beginPurchaseAction();
        if (actionId === null) return;
        setPendingOrderError('');
        try {
            const result = await checkOrder(pendingOrderId);
            if (currentUserIdRef.current === actionUserId && result.order.status === 'pending') {
                showMessage('نتیجهٔ پرداخت هنوز قطعی نیست؛ سفارش تا تعیین تکلیف باز می‌ماند و پرداخت دیگری ممکن نیست.');
            } else if (currentUserIdRef.current === actionUserId && result.order.status === 'processing') {
                showMessage('پرداخت دریافت شده و در حال تأیید نهایی است.');
            }
        } catch (error) {
            if (currentUserIdRef.current !== actionUserId) return;
            const errorMessage = getUserFacingErrorMessage(error, 'بررسی وضعیت پرداخت ناموفق بود.');
            setPendingOrderError(errorMessage);
            showMessage(errorMessage, 'error');
        } finally {
            if (currentUserIdRef.current === actionUserId) finishPurchaseAction(actionId);
        }
    };

    const priceLabels = (offer: PlanOffer) => offer.is_available ? money(offer.price) : 'قیمت به‌زودی';
    const queryError = pendingSubscriptionOrderQuery.error ?? walletQuery.error;
    const pendingOrderOffer = catalog?.offers.find((offer) => offer.key === pendingOrderDetails?.plan_key);
    const pendingOrderTierName = catalog?.tiers.find((tier) => tier.key === pendingOrderOffer?.tier)?.name;
    const pendingOrderDurationName = catalog?.durations.find((duration) => duration.key === pendingOrderOffer?.duration)?.name;
    const pendingOrderPlanLabel = pendingOrderDetails?.plan_name
        ?? (pendingOrderTierName && pendingOrderDurationName
            ? `${pendingOrderTierName} · ${pendingOrderDurationName}`
            : 'پلن اشتراک');
    const refreshData = () => {
        void Promise.all([
            catalogQuery.refetch(),
            ...(userId !== null ? [walletQuery.refetch(), pendingSubscriptionOrderQuery.refetch()] : []),
        ]);
    };
    useOnlineRefetch(() => {
        void refreshData();
        if (userId !== null) {
            void refreshPlanState().catch((error: unknown) => {
                showMessage(
                    getUserFacingErrorMessage(error, 'به‌روزرسانی وضعیت اشتراک پس از اتصال ناموفق بود.'),
                    'error',
                );
            });
        }
    }, true);

    const selectTier = (tierKey: string) => {
        if (!catalog || purchasing || tierKey === selectedTier) return;
        const tierOffers = catalog.offers.filter((offer) => offer.tier === tierKey);
        const selectedDurationAvailable = tierOffers.some(
            (offer) => offer.duration === selectedDuration && offer.is_available,
        );
        if (!selectedDurationAvailable) {
            const firstAvailableOffer = tierOffers.find((offer) => offer.is_available);
            if (firstAvailableOffer) setSelectedDurationOverride(firstAvailableOffer.duration);
            else if (catalog.durations[0]) setSelectedDurationOverride(catalog.durations[0].key);
        }
        setCompletedPurchase(null);
        setSelectedTierOverride(tierKey);
        invalidateQuote();
    };

    const renderTierScene = (tierKey: string) => {
        const planCatalog = catalog;
        if (!planCatalog || planCatalog.tiers.length === 0) {
            return (
                <View style={[styles.loading, styles.scene]}>
                    {catalogQuery.isPending || catalogQuery.isFetching ? (
                        <>
                            <ActivityIndicator color={theme.primaryText} />
                            <ThemedText type="small" themeColor="textSecondary">
                                {catalogQuery.isPending ? 'در حال دریافت پلن‌ها…' : 'در حال تلاش دوباره…'}
                            </ThemedText>
                        </>
                    ) : (
                        catalogQuery.error ? (
                            <ErrorNoticeCard
                                message={getUserFacingErrorMessage(catalogQuery.error, 'دریافت اطلاعات پلن‌ها ناموفق بود.')}
                                onRetry={() => void catalogQuery.refetch()}
                                busy={catalogQuery.isFetching}
                                busyLabel="در حال تلاش دوباره…"
                                style={{ width: '100%' }}
                            />
                        ) : (
                            <>
                                <ThemedText type="small" themeColor="textSecondary">
                                    اطلاعات پلن‌ها در دسترس نیست.
                                </ThemedText>
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={catalogQuery.isFetching}
                                    onPress={() => void catalogQuery.refetch()}
                                >
                                    <ThemedText type="smallBold" themeColor="primaryText">تلاش دوباره</ThemedText>
                                </Pressable>
                            </>
                        )
                    )}
                    {purchaseAttemptLoadError?.userId === userId ? (
                        <ErrorNoticeCard
                            message={purchaseAttemptLoadError.message}
                            onRetry={() => {
                                if (userId !== null) void loadPendingPurchaseAttempt(userId);
                            }}
                            retryLabel="بررسی دوباره"
                            style={{ width: '100%' }}
                        />
                    ) : null}
                    {currentPurchaseAttempt && !pendingOrderId ? (
                        <View style={[styles.pendingOrderCard, { backgroundColor: theme.surface, borderColor: theme.warning }]}>
                            <ThemedText type="bodyBold">نتیجهٔ تلاش قبلی خرید مشخص نیست</ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                                برای جلوگیری از پرداخت تکراری، فقط همان درخواست ذخیره‌شده را دوباره ارسال کنید.
                            </ThemedText>
                            <Pressable
                                accessibilityRole="button"
                                disabled={purchasing || pendingOrderUnavailable || purchaseUnavailableOffline}
                                onPress={() => void retryUncertainPurchase()}
                                style={[styles.pendingActionButton, { backgroundColor: theme.primary, borderColor: theme.primary }]}
                            >
                                {purchasing
                                    ? <ActivityIndicator size="small" color={theme.onPrimary} />
                                    : <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
                                        تلاش دوباره با همان درخواست
                                    </ThemedText>}
                            </Pressable>
                        </View>
                    ) : null}
                    {pendingOrderId ? (
                        <View style={[styles.pendingOrderCard, { backgroundColor: theme.surface, borderColor: theme.warning }]}>
                            <ThemedText type="bodyBold">سفارش اشتراک در انتظار تعیین تکلیف است</ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                                شماره سفارش: {persianNumberFormatter.format(pendingOrderId)}؛ پیش از خرید دوباره، وضعیت آن را بررسی کنید.
                            </ThemedText>
                            {pendingOrderPayments.some((payment) => payment.status === 'pending' && payment.redirect_url) ? (
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={purchasing}
                                    onPress={() => void continuePendingOrderPayment()}
                                    style={[styles.pendingActionButton, { backgroundColor: theme.primary, borderColor: theme.primary }]}
                                >
                                    <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
                                        ادامهٔ همان پرداخت
                                    </ThemedText>
                                </Pressable>
                            ) : null}
                            <Pressable
                                accessibilityRole="button"
                                disabled={purchasing}
                                onPress={() => void checkPendingOrderStatus()}
                                style={[styles.pendingActionButton, { borderColor: theme.border }]}
                            >
                                <ThemedText type="smallBold" themeColor="primaryText">تازه‌سازی وضعیت سفارش</ThemedText>
                            </Pressable>
                        </View>
                    ) : null}
                </View>
            );
        }
        const tierInfo = planCatalog.tiers.find((tier) => tier.key === tierKey);
        if (!tierInfo) return null;
        const tierAccent = getPlanTierColor(tierKey, appTheme);
        const tierFeatures = Object.entries(planCatalog.feature_catalog)
            .filter(([key]) => hasPlanFeature(tierInfo, key));
        const visibleTierFeatures = expandedFeatures[tierKey] ? tierFeatures : tierFeatures.slice(0, 5);
        const tierFeatureGroups = Array.from(new Set(visibleTierFeatures.map(([, feature]) => feature.group)))
            .map((group) => ({
                group,
                features: visibleTierFeatures.filter(([, feature]) => feature.group === group),
            }));
        const tierOfferKey = `${tierKey}_${selectedDuration}`;
        const tierOffer = planCatalog.offers.find((offer) => offer.key === tierOfferKey) ?? null;
        const tierHasCurrentQuote = quote?.plan_key === tierOfferKey
            && quote.payment_method === selectedPaymentMethod
            && quoteDiscountCode === normalizedDiscountCode;
        const tierPurchaseCompleted = completedPurchase?.planKey === tierOfferKey;
        const quoteWalletBalance = wallet?.balance ?? 0;
        const paymentMethodOptions: {
            key: SubscriptionPaymentMethod;
            label: string;
            description: string;
            disabled: boolean;
        }[] = [
                {
                    key: 'wallet',
                    label: 'کیف پول',
                    description: 'پرداخت کامل از موجودی کیف پول',
                    disabled: !quote || quoteWalletBalance < quote.payable_amount,
                },
                {
                    key: 'combined',
                    label: 'ترکیبی',
                    description: 'استفاده از موجودی کیف پول و پرداخت باقی‌مانده از درگاه',
                    disabled: !quote
                        || quoteWalletBalance <= 0,
                },
                {
                    key: 'gateway',
                    label: 'درگاه پرداخت',
                    description: 'پرداخت کامل از طریق درگاه',
                    disabled: false,
                },
            ];

        return (
            <ScrollView
                style={styles.scene}
                contentContainerStyle={[styles.sceneContent, { paddingBottom: insets.bottom + Spacing.five }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                refreshControl={(
                    <RefreshControl
                        refreshing={catalogQuery.isRefetching || walletQuery.isRefetching || pendingSubscriptionOrderQuery.isRefetching}
                        onRefresh={refreshData}
                        tintColor={theme.primary}
                        colors={[theme.primary]}
                    />
                )}
            >
                {queryError ? (
                    <ErrorNoticeCard
                        message={getUserFacingErrorMessage(queryError, 'دریافت اطلاعات حساب ناموفق بود.')}
                        onRetry={refreshData}
                    />
                ) : null}
                {purchaseUnavailableOffline ? (
                    <OfflineDataNotice
                        theme={theme}
                        title="اطلاعات خرید به‌صورت زنده تأیید نشده است"
                        description={purchaseInformationSources.length > 0
                            ? 'اطلاعات زیر ممکن است به‌روز نباشند:'
                            : undefined}
                        sources={purchaseInformationSources}
                        emptyMessage="برای دریافت قیمت نهایی و بررسی وضعیت سفارش، اتصال زنده لازم است."
                        actionMessage="قیمت‌گیری نهایی، بررسی سفارش و خرید پس از اتصال و دریافت پاسخ زنده فعال می‌شوند."
                    />
                ) : null}
                {purchaseAttemptLoadError?.userId === userId ? (
                    <ErrorNoticeCard
                        message={purchaseAttemptLoadError.message}
                        onRetry={() => {
                            if (userId !== null) void loadPendingPurchaseAttempt(userId);
                        }}
                        retryLabel="بررسی دوباره"
                    />
                ) : purchaseAttemptUnavailable ? (
                    <ThemedText type="small" themeColor="textSecondary">
                        در حال بررسی وضعیت تلاش‌های قبلی خرید…
                    </ThemedText>
                ) : currentPurchaseAttempt && !pendingOrderId ? (
                    <View style={[styles.pendingOrderCard, { backgroundColor: theme.surface, borderColor: theme.warning }]}>
                        <ThemedText type="bodyBold">نتیجهٔ تلاش قبلی خرید مشخص نیست</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                            برای جلوگیری از پرداخت تکراری، خرید تازه‌ای آغاز نمی‌شود. با انتخاب «تلاش دوباره با همان درخواست»، همان کلید و جزئیات ذخیره‌شده ارسال می‌شود.
                        </ThemedText>
                        {pendingOrderError ? (
                            <ThemedText type="small" style={{ color: theme.error }} accessibilityRole="alert">
                                {pendingOrderError}
                            </ThemedText>
                        ) : null}
                        <Pressable
                            accessibilityRole="button"
                            disabled={purchasing || pendingOrderUnavailable || purchaseUnavailableOffline}
                            onPress={() => void retryUncertainPurchase()}
                            style={[
                                styles.pendingActionButton,
                                { backgroundColor: theme.primary, borderColor: theme.primary },
                                (purchasing || pendingOrderUnavailable || purchaseUnavailableOffline) && styles.disabledButton,
                            ]}
                        >
                            {purchasing
                                ? <ActivityIndicator size="small" color={theme.onPrimary} />
                                : <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
                                    تلاش دوباره با همان درخواست
                                </ThemedText>}
                        </Pressable>
                    </View>
                ) : null}
                {pendingOrderId ? (
                    <View style={[styles.pendingOrderCard, { backgroundColor: theme.surface, borderColor: theme.warning }]}>
                        <View style={styles.pendingOrderHeader}>
                            <View style={[styles.pendingOrderIcon, { backgroundColor: theme.warningFill }]}>
                                <MaterialCommunityIcons name="progress-clock" size={20} color={theme.warning} />
                            </View>
                            <View style={styles.flex}>
                                <ThemedText type="bodyBold">وضعیت پرداخت در حال پیگیری است</ThemedText>
                                <ThemedText type="small" themeColor="textSecondary">
                                    {pendingOrderPlanLabel}
                                    {' · '}
                                    {orderStatus === 'processing' ? 'در حال تأیید نهایی' : 'نتیجه هنوز قطعی نیست'}
                                </ThemedText>
                            </View>
                        </View>
                        {pendingOrderDetails ? (
                            <>
                                <ThemedText type="small" themeColor="textSecondary">
                                    شماره سفارش: {persianNumberFormatter.format(pendingOrderDetails.id)}
                                </ThemedText>
                                <ThemedText type="small" themeColor="textSecondary">
                                    مبلغ در انتظار پرداخت از درگاه: {money(pendingOrderDetails.gateway_amount)}
                                </ThemedText>
                            </>
                        ) : null}
                        {pendingOrderError ? (
                            <ThemedText type="small" style={{ color: theme.error }} accessibilityRole="alert">
                                {pendingOrderError}
                            </ThemedText>
                        ) : null}
                        <ThemedText type="small" themeColor="textSecondary">
                            برای جلوگیری از پرداخت تکراری، سفارش را لغو نکنید و خرید تازه‌ای انجام ندهید. اگر لینک درگاه موجود باشد، همان پرداخت را ادامه دهید؛ در غیر این صورت وضعیت را از درگاه استعلام کنید.
                        </ThemedText>
                        {pendingOrderPayments.some((payment) => payment.status === 'pending' && payment.redirect_url) ? (
                            <Pressable
                                accessibilityRole="button"
                                disabled={purchasing}
                                onPress={() => void continuePendingOrderPayment()}
                                style={[styles.pendingActionButton, { backgroundColor: theme.primary, borderColor: theme.primary }]}
                            >
                                {purchasing
                                    ? <ActivityIndicator size="small" color={theme.onPrimary} />
                                    : <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>ادامهٔ همان پرداخت در درگاه</ThemedText>}
                            </Pressable>
                        ) : null}
                        {pendingOrderPayments.some((payment) => (
                            payment.gateway === 'zarinpal'
                            && ['pending', 'initiation_unknown'].includes(payment.status)
                        )) ? (
                            <Pressable
                                accessibilityRole="button"
                                disabled={purchasing}
                                onPress={() => void reconcilePendingOrder()}
                                style={[styles.pendingActionButton, { borderColor: theme.border }]}
                            >
                                {purchasing
                                    ? <ActivityIndicator size="small" color={theme.primaryText} />
                                    : <ThemedText type="smallBold" themeColor="primaryText">استعلام مستقیم از زرین‌پال</ThemedText>}
                            </Pressable>
                        ) : (
                            <ThemedText type="small" themeColor="textSecondary">
                                برای این درگاه استعلام مستقیم در دسترس نیست؛ وضعیت پس از دریافت پاسخ درگاه به‌روز می‌شود.
                            </ThemedText>
                        )}
                        <Pressable
                            accessibilityRole="button"
                            disabled={purchasing}
                            onPress={() => void checkPendingOrderStatus()}
                            style={[styles.pendingActionButton, { borderColor: theme.border }]}
                        >
                            {purchasing
                                ? <ActivityIndicator size="small" color={theme.primaryText} />
                                : <ThemedText type="smallBold" themeColor="primaryText">تازه‌سازی وضعیت سفارش</ThemedText>}
                        </Pressable>
                        <ThemedText type="small" themeColor="textSecondary">
                            اگر استعلام نتیجهٔ قطعی نداد، جزئیات سفارش را آماده کنید و از مسیر رسمی پشتیبانی پیگیری کنید.
                        </ThemedText>
                        <Pressable
                            accessibilityRole="button"
                            disabled={purchasing}
                            onPress={() => void sharePendingOrderDetails()}
                            style={[styles.pendingActionButton, { borderColor: theme.border }]}
                        >
                            <ThemedText type="smallBold" themeColor="primaryText">اشتراک‌گذاری جزئیات برای پشتیبانی</ThemedText>
                        </Pressable>
                    </View>
                ) : null}
                <View style={[styles.benefitsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <View style={styles.benefitsHeader}>
                        <View style={[styles.benefitsIcon, { backgroundColor: getPlanTierLogoBackground(tierKey, appTheme) }]}>
                            <MaterialCommunityIcons name={getPlanTierIcon(tierKey)} size={20} color={getPlanTierLogoForeground(tierKey, appTheme)} />
                        </View>
                        <View style={styles.flex}>
                            <ThemedText type="bodyBold">{tierInfo?.name}</ThemedText>
                            <ThemedText type="small" themeColor="textSecondary">
                                {tierFeatures.length
                                    ? `${persianNumberFormatter.format(tierFeatures.length)} امکان در این پلن`
                                    : 'امکانات پایه برنامه'}
                            </ThemedText>
                        </View>
                        {tierKey === currentTier ? (
                            <View style={[styles.currentLabel, { backgroundColor: theme.surfaceVariant }]}>
                                <ThemedText type="smallBold" style={{ color: tierAccent }}>پلن فعلی</ThemedText>
                            </View>
                        ) : null}
                    </View>
                    <View style={[styles.featureList, { borderTopColor: theme.border }]}>
                        {tierFeatureGroups.map(({ group, features }) => (
                            <View key={group} style={styles.featureTimelineGroup}>
                                <View style={styles.featureGroupHeader}>
                                    <View style={[styles.featureGroupDivider, { backgroundColor: tierAccent }]} />
                                    <ThemedText type="smallBold" style={[styles.featureGroupTitle, { color: tierAccent }]}>
                                        {group}
                                    </ThemedText>
                                    <View style={[styles.featureGroupDivider, { backgroundColor: tierAccent }]} />
                                </View>
                                {features.map(([key, feature], index) => (
                                    <View key={key} style={styles.featureRow}>
                                        <View style={styles.featureTimelineRail}>
                                            {index < features.length - 1 ? (
                                                <View style={[styles.featureTimelineLine, { backgroundColor: tierAccent, opacity: 0.35 }]} />
                                            ) : null}
                                            <View style={[styles.featureTimelineDot, { backgroundColor: tierAccent, borderColor: theme.surface }]} />
                                        </View>
                                        <View style={styles.featureCopy}>
                                            <ThemedText type="smallBold">{feature.label}</ThemedText>
                                            <ThemedText type="small" themeColor="textSecondary" style={styles.featureDescription}>
                                                {feature.description ?? `دسترسی به ${feature.label} در این پلن فعال است.`}
                                            </ThemedText>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        ))}
                        {tierFeatures.length > 5 ? (
                            <Pressable
                                accessibilityRole="button"
                                accessibilityState={{ expanded: Boolean(expandedFeatures[tierKey]) }}
                                onPress={() => setExpandedFeatures((current) => ({
                                    ...current,
                                    [tierKey]: !current[tierKey],
                                }))}
                                style={styles.expandFeaturesButton}
                            >
                                <ThemedText type="smallBold" style={{ color: tierAccent }}>
                                    {expandedFeatures[tierKey]
                                        ? 'مشاهدهٔ کمتر'
                                        : `مشاهدهٔ ${persianNumberFormatter.format(tierFeatures.length - 5)} امکان دیگر`}
                                </ThemedText>
                                <MaterialCommunityIcons
                                    name={expandedFeatures[tierKey] ? 'chevron-up' : 'chevron-down'}
                                    size={18}
                                    color={tierAccent}
                                />
                            </Pressable>
                        ) : null}
                        {!tierFeatures.length ? (
                            <ThemedText type="small" themeColor="textSecondary">
                                ابزارهای پایه و امکانات رایگان برنامه در دسترس شماست.
                            </ThemedText>
                        ) : null}
                    </View>
                </View>

                {tierKey !== 'free' ? (
                    <View style={[styles.selectionPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <View style={styles.sectionHeading}>
                            <MaterialCommunityIcons name="calendar-range" size={20} color={theme.primaryText} />
                            <ThemedText type="bodyBold">انتخاب دوره</ThemedText>
                        </View>
                        <View style={styles.durationWrap}>
                            {planCatalog.durations.map((duration) => {
                                const offer = planCatalog.offers.find((item) => item.tier === tierKey && item.duration === duration.key);
                                const selected = selectedDuration === duration.key;
                                return (
                                    <Pressable
                                        key={duration.key}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected, disabled: !offer?.is_available || purchasing }}
                                        disabled={!offer?.is_available || purchasing}
                                        onPress={() => {
                                            setSelectedDurationOverride(duration.key);
                                            setCompletedPurchase(null);
                                            invalidateQuote();
                                        }}
                                        style={[
                                            styles.durationChip,
                                            { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primary : theme.surface },
                                            !offer?.is_available && styles.disabledChip,
                                        ]}
                                    >
                                        <ThemedText type="smallBold" style={selected ? { color: theme.onPrimary } : undefined}>{duration.name}</ThemedText>
                                        <ThemedText type="small" themeColor={selected ? 'onPrimary' : 'textSecondary'}>{offer ? priceLabels(offer) : 'ناموجود'}</ThemedText>
                                    </Pressable>
                                );
                            })}
                        </View>

                        <ThemedText type="smallBold" style={styles.inputLabel}>کد تخفیف (اختیاری)</ThemedText>
                        <View style={[styles.discountInputWrap, { borderColor: theme.border, backgroundColor: theme.surfaceElevated }]}>
                            <AppTextInput
                                value={discountCode}
                                editable={!purchasing && !pendingOrderId}
                                onChangeText={(value) => {
                                    setDiscountCode(value);
                                    setCompletedPurchase(null);
                                    invalidateQuote();
                                }}
                                placeholder="SAVE20"
                                placeholderTextColor={theme.textMuted}
                                autoCapitalize="characters"
                                autoCorrect={false}
                                style={[
                                    styles.discountInput,
                                    {
                                        color: theme.text,
                                        textAlign: 'left',
                                        writingDirection: 'ltr',
                                    },
                                ]}
                                accessibilityLabel="کد تخفیف"
                            />
                            <View
                                style={[
                                    styles.discountActionSeparator,
                                    { borderColor: theme.border },
                                ]}
                            />
                            <Pressable
                                accessibilityRole="button"
                                accessibilityState={{ disabled: loadingQuote || purchasing || Boolean(pendingOrderId) || pendingOrderUnavailable || purchaseUnavailableOffline }}
                                disabled={loadingQuote || purchasing || Boolean(pendingOrderId) || pendingOrderUnavailable || purchaseUnavailableOffline}
                                onPress={() => void loadQuote(discountCode)}
                                style={[
                                    styles.discountAction,
                                    (loadingQuote || purchasing || Boolean(pendingOrderId) || pendingOrderUnavailable || purchaseUnavailableOffline)
                                    && styles.disabledButton,
                                ]}
                            >
                                <ThemedText type="smallBold" themeColor="primaryText">{loadingQuote ? 'بررسی…' : 'اعمال کد'}</ThemedText>
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
                            <View style={styles.quoteLoading}>
                                <ActivityIndicator size="small" color={theme.primaryText} />
                                <ThemedText type="small" themeColor="textSecondary">محاسبه مبلغ نهایی…</ThemedText>
                            </View>
                        ) : tierPurchaseCompleted ? (
                            <View style={[styles.completionCard, { backgroundColor: theme.successFill, borderColor: theme.success }]}>
                                <MaterialCommunityIcons name="check-circle-outline" size={22} color={theme.onSuccess} />
                                <View style={styles.flex}>
                                    <ThemedText type="smallBold" style={{ color: theme.onSuccess }}>
                                        {completedPurchase.changeType === 'scheduled'
                                            ? 'پلن بعدی با موفقیت رزرو شد'
                                            : 'خرید پلن با موفقیت انجام شد'}
                                    </ThemedText>
                                    <ThemedText type="small" style={{ color: theme.onSuccess }}>
                                        {completedPurchase.changeType === 'scheduled'
                                            ? 'این پلن پس از پایان اشتراک فعلی فعال می‌شود.'
                                            : 'برای مشاهدهٔ وضعیت فعلی اشتراک، بخش پلن‌های من را ببینید.'}
                                    </ThemedText>
                                </View>
                            </View>
                        ) : tierHasCurrentQuote && quote ? (
                            <View style={[styles.quoteCard, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                                <ThemedText type="smallBold">جزئیات مبلغ</ThemedText>
                                <PriceLine
                                    label={quote.credit_amount > 0 ? 'قیمت پلن جدید' : 'قیمت دوره'}
                                    value={money(quote.gross_amount + quote.credit_amount)}
                                    theme={theme}
                                />
                                {quote.credit_amount > 0 ? (
                                    <PriceLine
                                        label="اعتبار اشتراک فعلی"
                                        value={`− ${money(quote.credit_amount)}`}
                                        theme={theme}
                                        tone="success"
                                    />
                                ) : null}
                                {quote.discount_amount > 0 ? (
                                    <PriceLine
                                        label="تخفیف"
                                        value={`− ${money(quote.discount_amount)}`}
                                        theme={theme}
                                        tone="success"
                                    />
                                ) : null}
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
                                <View style={[styles.quoteDivider, { backgroundColor: theme.border }]} />
                                <View style={[styles.payableAmountCard, { backgroundColor: theme.primary }]}>
                                    <PriceLine
                                        label="مبلغ قابل پرداخت"
                                        value={money(quote.payable_amount)}
                                        theme={theme}
                                        strong
                                    />
                                </View>
                                {quote.payable_amount > 0 && wallet ? (
                                    <>
                                        <View style={styles.paymentMethodSection}>
                                            <ThemedText type="smallBold">روش پرداخت</ThemedText>
                                            <View style={styles.paymentMethodOptions}>
                                                {paymentMethodOptions.map((option) => {
                                                    const selected = selectedPaymentMethod === option.key;
                                                    return (
                                                        <Pressable
                                                            key={option.key}
                                                            accessibilityRole="radio"
                                                            accessibilityState={{
                                                                checked: selected,
                                                                disabled: option.disabled || loadingQuote || purchasing || purchaseUnavailableOffline,
                                                            }}
                                                            disabled={option.disabled || loadingQuote || purchasing || purchaseUnavailableOffline}
                                                            onPress={() => {
                                                                setSelectedPaymentMethod(option.key);
                                                                void loadQuote(discountCode, option.key);
                                                            }}
                                                            style={[
                                                                styles.paymentMethodOption,
                                                                {
                                                                    borderColor: selected ? theme.primary : theme.border,
                                                                    backgroundColor: selected ? theme.primary : theme.surface,
                                                                },
                                                                (option.disabled || loadingQuote || purchasing || purchaseUnavailableOffline) && styles.disabledPaymentMethod,
                                                            ]}
                                                        >
                                                            <MaterialCommunityIcons
                                                                name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                                                                size={20}
                                                                color={selected ? theme.onPrimary : theme.textSecondary}
                                                            />
                                                            <View style={styles.flex}>
                                                                <ThemedText
                                                                    type="smallBold"
                                                                    themeColor={selected ? 'onPrimary' : 'text'}
                                                                >
                                                                    {option.label}
                                                                </ThemedText>
                                                                <ThemedText
                                                                    type="small"
                                                                    themeColor={selected ? 'onPrimary' : 'textSecondary'}
                                                                >
                                                                    {option.description}
                                                                </ThemedText>
                                                            </View>
                                                        </Pressable>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                        <View style={[styles.paymentSplit, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                            <ThemedText type="smallBold">سهم پرداخت</ThemedText>
                                            <PriceLine
                                                label="از کیف پول"
                                                value={money(quote.wallet_amount)}
                                                theme={theme}
                                                tone={quote.wallet_amount > 0 ? 'success' : 'default'}
                                            />
                                            <PriceLine
                                                label="از درگاه"
                                                value={money(quote.gateway_amount)}
                                                theme={theme}
                                                tone={quote.gateway_amount > 0 ? 'primary' : 'default'}
                                            />
                                        </View>
                                    </>
                                ) : null}
                                <View style={styles.quoteList}>
                                    <QuoteListItem
                                        text={quote.payment_method === 'wallet'
                                            ? 'مبلغ کامل از موجودی کیف پول پرداخت می‌شود.'
                                            : quote.payment_method === 'combined'
                                                ? quote.gateway_amount > 0
                                                    ? 'موجودی کیف پول برای بخشی از مبلغ استفاده می‌شود و باقی‌مانده از درگاه پرداخت خواهد شد.'
                                                    : 'مبلغ از موجودی کیف پول پرداخت می‌شود و موجودی اضافه در کیف پول باقی می‌ماند.'
                                                : 'مبلغ کامل از درگاه پرداخت می‌شود و موجودی کیف پول شما حفظ خواهد شد.'}
                                    />
                                    <QuoteListItem text={getChangeDescription(quote)} />
                                </View>
                            </View>
                        ) : (
                            <ThemedText type="small" themeColor="textSecondary" style={styles.quoteInfo}>
                                {tierOffer?.is_available
                                    ? 'برای مشاهده مبلغ نهایی و اعتبار باقی‌مانده، محاسبه مبلغ را انتخاب کنید.'
                                    : 'این بازه تا تعیین قیمت برای خرید در دسترس نیست.'}
                            </ThemedText>
                        )}

                        <Pressable
                            accessibilityRole="button"
                            accessibilityState={{
                                disabled: !tierPurchaseCompleted
                                    && (financialRestricted || !tierOffer?.is_available || purchasing || loadingQuote || Boolean(pendingOrderId) || pendingOrderUnavailable || purchaseUnavailableOffline || purchaseAttemptUnavailable || Boolean(currentPurchaseAttempt)),
                            }}
                            disabled={!tierPurchaseCompleted
                                && (financialRestricted || !tierOffer?.is_available || purchasing || loadingQuote || Boolean(pendingOrderId) || pendingOrderUnavailable || purchaseUnavailableOffline || purchaseAttemptUnavailable || Boolean(currentPurchaseAttempt))}
                            onPress={() => {
                                if (tierPurchaseCompleted) {
                                    router.push('/(tabs)/account/purchased-plans');
                                } else {
                                    void handlePurchase();
                                }
                            }}
                            style={({ pressed }) => [
                                styles.purchaseButton,
                                { backgroundColor: theme.primary, opacity: pressed ? 0.86 : 1 },
                                !tierPurchaseCompleted
                                && (financialRestricted || !tierOffer?.is_available || purchasing || loadingQuote || Boolean(pendingOrderId) || pendingOrderUnavailable || purchaseUnavailableOffline || purchaseAttemptUnavailable || Boolean(currentPurchaseAttempt))
                                && styles.disabledButton,
                            ]}
                        >
                            {purchasing ? <ActivityIndicator color={theme.onPrimary} /> : (
                                <View style={styles.purchaseButtonContent}>
                                    <MaterialCommunityIcons
                                        name={tierPurchaseCompleted
                                            ? 'crown-outline'
                                            : !user
                                                ? 'login'
                                                : pendingOrderId
                                                    ? 'progress-clock'
                                                    : pendingOrderUnavailable
                                                        ? pendingOrderLookupFailed ? 'cloud-question-outline' : 'progress-clock'
                                                        : purchaseAttemptUnavailable || currentPurchaseAttempt
                                                            ? 'progress-clock'
                                                            : !tierOffer?.is_available
                                                                ? 'calendar-remove-outline'
                                                                : !tierHasCurrentQuote
                                                                    ? 'calculator-variant-outline'
                                                                    : quote?.change_type === 'upgrade'
                                                                        ? 'arrow-up-bold-circle-outline'
                                                                        : quote?.change_type === 'scheduled'
                                                                            ? 'calendar-check-outline'
                                                                            : 'check-circle-outline'}
                                        size={19}
                                        color={theme.onPrimary}
                                    />
                                    <ThemedText type="smallBold" style={{ color: theme.onPrimary, fontSize: Typography.fontSize.body }}>
                                        {tierPurchaseCompleted
                                            ? 'مشاهدهٔ پلن‌های من'
                                            : financialRestricted
                                                ? 'خرید به‌دلیل محدودیت مالی غیرفعال است'
                                                : pendingOrderId
                                                    ? 'ابتدا سفارش در جریان را تعیین تکلیف کنید'
                                                    : pendingOrderUnavailable
                                                        ? pendingOrderLookupFailed
                                                            ? 'بررسی سفارش قبلی ناموفق بود'
                                                            : 'در حال بررسی سفارش قبلی…'
                                                        : purchaseAttemptUnavailable
                                                            ? 'در حال بررسی تلاش قبلی خرید…'
                                                            : currentPurchaseAttempt
                                                                ? 'ابتدا تلاش قبلی خرید را تعیین تکلیف کنید'
                                                                : !user
                                                                    ? 'ورود برای خرید'
                                                                    : !tierOffer?.is_available
                                                                        ? 'این دوره فعلاً در دسترس نیست'
                                                                        : !tierHasCurrentQuote
                                                                            ? 'محاسبه مبلغ نهایی'
                                                                            : quote?.change_type === 'upgrade'
                                                                                ? 'تأیید و ارتقا'
                                                                                : quote?.change_type === 'scheduled'
                                                                                    ? 'تأیید پلن بعدی'
                                                                                    : 'تأیید و خرید'}
                                    </ThemedText>
                                </View>
                            )}
                        </Pressable>
                    </View>
                ) : null}
            </ScrollView>
        );
    };

    const catalogAvailable = Boolean(catalog && catalog.tiers.length > 0);
    const tierRoutes: { key: string; title: string }[] = catalog && catalog.tiers.length > 0
        ? catalog.tiers.map((tier) => ({ key: tier.key, title: tier.name }))
        : FALLBACK_PLAN_TIER_ROUTES.map((route) => ({ ...route }));
    const selectedTierIndex = catalogAvailable
        ? Math.max(0, tierRoutes.findIndex((tier) => tier.key === selectedTier))
        : Math.min(fallbackTierIndex, tierRoutes.length - 1);
    return (
        <ThemedView style={styles.container}>
            <TabView
                navigationState={{
                    index: selectedTierIndex,
                    routes: tierRoutes,
                }}
                onIndexChange={(index) => {
                    const tier = tierRoutes[index];
                    if (!tier) return;
                    if (catalogAvailable) selectTier(tier.key);
                    else setFallbackTierIndex(index);
                }}
                renderScene={({ route }) => renderTierScene(route.key)}
                renderTabBar={({ navigationState, jumpTo }) => (
                    <View
                        accessibilityRole="tablist"
                        style={[styles.planTabBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}
                    >
                        {navigationState.routes.map((route, index) => {
                            return (
                                <PlanTierTab
                                    key={route.key}
                                    label={route.title}
                                    isActive={navigationState.index === index}
                                    isCurrent={!planAccess?.is_unlimited && route.key === currentTier}
                                    theme={theme}
                                    disabled={purchasing}
                                    onPress={() => jumpTo(route.key)}
                                />
                            );
                        })}
                    </View>
                )}
                direction="rtl"
                initialLayout={{ width }}
                swipeEnabled={!purchasing}
                lazy
                lazyPreloadDistance={1}
                style={styles.planPager}
            />
        </ThemedView>
    );
}

function PriceLine({
    label,
    value,
    theme,
    strong = false,
    tone = 'default',
}: {
    label: string;
    value: string;
    theme: ReturnType<typeof useTheme>;
    strong?: boolean;
    tone?: 'default' | 'success' | 'primary';
}) {
    const valueColor = strong
        ? theme.onPrimary
        : tone === 'success'
            ? theme.success
            : tone === 'primary'
                ? theme.primaryText
                : theme.text;

    return (
        <View style={styles.priceLine}>
            <ThemedText type={strong ? 'smallBold' : 'small'} themeColor={strong ? 'onPrimary' : 'textSecondary'}>{label}</ThemedText>
            <ThemedText type={strong ? 'bodyBold' : 'smallBold'} style={{ color: valueColor }}>{value}</ThemedText>
        </View>
    );
}

function QuoteListItem({ text }: { text: string }) {
    const theme = useTheme();

    return (
        <View style={styles.quoteListItem}>
            <View style={[styles.quoteListBullet, { backgroundColor: theme.textMuted }]} />
            <ThemedText type="small" themeColor="textSecondary" style={styles.quoteListText}>
                {text}
            </ThemedText>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    planPager: { flex: 1 },
    planTabBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
    planTab: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.one, position: 'relative' },
    planTabLabel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
    currentTierBadge: { borderRadius: 999, paddingHorizontal: 5, paddingVertical: 1 },
    planTabIndicator: { position: 'absolute', left: Spacing.two, right: Spacing.two, bottom: 0, height: 4, borderRadius: 999, overflow: 'hidden' },
    scene: { flex: 1 },
    sceneContent: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: Spacing.three },
    flex: { flex: 1 },
    loading: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.five },
    benefitsCard: { borderWidth: 1, borderRadius: Radius.xl, padding: Spacing.three, gap: Spacing.two },
    benefitsHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
    benefitsIcon: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    currentLabel: { borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 5 },
    featureList: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.three, gap: Spacing.three },
    featureTimelineGroup: { gap: Spacing.two },
    featureGroupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, marginBottom: Spacing.half },
    featureGroupDivider: { flex: 1, height: StyleSheet.hairlineWidth, opacity: 0.5 },
    featureGroupTitle: { lineHeight: Typography.lineHeight.body, textAlign: 'center' },
    featureRow: { minHeight: 58, flexDirection: 'row', alignItems: 'stretch', gap: Spacing.two },
    featureTimelineRail: { width: 18, alignItems: 'center', position: 'relative' },
    featureTimelineLine: { position: 'absolute', top: 8, bottom: -Spacing.two, width: 2 },
    featureTimelineDot: { width: 10, height: 10, borderWidth: 2, borderRadius: 5, marginTop: 4, zIndex: 1 },
    featureCopy: { flex: 1, gap: Spacing.half, paddingBottom: Spacing.two },
    featureDescription: { lineHeight: Typography.lineHeight.bodyLarge },
    expandFeaturesButton: { minHeight: 36, flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: Spacing.one, paddingHorizontal: Spacing.one },
    selectionPanel: { borderWidth: 1, borderRadius: Radius.xl, padding: Spacing.three, gap: Spacing.two },
    sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
    durationWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
    durationChip: { flexGrow: 1, minWidth: '45%', minHeight: 68, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two, alignItems: 'center', justifyContent: 'center', gap: Spacing.one },
    disabledChip: { opacity: 0.45 },
    inputLabel: { marginTop: Spacing.one },
    discountInputWrap: { minHeight: 52, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.two, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
    discountInput: { flex: 1, minHeight: 48, fontSize: Typography.fontSize.body, textAlign: 'left', writingDirection: 'ltr' },
    discountAction: { minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.two },
    discountActionSeparator: { minHeight: 32, borderStartWidth: StyleSheet.hairlineWidth, paddingStart: Spacing.two },
    quoteInfo: { lineHeight: Typography.lineHeight.label },
    quoteFeedback: { lineHeight: Typography.lineHeight.bodyLarge },
    quoteList: { gap: Spacing.one, marginTop: Spacing.one },
    quoteListItem: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.one },
    quoteListBullet: { width: 5, height: 5, borderRadius: 3, marginTop: 8 },
    quoteListText: { flex: 1, lineHeight: Typography.lineHeight.label },
    paymentMethodSection: { gap: Spacing.one },
    paymentMethodOptions: { gap: Spacing.one },
    paymentMethodOption: { minHeight: 54, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
    disabledPaymentMethod: { opacity: 0.45 },
    quoteLoading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
    quoteCard: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.two },
    quoteDivider: { height: StyleSheet.hairlineWidth, marginVertical: Spacing.one },
    payableAmountCard: { borderRadius: Radius.md, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two },
    paymentSplit: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.two, gap: Spacing.one },
    priceLine: { minHeight: 26, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
    purchaseButton: { minHeight: 52, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.one },
    purchaseButtonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.one },
    disabledButton: { opacity: 0.5 },
    completionCard: { borderWidth: 1, borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.two, flexDirection: 'row', alignItems: 'flex-start' },
    pendingOrderCard: { borderWidth: 1, borderRadius: 20, padding: Spacing.three, gap: Spacing.three },
    pendingOrderHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
    pendingOrderIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    pendingActionButton: { minHeight: 44, alignSelf: 'stretch', borderWidth: 1, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.two },
});