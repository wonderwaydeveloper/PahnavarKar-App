import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Animated as RNAnimated, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import { Snackbar } from 'react-native-paper';
import { TabView } from 'react-native-tab-view';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
    Easing,
    ReduceMotion,
    useAnimatedProps,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';

import { ConfirmationModal } from '@/components/confirmation-modal';
import { ErrorNoticeCard } from '@/components/error-notice-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useAppContext } from '@/hooks/use-app-context';
import { useAppFeedback } from '@/hooks/use-app-feedback';
import { useOnlineRefetch } from '@/hooks/use-online-refetch';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { usePlanAccess } from '@/hooks/use-plan-access';
import { CACHE_KEYS, CACHE_POLICY } from '@/services/cache-policy';
import { useTheme } from '@/hooks/use-theme';
import {
    AuthApiError,
    cancelScheduledSubscription,
    fetchCurrentPlan,
    fetchPlanCatalog,
    fetchWalletOverview,
    getStoredAuthToken,
    updateAutoRenew,
    type SubscriptionRecord,
} from '@/services/auth-api';
import {
    ACCOUNT_OFFLINE_CACHE,
    fetchWithOfflineFallback,
    isCurrentPlanCacheValue,
    isPlanCatalogCacheValue,
    isWalletOverviewCacheValue,
    withOfflineCacheMetadata,
    type OfflineAware,
} from '@/services/account-offline-cache';
import { getUserFacingErrorMessage } from '@/services/user-facing-error';
import { formatPersianDate } from '@/utils/persian-date';
import {
    getPlanTierIcon,
    getPlanTierLogoBackground,
    getPlanTierLogoForeground,
} from '@/utils/plan-tier-visual';

const planCatalogQueryKey = CACHE_KEYS.planCatalog;
const currentPlanQueryKey = CACHE_KEYS.currentPlan;
const walletQueryKey = CACHE_KEYS.walletOverview;
const PURCHASED_PLAN_TABS = [
    { key: 'current' as const, title: 'پلن فعال' },
    { key: 'scheduled' as const, title: 'رزروشده' },
    { key: 'history' as const, title: 'سوابق' },
];
const VALIDITY_COLORS = {
    light: { green: '#31CB00', yellow: '#FFD60A', red: '#FF002B' },
    dark: { green: '#4ADE80', yellow: '#FACC15', red: '#F87171' },
} as const;
const SCHEDULED_ACTIVATION_COLORS = {
    light: '#00B4D8',
    dark: '#0096C7',
} as const;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function PurchasedPlanTab({
    label,
    count,
    selected,
    theme,
    onPress,
}: {
    label: string;
    count: number;
    selected: boolean;
    theme: ReturnType<typeof useTheme>;
    onPress: () => void;
}) {
    const indicatorProgress = useState(() => new RNAnimated.Value(selected ? 1 : 0))[0];

    useEffect(() => {
        RNAnimated.spring(indicatorProgress, {
            toValue: selected ? 1 : 0,
            damping: 18,
            stiffness: 180,
            mass: 0.7,
            useNativeDriver: true,
        }).start();
    }, [indicatorProgress, selected]);

    return (
        <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${label}، ${new Intl.NumberFormat('fa-IR').format(count)}`}
            onPress={onPress}
            style={({ pressed }) => [
                styles.tab,
                { backgroundColor: pressed ? theme.surfaceVariant : theme.surface },
            ]}
        >
            <View style={styles.tabLabel}>
                <ThemedText
                    type={selected ? 'smallBold' : 'small'}
                    numberOfLines={1}
                    style={[
                        styles.tabTitle,
                        { color: selected ? theme.primaryText : theme.textSecondary },
                    ]}
                >
                    {label}
                </ThemedText>
                <View style={[
                    styles.tabCount,
                    { backgroundColor: selected ? theme.primaryContainer : theme.surfaceVariant },
                ]}>
                    <ThemedText
                        type="smallBold"
                        style={[
                            styles.tabCountText,
                            { color: selected ? theme.primaryText : theme.textSecondary },
                        ]}
                    >
                        {new Intl.NumberFormat('fa-IR').format(count)}
                    </ThemedText>
                </View>
            </View>
            <RNAnimated.View
                style={[
                    styles.tabIndicator,
                    {
                        backgroundColor: theme.primaryText,
                        opacity: indicatorProgress,
                        transform: [{ scaleX: indicatorProgress }],
                    },
                ]}
            />
        </Pressable>
    );
}

function formatDate(value: string, withTime = false): string {
    return formatPersianDate(value, withTime
        ? { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }
        : { year: 'numeric', month: 'long', day: 'numeric' },
    ) ?? 'نامشخص';
}

function getStatusLabel(subscription: SubscriptionRecord, now: number): string {
    if (subscription.status === 'active') {
        if (new Date(subscription.starts_at).getTime() > now) return 'رزروشده';
        return subscription.is_active ? 'فعال' : 'پایان‌یافته';
    }
    if (subscription.status === 'replaced') return 'ارتقایافته';
    if (subscription.status === 'cancelled') return 'لغوشده';
    return subscription.status;
}

export default function PurchasedPlansScreen() {
    const theme = useTheme();
    const { width } = useWindowDimensions();
    const router = useRouter();
    const { user, isLoading: authLoading } = useAuth();
    const { theme: appTheme } = useAppContext();
    const { showError } = useAppFeedback();
    const { refresh: refreshPlanAccess } = usePlanAccess();
    const queryClient = useQueryClient();
    const isOnline = useOnlineStatus();
    const userId = user?.id ?? null;
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [activeTab, setActiveTab] = useState<'current' | 'scheduled' | 'history'>('current');
    const currentPlanQuery = useQuery({
        queryKey: currentPlanQueryKey(userId ?? 0),
        enabled: userId !== null,
        queryFn: async (): Promise<OfflineAware<Awaited<ReturnType<typeof fetchCurrentPlan>>>> => {
            if (userId === null) throw new Error('نشست کاربری برای دریافت اشتراک در دسترس نیست.');
            const result = await fetchWithOfflineFallback(
                userId,
                ACCOUNT_OFFLINE_CACHE.currentPlan,
                async () => {
                    const token = await getStoredAuthToken();
                    if (!token) throw new Error('نشست کاربری برای دریافت اشتراک در دسترس نیست.');
                    return fetchCurrentPlan(token);
                },
                isCurrentPlanCacheValue,
                { isOnline },
            );
            return withOfflineCacheMetadata(result);
        },
        staleTime: CACHE_POLICY.query.resources.currentPlan.staleTimeMs,
        retry: false,
        networkMode: 'always',
    });
    const subscriptions = currentPlanQuery.data?.subscriptions ?? [];
    const activeSubscription = currentPlanQuery.data?.subscription ?? null;
    const catalogQuery = useQuery({
        queryKey: planCatalogQueryKey,
        enabled: userId !== null && subscriptions.length > 0,
        queryFn: async () => {
            if (userId === null) throw new Error('برای مشاهدهٔ پلن‌ها وارد حساب شوید.');
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
        enabled: userId !== null
            && activeSubscription !== null
            && expandedId === activeSubscription.id,
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
    const catalog = catalogQuery.data ?? null;
    const wallet = walletQuery.data ?? null;
    const [updatingAutoRenew, setUpdatingAutoRenew] = useState(false);
    const [scheduledSubscriptionToCancel, setScheduledSubscriptionToCancel] = useState<SubscriptionRecord | null>(null);
    const [cancellingScheduled, setCancellingScheduled] = useState(false);
    const [message, setMessage] = useState('');
    const [messageKind, setMessageKind] = useState<'info' | 'success' | 'error'>('success');
    const previousUserId = useRef(userId);
    const hasFocusedScreen = useRef(false);
    const focusedQueryState = useRef({ hasSubscriptions: false, walletExpanded: false });
    const [currentTime, setCurrentTime] = useState(Date.now);

    const dataLoading = currentPlanQuery.isPending;
    const subscriptionMutationInFlight = useRef(false);
    const subscriptionActionsUnavailable = !isOnline
        || currentPlanQuery.isFetching
        || currentPlanQuery.isError
        || currentPlanQuery.data?.offlineCacheSavedAt !== undefined;

    useEffect(() => {
        focusedQueryState.current = {
            hasSubscriptions: subscriptions.length > 0,
            walletExpanded: activeSubscription !== null && expandedId === activeSubscription.id,
        };
    }, [activeSubscription, expandedId, subscriptions.length]);

    useFocusEffect(useCallback(() => {
        setCurrentTime(Date.now());
        const timer = setInterval(() => setCurrentTime(Date.now()), 60 * 1000);
        if (!hasFocusedScreen.current) {
            hasFocusedScreen.current = true;
        } else if (userId !== null) {
            void queryClient.invalidateQueries({ queryKey: currentPlanQueryKey(userId) });
            if (focusedQueryState.current.hasSubscriptions) {
                void queryClient.invalidateQueries({ queryKey: planCatalogQueryKey });
            }
            if (focusedQueryState.current.walletExpanded) {
                void queryClient.invalidateQueries({ queryKey: walletQueryKey(userId) });
            }
        }
        return () => clearInterval(timer);
    }, [queryClient, userId]));

    useEffect(() => {
        const oldUserId = previousUserId.current;
        if (oldUserId !== null && oldUserId !== userId) {
            queryClient.removeQueries({ queryKey: currentPlanQueryKey(oldUserId) });
            queryClient.removeQueries({ queryKey: walletQueryKey(oldUserId) });
            setExpandedId(null);
            setActiveTab('current');
            setScheduledSubscriptionToCancel(null);
        }
        previousUserId.current = userId;
    }, [queryClient, userId]);

    const scheduledSubscription = subscriptions.find(
        (subscription) => subscription.status === 'active'
            && new Date(subscription.starts_at).getTime() > currentTime,
    ) ?? null;
    const orderedSubscriptions = [...subscriptions].sort((first, second) => {
        const getPriority = (subscription: SubscriptionRecord) => {
            if (subscription.id === activeSubscription?.id) return 0;
            if (subscription.id === scheduledSubscription?.id) return 1;
            return 2;
        };
        return getPriority(first) - getPriority(second);
    });
    const currentAndScheduledSubscriptions = orderedSubscriptions.filter(
        (subscription) => subscription.id === activeSubscription?.id
            || subscription.id === scheduledSubscription?.id,
    );
    const activeSubscriptions = currentAndScheduledSubscriptions.filter(
        (subscription) => subscription.id === activeSubscription?.id,
    );
    const scheduledSubscriptions = currentAndScheduledSubscriptions.filter(
        (subscription) => subscription.id === scheduledSubscription?.id,
    );
    const historicalSubscriptions = orderedSubscriptions.filter(
        (subscription) => subscription.id !== activeSubscription?.id
            && subscription.id !== scheduledSubscription?.id,
    );
    const subscriptionsByTab = {
        current: activeSubscriptions,
        scheduled: scheduledSubscriptions,
        history: historicalSubscriptions,
    };
    const changeAutoRenew = async (enabled: boolean) => {
        if (subscriptionMutationInFlight.current) return;
        if (subscriptionActionsUnavailable) {
            setMessage('برای تغییر تمدید خودکار، اتصال اینترنت و اطلاعات زندهٔ اشتراک لازم است.');
            setMessageKind('info');
            return;
        }
        if (enabled) {
            const blockReason = user?.restricted_capabilities?.includes('financial')
                ? `به‌دلیل محدودیت امور مالی حساب، امکان فعال‌سازی تمدید خودکار وجود ندارد.${user.restriction_reason?.trim() ? ` دلیل: ${user.restriction_reason.trim()}` : ''}`
                : scheduledSubscription
                    ? 'برای این اشتراک پلن دیگری رزرو شده است؛ تمدید خودکار تا فعال‌شدن پلن رزروشده قابل فعال‌سازی نیست.'
                    : activeSubscription?.cancellation_scheduled
                        ? 'این اشتراک برای لغو در پایان دوره تنظیم شده است و تمدید خودکار آن قابل فعال‌سازی نیست.'
                        : null;
            if (blockReason) {
                setMessage(blockReason);
                setMessageKind('info');
                return;
            }
        }
        subscriptionMutationInFlight.current = true;
        setUpdatingAutoRenew(true);
        try {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('نشست کاربری برای تغییر تمدید خودکار در دسترس نیست.');
            await updateAutoRenew(token, enabled);
            await refreshPlanAccess();
            if (userId !== null) {
                await Promise.all([
                    queryClient.invalidateQueries({ queryKey: currentPlanQueryKey(userId) }),
                    queryClient.invalidateQueries({ queryKey: walletQueryKey(userId) }),
                ]);
            }
            setMessage(enabled
                ? 'تمدید خودکار با کیف پول فعال شد.'
                : 'تمدید خودکار غیرفعال شد؛ اشتراک فعلی تا پایان دوره فعال می‌ماند.');
            setMessageKind('success');
        } catch (error) {
            if (enabled && error instanceof AuthApiError
                && (error.status === 422 || error.code === 'account_capability_restricted')) {
                setMessage(getUserFacingErrorMessage(error, 'تغییر وضعیت تمدید خودکار ناموفق بود.'));
                setMessageKind('info');
            } else {
                showError(error, 'تغییر وضعیت تمدید خودکار ناموفق بود.');
            }
        } finally {
            subscriptionMutationInFlight.current = false;
            setUpdatingAutoRenew(false);
        }
    };

    const cancelScheduledPlan = async () => {
        if (!scheduledSubscriptionToCancel || subscriptionMutationInFlight.current) return;
        if (subscriptionActionsUnavailable) {
            setMessage('برای لغو پلن رزروشده، اتصال اینترنت و وضعیت زندهٔ اشتراک لازم است.');
            setMessageKind('info');
            return;
        }
        subscriptionMutationInFlight.current = true;
        setCancellingScheduled(true);
        try {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('نشست کاربری برای لغو پلن رزروشده در دسترس نیست.');
            const result = await cancelScheduledSubscription(token);
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: currentPlanQueryKey(userId ?? 0) }),
                queryClient.invalidateQueries({ queryKey: walletQueryKey(userId ?? 0) }),
                refreshPlanAccess(),
            ]);
            setScheduledSubscriptionToCancel(null);
            setMessage(
                `پلن رزروشده لغو شد و ${new Intl.NumberFormat('fa-IR').format(result.refund_amount)} تومان به کیف پول شما بازگشت.`,
            );
            setMessageKind('success');
        } catch (error) {
            showError(error, 'لغو پلن رزروشده ناموفق بود.');
        } finally {
            subscriptionMutationInFlight.current = false;
            setCancellingScheduled(false);
        }
    };

    const refreshData = () => {
        if (userId === null) return;
        const requests: Promise<unknown>[] = [currentPlanQuery.refetch()];
        if (subscriptions.length > 0) requests.push(catalogQuery.refetch());
        if (activeSubscription !== null && expandedId === activeSubscription.id) {
            requests.push(walletQuery.refetch());
        }
        void Promise.all(requests);
    };
    useOnlineRefetch(() => {
        refreshData();
        void refreshPlanAccess().catch((error: unknown) => {
            showError(error, 'به‌روزرسانی دسترسی پلن ناموفق بود.');
        });
    }, userId !== null);

    return (
        <ThemedView style={styles.container}>
            {authLoading ? (
                <View style={styles.centered}>
                    <ActivityIndicator color={theme.primaryText} />
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>در حال بررسی حساب…</ThemedText>
                </View>
            ) : !user ? (
                <View style={styles.centered}>
                    <MaterialCommunityIcons name="account-lock-outline" size={34} color={theme.primaryText} />
                    <ThemedText type="smallBold">برای مشاهدهٔ پلن‌های خود وارد حساب شوید.</ThemedText>
                    <Pressable
                        accessibilityRole="button"
                        onPress={() => router.push('/auth?returnTo=plans')}
                        style={[styles.retryButton, { backgroundColor: theme.primary }]}
                    >
                        <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>ورود به حساب</ThemedText>
                    </Pressable>
                </View>
            ) : (
                <>
                    <TabView
                        navigationState={{
                            index: PURCHASED_PLAN_TABS.findIndex((tab) => tab.key === activeTab),
                            routes: PURCHASED_PLAN_TABS,
                        }}
                        onIndexChange={(index) => {
                            const tab = PURCHASED_PLAN_TABS[index];
                            if (tab) setActiveTab(tab.key);
                        }}
                        renderScene={({ route }) => (
                            <ScrollView
                                style={styles.scene}
                                contentContainerStyle={styles.content}
                                showsVerticalScrollIndicator={false}
                                refreshControl={(
                                    <RefreshControl
                                        refreshing={currentPlanQuery.isRefetching || catalogQuery.isRefetching || walletQuery.isRefetching}
                                        onRefresh={refreshData}
                                        tintColor={theme.primary}
                                        colors={[theme.primary]}
                                    />
                                )}
                            >
                    {!isOnline ? (
                        <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.warning }]}>
                            <ThemedText type="smallBold" style={{ color: theme.warning }}>
                                {currentPlanQuery.data
                                    ? `اطلاعات اشتراک${currentPlanQuery.data.offlineCacheSavedAt !== undefined ? ' ذخیره‌شده' : ''}؛ آخرین دریافت ${new Date(currentPlanQuery.data.offlineCacheSavedAt ?? currentPlanQuery.dataUpdatedAt).toLocaleString('fa-IR')}.`
                                    : 'اتصال اینترنت در دسترس نیست؛ اطلاعات ذخیره‌شدهٔ قابل‌نمایش موجود نیست.'}
                            </ThemedText>
                            <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                تغییر تمدید خودکار و لغو پلن رزروشده تا دریافت وضعیت زندهٔ سرور غیرفعال است.
                            </ThemedText>
                        </View>
                    ) : null}
                    {currentPlanQuery.data?.offlineCacheSavedAt !== undefined && isOnline ? (
                        <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.warning }]}>
                            <ThemedText type="small" style={{ color: theme.warning }}>
                                اطلاعات اشتراک از حافظهٔ آفلاین نمایش داده می‌شود؛ آخرین ذخیره‌سازی {new Date(currentPlanQuery.data.offlineCacheSavedAt).toLocaleString('fa-IR')} بوده است.
                            </ThemedText>
                        </View>
                    ) : null}
                    {currentPlanQuery.error ? (
                        <ErrorNoticeCard
                            message={getUserFacingErrorMessage(currentPlanQuery.error, 'دریافت پلن‌های خریداری‌شده ناموفق بود.')}
                            onRetry={() => void currentPlanQuery.refetch()}
                            busy={currentPlanQuery.isRefetching}
                            busyLabel="در حال دریافت اشتراک‌ها…"
                        />
                    ) : null}
                    {catalogQuery.error ? (
                        <ErrorNoticeCard
                            message={getUserFacingErrorMessage(catalogQuery.error, 'دریافت نام پلن‌ها ناموفق بود.')}
                            onRetry={() => void catalogQuery.refetch()}
                            busy={catalogQuery.isRefetching}
                            busyLabel="در حال دریافت نام پلن‌ها…"
                        />
                    ) : null}
                    {walletQuery.error ? (
                        <ErrorNoticeCard
                            message={getUserFacingErrorMessage(walletQuery.error, 'دریافت موجودی کیف پول ناموفق بود.')}
                            onRetry={() => void walletQuery.refetch()}
                            busy={walletQuery.isRefetching}
                            busyLabel="در حال دریافت موجودی…"
                        />
                    ) : null}
                    {dataLoading ? (
                        <View style={styles.centered}>
                            <ActivityIndicator color={theme.primaryText} />
                            <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                در حال دریافت پلن‌ها…
                            </ThemedText>
                        </View>
                    ) : null}
                    {!dataLoading && subscriptionsByTab[route.key].length === 0
                        && !(currentPlanQuery.isError && !currentPlanQuery.data) ? (
                        <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                            <MaterialCommunityIcons
                                name={route.key === 'current'
                                    ? 'crown-outline'
                                    : route.key === 'scheduled' ? 'calendar-clock-outline' : 'history'}
                                size={30}
                                color={theme.textSecondary}
                            />
                            <ThemedText type="smallBold">
                                {route.key === 'current'
                                    ? subscriptions.length === 0
                                        ? 'هنوز پلنی خریداری نکرده‌اید.'
                                        : 'پلن فعالی ندارید.'
                                    : route.key === 'scheduled'
                                        ? 'پلن رزروشده‌ای ندارید.'
                                        : 'سابقه‌ای برای نمایش وجود ندارد.'}
                            </ThemedText>
                            {route.key === 'current' && subscriptions.length === 0 ? (
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={() => router.push('/(tabs)/account/plan-catalog')}
                                    style={[styles.retryButton, { backgroundColor: theme.primary }]}
                                >
                                    <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>مشاهدهٔ پلن‌ها</ThemedText>
                                </Pressable>
                            ) : null}
                        </View>
                    ) : subscriptionsByTab[route.key].map((subscription) => {
                        const expanded = expandedId === subscription.id;
                        const scheduled = scheduledSubscription?.id === subscription.id;
                        const isCurrent = activeSubscription?.id === subscription.id;
                        const tierKey = subscription.plan_key.split('_')[0];
                        const tierName = catalog?.tiers.find((tier) => tier.key === tierKey)?.name ?? subscription.plan_key;
                        const replacedByPlanKey = subscription.replaced_by?.plan_key;
                        const replacedByTierKey = replacedByPlanKey?.split('_')[0];
                        const replacedByTierName = replacedByPlanKey
                            ? catalog?.tiers.find((tier) => tier.key === replacedByTierKey)?.name ?? replacedByPlanKey
                            : null;
                        const status = getStatusLabel(subscription, currentTime);
                        return (
                                <View key={subscription.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                {isCurrent && subscription.is_active ? (
                                    <RemainingValidityIndicator
                                        startsAt={subscription.starts_at}
                                        endsAt={subscription.ends_at}
                                        now={currentTime}
                                        colorTheme={appTheme}
                                        theme={theme}
                                    />
                                ) : null}
                                {scheduled ? (
                                    <ScheduledActivationIndicator
                                        reservedAt={subscription.reservation_created_at}
                                        startsAt={subscription.starts_at}
                                        now={currentTime}
                                        color={SCHEDULED_ACTIVATION_COLORS[appTheme]}
                                        theme={theme}
                                    />
                                ) : null}
                                {((isCurrent && subscription.is_active) || scheduled) ? (
                                    <View style={[styles.validitySeparator, { backgroundColor: theme.border }]} />
                                ) : null}
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityState={{ expanded }}
                                    onPress={() => setExpandedId((current) => current === subscription.id ? null : subscription.id)}
                                    style={({ pressed }) => [
                                        styles.cardHeader,
                                        pressed && { backgroundColor: theme.surfaceVariant },
                                    ]}
                                >
                                    <View style={[styles.planIcon, { backgroundColor: getPlanTierLogoBackground(tierKey, appTheme) }]}>
                                        <MaterialCommunityIcons
                                            name={getPlanTierIcon(tierKey)}
                                            size={20}
                                            color={getPlanTierLogoForeground(tierKey, appTheme)}
                                        />
                                    </View>
                                    <View style={styles.flex}>
                                        <ThemedText type="smallBold">{tierName}</ThemedText>
                                        <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                            {scheduled
                                                ? `رزروشده · فعال‌سازی ${formatDate(subscription.starts_at)}`
                                                : `${status} · ${formatDate(subscription.starts_at)}`}
                                        </ThemedText>
                                    </View>
                                    <MaterialCommunityIcons
                                        name={expanded ? 'chevron-up' : 'chevron-down'}
                                        size={22}
                                        color={theme.textSecondary}
                                    />
                                </Pressable>
                                {expanded ? (
                                    <View style={[styles.details, { borderTopColor: theme.border }]}>
                                        <DetailRow label="وضعیت" value={status} theme={theme} />
                                        <DetailRow label="تاریخ فعال‌سازی" value={formatDate(subscription.starts_at, true)} theme={theme} />
                                        <DetailRow label="تاریخ انقضا" value={formatDate(subscription.ends_at, true)} theme={theme} />
                                        {scheduled ? (
                                            <>
                                                <DetailRow label="وضعیت خرید" value="خریداری و پرداخت‌شده" valueColor={theme.success} theme={theme} />
                                                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                                    پس از پایان پلن فعلی، این پلن در زمان‌بندی اعلام‌شده فعال می‌شود.
                                                </ThemedText>
                                                {typeof subscription.refundable_amount === 'number' ? (
                                                    <View style={[styles.refundNotice, { backgroundColor: theme.surfaceVariant }]}>
                                                        <MaterialCommunityIcons name="wallet-plus-outline" size={18} color={theme.primaryText} />
                                                        <ThemedText type="small" style={[styles.flex, { color: theme.textSecondary }]}>
                                                            در صورت لغو، {new Intl.NumberFormat('fa-IR').format(subscription.refundable_amount)} تومان به کیف پول بازمی‌گردد.
                                                        </ThemedText>
                                                    </View>
                                                ) : null}
                                                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                                    استفادهٔ دوباره از کد تخفیف فقط در صورت معتبر بودن آن هنگام خرید بعدی امکان‌پذیر است.
                                                </ThemedText>
                                                {typeof subscription.refundable_amount === 'number' ? (
                                                    <Pressable
                                                        accessibilityRole="button"
                                                        accessibilityState={{
                                                            disabled: cancellingScheduled
                                                                || updatingAutoRenew
                                                                || subscriptionActionsUnavailable,
                                                        }}
                                                        disabled={cancellingScheduled || updatingAutoRenew || subscriptionActionsUnavailable}
                                                        onPress={() => {
                                                            if (!subscriptionActionsUnavailable) {
                                                                setScheduledSubscriptionToCancel(subscription);
                                                            }
                                                        }}
                                                        style={({ pressed }) => [
                                                            styles.cancelScheduledButton,
                                                            {
                                                                borderColor: theme.error,
                                                                opacity: pressed
                                                                    || cancellingScheduled
                                                                    || updatingAutoRenew
                                                                    || subscriptionActionsUnavailable
                                                                    ? 0.55
                                                                    : 1,
                                                            },
                                                        ]}
                                                    >
                                                        <MaterialCommunityIcons name="calendar-remove-outline" size={18} color={theme.error} />
                                                        <ThemedText type="smallBold" style={{ color: theme.error }}>
                                                            لغو رزرو و بازگشت وجه
                                                        </ThemedText>
                                                    </Pressable>
                                                ) : null}
                                            </>
                                        ) : null}
                                        {isCurrent ? (
                                            <>
                                                {scheduledSubscription ? (
                                                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                                        پلن رزروشده پس از پایان این اشتراک فعال می‌شود؛ تمدید خودکار این پلن غیرفعال است.
                                                    </ThemedText>
                                                ) : null}
                                                <View style={[styles.autoRenew, { borderTopColor: theme.border }]}>
                                                    <View style={styles.flex}>
                                                        <ThemedText type="smallBold">تمدید خودکار</ThemedText>
                                                        <ThemedText
                                                            type="small"
                                                            style={{ color: subscription.auto_renew ? theme.success : theme.textSecondary }}
                                                        >
                                                            {subscription.auto_renew ? 'فعال' : 'غیرفعال'}
                                                        </ThemedText>
                                                    </View>
                                                    <Switch
                                                        accessibilityLabel="تمدید خودکار با کیف پول"
                                                        disabled={updatingAutoRenew || cancellingScheduled || subscriptionActionsUnavailable}
                                                        value={subscription.auto_renew}
                                                        onValueChange={(enabled) => void changeAutoRenew(enabled)}
                                                        trackColor={{ false: theme.borderStrong, true: theme.primary }}
                                                        thumbColor={theme.surface}
                                                    />
                                                </View>
                                                {wallet ? (
                                                    <DetailRow
                                                        label={wallet.offlineCacheSavedAt !== undefined ? 'موجودی کیف پول · آفلاین' : 'موجودی کیف پول'}
                                                        value={`${new Intl.NumberFormat('fa-IR').format(wallet.balance)} تومان`}
                                                        theme={theme}
                                                    />
                                                ) : null}
                                                {updatingAutoRenew ? <ActivityIndicator size="small" color={theme.primaryText} /> : null}
                                            </>
                                        ) : !scheduled ? (
                                            <DetailRow
                                                label="تمدید خودکار"
                                                value={subscription.auto_renew && subscription.status === 'active' ? 'فعال' : 'غیرفعال'}
                                                theme={theme}
                                            />
                                        ) : null}
                                        {subscription.status === 'replaced' ? (
                                            <>
                                                {replacedByTierName ? (
                                                    <>
                                                    <DetailRow label="ارتقا به پلن" value={replacedByTierName} theme={theme} />
                                                    {subscription.replaced_by?.replaced_at ? (
                                                        <DetailRow
                                                            label="تاریخ و ساعت ارتقا"
                                                            value={formatDate(subscription.replaced_by.replaced_at, true)}
                                                            theme={theme}
                                                        />
                                                    ) : null}
                                                    </>
                                                ) : null}
                                                <View style={[styles.upgradeNotice, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
                                                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                                    این اشتراک با ارتقا به پلن جدید پایان یافته است.
                                                    </ThemedText>
                                                </View>
                                            </>
                                        ) : subscription.status === 'cancelled' && typeof subscription.refund_amount === 'number' ? (
                                            <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                                پلن رزروشده لغو شد و {new Intl.NumberFormat('fa-IR').format(subscription.refund_amount)} تومان به کیف پول بازگشت.
                                            </ThemedText>
                                        ) : subscription.cancellation_scheduled && subscription.is_active ? (
                                            <ThemedText type="small" style={{ color: theme.warning }}>
                                                تمدید این اشتراک لغو شده و تا تاریخ انقضا فعال می‌ماند.
                                            </ThemedText>
                                        ) : null}
                                    </View>
                                ) : null}
                                </View>
                        );
                    })}
                    </ScrollView>
                        )}
                        renderTabBar={({ navigationState, jumpTo }) => (
                            <View
                                accessibilityRole="tablist"
                                style={[styles.tabBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}
                            >
                                {navigationState.routes.map((route, index) => {
                                    const count = route.key === 'current'
                                        ? activeSubscriptions.length
                                        : route.key === 'scheduled'
                                            ? scheduledSubscriptions.length
                                            : historicalSubscriptions.length;

                                    return (
                                        <PurchasedPlanTab
                                            key={route.key}
                                            label={route.title}
                                            count={count}
                                            selected={navigationState.index === index}
                                            theme={theme}
                                            onPress={() => jumpTo(route.key)}
                                        />
                                    );
                                })}
                            </View>
                        )}
                        direction="rtl"
                        initialLayout={{ width }}
                        swipeEnabled
                        lazy
                        lazyPreloadDistance={1}
                        style={styles.tabView}
                    />
                </>
            )}
            <Snackbar
                visible={message.length > 0}
                onDismiss={() => setMessage('')}
                duration={4500}
                style={{
                    backgroundColor: messageKind === 'error'
                        ? theme.errorFill
                        : messageKind === 'info' ? theme.infoFill : theme.successFill,
                }}
            >
                <ThemedText
                    type="small"
                    style={{
                        color: messageKind === 'error'
                            ? theme.onError
                            : messageKind === 'info' ? theme.onInfo : theme.onSuccess,
                    }}
                >
                    {message}
                </ThemedText>
            </Snackbar>
            <ConfirmationModal
                visible={scheduledSubscriptionToCancel !== null}
                title="لغو پلن رزروشده؟"
                message={scheduledSubscriptionToCancel
                    ? `با لغو این رزرو، ${new Intl.NumberFormat('fa-IR').format(scheduledSubscriptionToCancel.refundable_amount ?? 0)} تومان به کیف پول شما برمی‌گردد. کد تخفیف خرید قبلی فقط در صورت معتبر بودن هنگام خرید بعدی قابل استفاده است. تمدید خودکار پلن فعلی نیز خودکار فعال نمی‌شود.`
                    : ''}
                confirmLabel="لغو رزرو"
                icon="cash-refund"
                busy={cancellingScheduled}
                onCancel={() => {
                    if (!cancellingScheduled) setScheduledSubscriptionToCancel(null);
                }}
                onConfirm={cancelScheduledPlan}
            />
        </ThemedView>
    );
}

function RemainingValidityIndicator({
    startsAt,
    endsAt,
    now,
    colorTheme,
    theme,
}: {
    startsAt: string;
    endsAt: string;
    now: number;
    colorTheme: 'light' | 'dark';
    theme: ReturnType<typeof useTheme>;
}) {
    const startTime = new Date(startsAt).getTime();
    const endTime = new Date(endsAt).getTime();
    const duration = endTime - startTime;
    const isValidDuration = Number.isFinite(startTime) && Number.isFinite(endTime) && duration > 0;
    const remaining = isValidDuration ? Math.max(0, Math.min(1, (endTime - now) / duration)) : 0;
    const remainingDays = Math.max(0, Math.ceil((endTime - now) / (24 * 60 * 60 * 1000)));
    const colorSet = VALIDITY_COLORS[colorTheme];
    const remainingColor = remaining > 0.5
        ? colorSet.green
        : remaining > 0.2 ? colorSet.yellow : colorSet.red;
    const radius = 34;
    const circumference = 2 * Math.PI * radius;
    const formattedDays = new Intl.NumberFormat('fa-IR').format(remainingDays);
    const progress = useSharedValue(0);

    useEffect(() => {
        progress.value = withTiming(remaining, {
            duration: 850,
            easing: Easing.out(Easing.cubic),
            reduceMotion: ReduceMotion.System,
        });
    }, [progress, remaining]);

    const animatedCircleProps = useAnimatedProps(() => ({
        strokeDashoffset: circumference * (1 - progress.value),
    }));
    if (!isValidDuration) return null;

    return (
        <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={`اعتبار باقی‌مانده: ${formattedDays} روز`}
            style={[styles.validitySummary, { backgroundColor: theme.surface }]}
        >
            <View style={styles.validityCircle}>
                <Svg width={80} height={80} viewBox="0 0 80 80">
                    <Circle cx={40} cy={40} r={radius} fill="none" stroke={theme.border} strokeWidth={6} />
                    <AnimatedCircle
                        testID="remaining-validity-progress"
                        cx={40}
                        cy={40}
                        r={radius}
                        fill="none"
                        stroke={remainingColor}
                        strokeWidth={6}
                        strokeDasharray={`${circumference} ${circumference}`}
                        strokeLinecap="round"
                        rotation={-90}
                        origin="40, 40"
                        animatedProps={animatedCircleProps}
                    />
                </Svg>
                <View pointerEvents="none" style={styles.validityLabel}>
                    <ThemedText type="bodyBold" style={{ color: theme.text }}>{formattedDays}</ThemedText>
                    <View style={[styles.validityLabelDivider, { backgroundColor: theme.borderStrong }]} />
                    <ThemedText type="small" style={{ color: theme.text }}>روز</ThemedText>
                </View>
            </View>
            <View style={styles.validityCopy}>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>پایان دورهٔ فعلی</ThemedText>
                <ThemedText type="small">:</ThemedText>
                <ThemedText type="smallBold">{formatDate(endsAt)}</ThemedText>
            </View>
        </View>
    );
}

function ScheduledActivationIndicator({
    reservedAt,
    startsAt,
    now,
    color,
    theme,
}: {
    reservedAt?: string;
    startsAt: string;
    now: number;
    color: string;
    theme: ReturnType<typeof useTheme>;
}) {
    const reservationTime = reservedAt ? new Date(reservedAt).getTime() : Number.NaN;
    const activationTime = new Date(startsAt).getTime();
    const totalWait = activationTime - reservationTime;
    const isProgressKnown = Number.isFinite(reservationTime)
        && Number.isFinite(activationTime)
        && totalWait > 0;
    const remainingTime = Math.max(0, activationTime - now);
    const remainingProgress = isProgressKnown
        ? Math.max(0, Math.min(1, remainingTime / totalWait))
        : 0;
    const progress = useSharedValue(0);
    const animatedFillStyle = useAnimatedStyle(() => ({
        width: `${progress.value * 100}%`,
    }));

    useEffect(() => {
        progress.value = withTiming(remainingProgress, {
            duration: 500,
            easing: Easing.out(Easing.cubic),
            reduceMotion: ReduceMotion.System,
        });
    }, [progress, remainingProgress]);

    if (!Number.isFinite(activationTime) || activationTime <= now) return null;

    return (
        <View
            accessible
            accessibilityRole={isProgressKnown ? 'progressbar' : 'image'}
            accessibilityLabel={`زمان باقی‌مانده تا فعال‌سازی: ${formatRemainingTime(remainingTime)}`}
            accessibilityValue={isProgressKnown
                ? { min: 0, max: 100, now: Math.round(remainingProgress * 100) }
                : undefined}
            style={[styles.activationSummary, { backgroundColor: theme.surface }]}
        >
            <View style={styles.activationHeader}>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    زمان باقی‌مانده تا فعال‌سازی
                </ThemedText>
                <ThemedText type="smallBold" style={{ color }}>
                    {formatRemainingTime(remainingTime)}
                </ThemedText>
            </View>
            <View style={[styles.activationTrack, { backgroundColor: theme.surfaceVariant }]}>
                {isProgressKnown ? (
                    <Animated.View
                        testID="scheduled-activation-progress"
                        style={[styles.activationFill, { backgroundColor: color }, animatedFillStyle]}
                    />
                ) : null}
            </View>
        </View>
    );
}

function formatRemainingTime(milliseconds: number): string {
    const hourMs = 60 * 60 * 1000;
    const dayMs = 24 * hourMs;
    const value = milliseconds >= dayMs
        ? `${new Intl.NumberFormat('fa-IR').format(Math.ceil(milliseconds / dayMs))} روز`
        : milliseconds >= hourMs
            ? `${new Intl.NumberFormat('fa-IR').format(Math.ceil(milliseconds / hourMs))} ساعت`
            : `${new Intl.NumberFormat('fa-IR').format(Math.max(1, Math.ceil(milliseconds / (60 * 1000))))} دقیقه`;
    return value;
}

function DetailRow({
    label,
    value,
    theme,
    valueColor,
}: {
    label: string;
    value: string;
    theme: ReturnType<typeof useTheme>;
    valueColor?: string;
}) {
    return (
        <View style={styles.detailRow}>
            <ThemedText type="small" style={{ color: theme.textSecondary }}>{label}</ThemedText>
            <ThemedText type="smallBold" style={valueColor ? { color: valueColor } : undefined}>{value}</ThemedText>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    tabView: { flex: 1 },
    scene: { flex: 1 },
    content: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.five },
    tabBar: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth },
    tab: { flex: 1, minWidth: 0, minHeight: 54, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.one, position: 'relative' },
    tabLabel: { width: '100%', minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.one },
    tabTitle: { flexShrink: 1, minWidth: 0, textAlign: 'center' },
    tabCount: { minWidth: 22, height: 22, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 11, paddingHorizontal: Spacing.one },
    tabCountText: { fontVariant: ['tabular-nums'] },
    tabIndicator: { position: 'absolute', left: Spacing.two, right: Spacing.two, bottom: 0, height: 3, borderRadius: 999, overflow: 'hidden' },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.four },
    emptyCard: { alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: Radius.lg, padding: Spacing.four },
    retryButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md, paddingHorizontal: Spacing.three },
    card: { borderWidth: 1, borderRadius: Radius.md, overflow: 'hidden' },
    cardHeader: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.two },
    validitySeparator: { height: StyleSheet.hairlineWidth },
    planIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
    flex: { flex: 1 },
    validitySummary: { minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
    activationSummary: { minHeight: 72, justifyContent: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
    activationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
    activationTrack: { height: 6, borderRadius: 999, overflow: 'hidden' },
    activationFill: { height: '100%', borderRadius: 999 },
    validityCircle: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
    validityLabel: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', gap: 2 },
    validityLabelDivider: { width: 30, height: 1.5, borderRadius: 1 },
    validityCopy: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: Spacing.one, rowGap: 2 },
    details: { borderTopWidth: StyleSheet.hairlineWidth, padding: Spacing.two, gap: Spacing.two },
    detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
    upgradeNotice: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.sm, padding: Spacing.two },
    autoRenew: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.two },
    refundNotice: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, borderRadius: Radius.sm, padding: Spacing.two },
    cancelScheduledButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.one, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.two },
});
