import { Typography } from '@/constants/typography';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants, { AppOwnership } from 'expo-constants';
import * as Device from 'expo-device';
import { useFocusEffect, useIsFocused } from 'expo-router';
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, LayoutChangeEvent, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import { TabView, type NavigationState, type SceneRendererProps } from 'react-native-tab-view';
import { onlineManager, useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { AppSnackbar as Snackbar } from '@/components/app-snackbar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmationModal } from '@/components/confirmation-modal';
import { ErrorNoticeCard } from '@/components/error-notice-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useAppFeedback } from '@/hooks/use-app-feedback';
import { useOnlineStatus } from '@/hooks/use-online-status';
import { useOfflinePageNotice } from '@/hooks/use-offline-page-notice';
import { useTheme } from '@/hooks/use-theme';
import { CACHE_KEYS, CACHE_POLICY } from '@/services/cache-policy';
import {
    deleteNotification,
    deleteReadNotifications,
    fetchNotificationInbox,
    fetchNotificationCounts,
    fetchPushSubscriptionStatus,
    getStoredAuthToken,
    markAllNotificationsRead,
    markNotificationRead,
    removePushSubscription,
    restoreDeletedNotifications,
    savePushSubscription,
    type InboxNotification,
    type NotificationCategory,
    type NotificationCounts,
    type PaginatedResult,
} from '@/services/auth-api';
import { getUserFacingErrorMessage } from '@/services/user-facing-error';
import {
    fetchWithOfflineFallback,
    isNotificationCountsCacheValue,
    withOfflineCacheMetadata,
    type OfflineAware,
} from '@/services/account-offline-cache';
import { clearOfflineCacheNamespace } from '@/services/offline-cache';

const categories: { key: NotificationCategory; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [
    { key: 'account_access', label: 'حساب و دسترسی', icon: 'account-lock-outline' },
    { key: 'security', label: 'امنیت', icon: 'shield-lock-outline' },
    { key: 'finance', label: 'مالی و کیف پول', icon: 'wallet-outline' },
    { key: 'subscription', label: 'اشتراک و پلن', icon: 'crown-outline' },
    { key: 'service', label: 'خدمات سامانه', icon: 'application-cog-outline' },
    { key: 'announcement', label: 'اطلاعیه‌های رسمی', icon: 'bullhorn-outline' },
];
const categoriesByKey = new Map(categories.map((category) => [category.key, category]));

type NotificationFilter = 'all' | 'unread' | NotificationCategory;
type NotificationInboxPage = OfflineAware<PaginatedResult<InboxNotification>>;
type NotificationInboxData = InfiniteData<NotificationInboxPage, number>;
type PendingNotificationUndo = {
    token: string;
    deletedCount: number;
    expiresAt: number;
    userId: number;
};

function formatUndoCountdown(milliseconds: number): string {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    return `${persianTwoDigitFormatter.format(Math.floor(totalSeconds / 60))}:${persianTwoDigitFormatter.format(totalSeconds % 60)}`;
}

const notificationQueryKeys = {
    inboxPrefix: CACHE_KEYS.notificationInboxPrefix,
    inbox: CACHE_KEYS.notificationInbox,
    counts: CACHE_KEYS.notificationCounts,
};

const notificationFilters: {
    key: NotificationFilter;
    label: string;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    showUnreadCount?: boolean;
}[] = [
        { key: 'all', label: 'همه', icon: 'view-grid-outline' },
        { key: 'unread', label: 'خوانده‌نشده', icon: 'email-mark-as-unread', showUnreadCount: true },
        ...categories,
    ];

type NotificationRoute = (typeof notificationFilters)[number];
const NOTIFICATION_ROUTES: NotificationRoute[] = notificationFilters;

const priorityLabels = {
    normal: 'عادی',
    important: 'مهم',
    urgent: 'فوری',
} as const;

const LONG_NOTIFICATION_BODY_LENGTH = 300;
const NOTIFICATION_BODY_PREVIEW_LINES = 4;
const isExpoGo = Constants.appOwnership === AppOwnership.Expo;
const NOTIFICATION_OFFLINE_CACHE = CACHE_POLICY.offline.entries.notificationInbox;
const persianNumberFormatter = new Intl.NumberFormat('fa-IR');
const persianTwoDigitFormatter = new Intl.NumberFormat('fa-IR', {
    minimumIntegerDigits: 2,
    useGrouping: false,
});
const notificationDateFormatter = new Intl.DateTimeFormat('fa-IR', {
    dateStyle: 'long',
    calendar: 'persian',
    numberingSystem: 'arabext',
});
const notificationTimeFormatter = new Intl.DateTimeFormat('fa-IR', {
    timeStyle: 'short',
    calendar: 'persian',
    numberingSystem: 'arabext',
});
const EMPTY_NOTIFICATIONS: InboxNotification[] = [];
const NotificationUnreadCountContext = createContext(0);

function isInboxNotification(value: unknown): value is InboxNotification {
    if (!value || typeof value !== 'object') return false;
    const notification = value as Partial<InboxNotification>;
    return Number.isSafeInteger(notification.id)
        && categories.some((category) => category.key === notification.category)
        && (notification.priority === 'normal'
            || notification.priority === 'important'
            || notification.priority === 'urgent')
        && typeof notification.title === 'string'
        && typeof notification.body === 'string'
        && (notification.event === null || typeof notification.event === 'string')
        && (notification.data === null
            || (typeof notification.data === 'object' && !Array.isArray(notification.data)))
        && (notification.read_at === null || typeof notification.read_at === 'string')
        && typeof notification.created_at === 'string';
}

function isNotificationPage(value: unknown): value is PaginatedResult<InboxNotification> {
    if (!value || typeof value !== 'object') return false;
    const page = value as Partial<PaginatedResult<InboxNotification>>;
    const meta = page.meta;
    return Array.isArray(page.data)
        && page.data.every(isInboxNotification)
        && Boolean(meta && Number.isSafeInteger(meta.current_page) && meta.current_page > 0)
        && Number.isSafeInteger(meta?.last_page) && (meta?.last_page ?? 0) > 0
        && Number.isSafeInteger(meta?.per_page) && (meta?.per_page ?? 0) > 0
        && Number.isSafeInteger(meta?.total) && (meta?.total ?? -1) >= 0;
}

function getNotificationPageCacheKey(filter: NotificationFilter, page: number): string {
    return JSON.stringify([filter, page]);
}

function getNotificationOfflineMarkerKey(userId: number, filter: NotificationFilter | 'counts'): string {
    return JSON.stringify([userId, filter]);
}

function updateCachedNotificationLists(
    queryClient: ReturnType<typeof useQueryClient>,
    userId: number,
    update: (notification: InboxNotification, filter: NotificationFilter) => InboxNotification | null,
): void {
    const cachedLists = queryClient.getQueriesData<NotificationInboxData>({
        queryKey: notificationQueryKeys.inboxPrefix(userId),
    });

    for (const [queryKey, cachedList] of cachedLists) {
        const filter = queryKey[2];
        const activeFilter = notificationFilters.find((item) => item.key === filter)?.key;
        if (!cachedList || !activeFilter) continue;

        let listChanged = false;
        const pages = cachedList.pages.map((page) => {
            let pageChanged = false;
            const data = page.data.flatMap((notification) => {
                const updated = update(notification, activeFilter);
                if (updated === notification) return [notification];
                pageChanged = true;
                return updated ? [updated] : [];
            });
            if (!pageChanged) return page;

            listChanged = true;
            const removedCount = page.data.length - data.length;
            return {
                ...page,
                data,
                meta: { ...page.meta, total: Math.max(0, page.meta.total - removedCount) },
            };
        });
        if (listChanged) queryClient.setQueryData<NotificationInboxData>(queryKey, { ...cachedList, pages });
    }
}

function notificationDayKey(value: string | Date): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return 'unknown';
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function notificationDayTitle(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'زمان نامشخص';
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (notificationDayKey(value) === notificationDayKey(today)) return 'امروز';
    if (notificationDayKey(value) === notificationDayKey(yesterday)) return 'دیروز';
    return notificationDateFormatter.format(date);
}

function notificationTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'زمان نامشخص';
    return notificationTimeFormatter.format(date);
}

type NotificationFilterTabProps = {
    filter: NotificationRoute;
    isActive: boolean;
    unreadCount?: number;
    theme: ReturnType<typeof useTheme>;
    onSelect: (key: string) => void;
    onTabLayout: (key: string, event: LayoutChangeEvent) => void;
};

const NotificationFilterTab = memo(function NotificationFilterTab({
    filter,
    isActive,
    unreadCount,
    theme,
    onSelect,
    onTabLayout,
}: NotificationFilterTabProps) {
    const [indicatorProgress] = useState(() => new Animated.Value(isActive ? 1 : 0));
    const handlePress = useCallback(() => onSelect(filter.key), [filter.key, onSelect]);
    const handleLayout = useCallback(
        (event: LayoutChangeEvent) => onTabLayout(filter.key, event),
        [filter.key, onTabLayout],
    );

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
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={filter.label}
            onPress={handlePress}
            onLayout={handleLayout}
            style={({ pressed }) => [
                styles.filterTab,
                { backgroundColor: pressed ? theme.surfaceVariant : theme.surface },
            ]}
        >
            <MaterialCommunityIcons
                name={filter.icon}
                size={17}
                color={isActive ? theme.primaryText : theme.textSecondary}
            />
            <ThemedText
                type={isActive ? 'smallBold' : 'small'}
                numberOfLines={1}
                style={{ color: isActive ? theme.primaryText : theme.textSecondary }}
            >
                {filter.label}
            </ThemedText>
            {filter.showUnreadCount ? (
                <View style={[styles.filterCount, { backgroundColor: isActive ? theme.primary : theme.backgroundElement }]}>
                    <ThemedText type="smallBold" style={{ color: isActive ? theme.onPrimary : theme.text }}>
                        {persianNumberFormatter.format(unreadCount ?? 0)}
                    </ThemedText>
                </View>
            ) : null}
            <Animated.View
                style={[
                    styles.filterTabIndicator,
                    {
                        backgroundColor: theme.primary,
                        opacity: indicatorProgress,
                        transform: [{ scaleX: indicatorProgress }],
                    },
                ]}
            />
        </Pressable>
    );
});

type NotificationFilterTabBarProps = SceneRendererProps & {
    navigationState: NavigationState<NotificationRoute>;
    theme: ReturnType<typeof useTheme>;
    unreadCount: number;
};

function NotificationFilterTabBar({ navigationState, jumpTo, theme, unreadCount }: NotificationFilterTabBarProps) {
    const scrollViewRef = useRef<ScrollViewInstance>(null);
    const tabLayouts = useRef<Record<string, { x: number; width: number }>>({});
    const [viewportWidth, setViewportWidth] = useState(0);
    const handleTabLayout = useCallback((key: string, event: LayoutChangeEvent) => {
        const { x, width } = event.nativeEvent.layout;
        tabLayouts.current[key] = { x, width };
    }, []);

    useEffect(() => {
        const activeRoute = navigationState.routes[navigationState.index];
        const layout = activeRoute ? tabLayouts.current[activeRoute.key] : undefined;
        if (!layout || viewportWidth <= 0) return;

        const targetOffset = Math.max(0, layout.x - (viewportWidth - layout.width) / 2);
        scrollViewRef.current?.scrollTo({ x: targetOffset, animated: true });
    }, [navigationState.index, navigationState.routes, viewportWidth]);

    return (
        <View
            accessibilityRole="tablist"
            style={[styles.filterTabBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}
        >
            <ScrollView
                ref={scrollViewRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterTabsContent}
                onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
            >
                {navigationState.routes.map((route, index) => (
                    <NotificationFilterTab
                        key={route.key}
                        filter={route}
                        isActive={navigationState.index === index}
                        unreadCount={route.showUnreadCount ? unreadCount : undefined}
                        theme={theme}
                        onSelect={jumpTo}
                        onTabLayout={handleTabLayout}
                    />
                ))}
            </ScrollView>
        </View>
    );
}

type NotificationFilterSceneProps = {
    filter: NotificationFilter;
    isActive: boolean;
    isScreenFocused: boolean;
    isOnline: boolean;
    offlineInboxMarked: boolean;
    offlineCountsMarked: boolean;
    userId: number | null;
    theme: ReturnType<typeof useTheme>;
    bottomInset: number;
    countsOfflineCacheSavedAt?: number;
    countsHasData: boolean;
    settingsVisible: boolean;
    visibleErrorMessage: string | null;
    undoBarVisible: boolean;
    undoBusy: boolean;
    deletingNotificationId: number | null;
    deletingReadNotifications: boolean;
    onRefreshCounts: () => Promise<unknown>;
    onLiveInboxRefresh: (filter: NotificationFilter) => void;
    onRetry: () => void;
    onOpenSettings: () => void;
    onOpenNotification: (item: InboxNotification) => void;
    onRequestDelete: (item: InboxNotification) => void;
};

type NotificationInboxHeadingProps = {
    settingsVisible: boolean;
    theme: ReturnType<typeof useTheme>;
    onOpenSettings: () => void;
};

const NotificationInboxHeading = memo(function NotificationInboxHeading({
    settingsVisible,
    theme,
    onOpenSettings,
}: NotificationInboxHeadingProps) {
    const unreadCount = useContext(NotificationUnreadCountContext);

    return (
        <View style={styles.timelineHeading}>
            <ThemedText type="bodyBold" style={{ color: theme.text }}>صندوق اعلان‌ها</ThemedText>
            <View style={styles.headerActions}>
                <View style={[styles.unreadCount, { backgroundColor: theme.primary }]}>
                    <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
                        {persianNumberFormatter.format(unreadCount)} خوانده‌نشده
                    </ThemedText>
                </View>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="تنظیمات اعلان‌ها"
                    accessibilityState={{ expanded: settingsVisible }}
                    onPress={onOpenSettings}
                    style={({ pressed }) => [
                        styles.settingsButton,
                        { backgroundColor: pressed ? theme.surfaceVariant : theme.surface, borderColor: theme.border },
                    ]}
                >
                    <MaterialCommunityIcons name="cog-outline" size={20} color={theme.textSecondary} />
                </Pressable>
            </View>
        </View>
    );
});

const NotificationFilterScene = memo(function NotificationFilterScene({
    filter,
    isActive,
    isScreenFocused,
    isOnline,
    offlineInboxMarked,
    offlineCountsMarked,
    userId,
    theme,
    bottomInset,
    countsOfflineCacheSavedAt,
    countsHasData,
    settingsVisible,
    visibleErrorMessage,
    undoBarVisible,
    undoBusy,
    deletingNotificationId,
    deletingReadNotifications,
    onRefreshCounts,
    onLiveInboxRefresh,
    onRetry,
    onOpenSettings,
    onOpenNotification,
    onRequestDelete,
}: NotificationFilterSceneProps) {
    const [expandedNotificationIds, setExpandedNotificationIds] = useState<Set<number>>(() => new Set());
    const isFetchingNextPageRef = useRef(false);
    const category = categories.find((item) => item.key === filter)?.key ?? null;
    const unreadOnly = filter === 'unread';
    const query = useInfiniteQuery({
        queryKey: notificationQueryKeys.inbox(userId ?? 0, filter),
        enabled: userId !== null && isActive && isScreenFocused,
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('برای مشاهدهٔ اعلان‌ها وارد حساب شوید.');
            if (userId === null) throw new Error('برای مشاهدهٔ اعلان‌ها وارد حساب شوید.');
            const result = await fetchWithOfflineFallback(
                userId,
                {
                    ...NOTIFICATION_OFFLINE_CACHE,
                    key: getNotificationPageCacheKey(filter, pageParam),
                },
                () => fetchNotificationInbox(token, {
                    page: pageParam,
                    category: category ?? undefined,
                    unreadOnly,
                }),
                isNotificationPage,
                { isOnline: onlineManager.isOnline() },
            );
            return withOfflineCacheMetadata(result);
        },
        getNextPageParam: (lastPage) => lastPage.meta.current_page < lastPage.meta.last_page
            ? lastPage.meta.current_page + 1
            : undefined,
        staleTime: CACHE_POLICY.query.resources.notificationInbox.staleTimeMs,
        retry: false,
        networkMode: 'always',
    });
    const items = useMemo(
        () => query.data?.pages.flatMap((page) => page.data) ?? EMPTY_NOTIFICATIONS,
        [query.data?.pages],
    );
    const notificationDayKeys = useMemo(
        () => items.map((item) => notificationDayKey(item.created_at)),
        [items],
    );
    const loading = userId !== null && query.isPending;
    const hasOfflineInboxData = query.data?.pages.some((page) => page.offlineCacheSavedAt !== undefined) ?? false;
    const hasOfflineNotificationData = hasOfflineInboxData
        || offlineInboxMarked
        || offlineCountsMarked
        || countsOfflineCacheSavedAt !== undefined
        || (!isOnline && (query.data !== undefined || countsHasData));
    const refetchInbox = query.refetch;
    useEffect(() => {
        if (!isOnline || !isActive || !isScreenFocused) return;
        if (!hasOfflineInboxData && !offlineInboxMarked) return;
        void refetchInbox().then((result) => {
            if (result.isSuccess && result.data.pages.every((page) => page.offlineCacheSavedAt === undefined)) {
                onLiveInboxRefresh(filter);
            }
        });
    }, [filter, hasOfflineInboxData, isActive, isOnline, isScreenFocused, offlineInboxMarked, onLiveInboxRefresh, refetchInbox]);
    useOfflinePageNotice(isScreenFocused && isActive && hasOfflineNotificationData ? {
        hasSavedData: true,
        message: 'اعلان‌های ذخیره‌شده ممکن است به‌روز نباشند.',
        details: [
            'اعلان‌های جدید پس از اتصال دوباره همگام می‌شوند.',
            'وضعیت خوانده‌شدن اعلان‌ها ممکن است تازه نباشد.',
        ],
    } : null, isScreenFocused && isActive);
    const queryError = query.error
        ? getUserFacingErrorMessage(query.error, 'دریافت اعلان‌ها ناموفق بود.')
        : null;
    const activeCategory = category ? categoriesByKey.get(category) : undefined;
    const toggleExpandedNotification = useCallback((notificationId: number) => {
        setExpandedNotificationIds((current) => {
            const next = new Set(current);
            if (next.has(notificationId)) {
                next.delete(notificationId);
            } else {
                next.add(notificationId);
            }
            return next;
        });
    }, []);

    return (
        <View style={styles.scene}>
            <View style={styles.headerContent}>
                <NotificationInboxHeading
                    settingsVisible={settingsVisible}
                    theme={theme}
                    onOpenSettings={onOpenSettings}
                />
                {visibleErrorMessage ? (
                    <ErrorNoticeCard message={visibleErrorMessage} onRetry={onRetry} />
                ) : null}
                {queryError && items.length > 0 ? (
                    <ErrorNoticeCard message={queryError} onRetry={() => void query.refetch()} />
                ) : null}
            </View>
            <FlatList
                data={items}
                keyExtractor={(item) => String(item.id)}
                initialNumToRender={8}
                maxToRenderPerBatch={8}
                windowSize={7}
                removeClippedSubviews={Platform.OS === 'android'}
                contentContainerStyle={[
                    styles.listContent,
                    { paddingBottom: bottomInset + Spacing.four + (undoBarVisible ? 88 : 0) },
                ]}
                onRefresh={() => {
                    void query.refetch().then((result) => {
                        if (result.isSuccess && result.data.pages.every((page) => page.offlineCacheSavedAt === undefined)) {
                            onLiveInboxRefresh(filter);
                        }
                    });
                    void onRefreshCounts();
                }}
                refreshing={query.isRefetching}
                onEndReached={() => {
                    if (!query.hasNextPage || query.isFetchingNextPage || isFetchingNextPageRef.current) return;
                    isFetchingNextPageRef.current = true;
                    void query.fetchNextPage().then(
                        () => { isFetchingNextPageRef.current = false; },
                        () => { isFetchingNextPageRef.current = false; },
                    );
                }}
                onEndReachedThreshold={0.4}
                ListEmptyComponent={loading ? (
                    <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <ActivityIndicator color={theme.primary} />
                        <ThemedText type="small" style={{ color: theme.textSecondary }}>در حال دریافت پیام‌ها…</ThemedText>
                    </View>
                ) : queryError ? (
                    <ErrorNoticeCard
                        title="دریافت اعلان‌ها انجام نشد"
                        message={queryError}
                        onRetry={() => void query.refetch()}
                    />
                ) : (
                    <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <View style={[styles.emptyIcon, { backgroundColor: theme.primary }]}>
                            <MaterialCommunityIcons name="bell-check-outline" size={31} color={theme.onPrimary} />
                        </View>
                        <ThemedText type="smallBold" style={{ color: theme.text }}>
                            {unreadOnly ? 'پیام خوانده‌نشده‌ای ندارید' : 'هنوز پیامی ندارید'}
                        </ThemedText>
                        <ThemedText type="small" style={{ color: theme.textSecondary, textAlign: 'center' }}>
                            {category
                                ? `در دستهٔ «${activeCategory?.label}» پیامی برای نمایش نیست.`
                                : 'اعلان‌های حساب و خدمات برنامه در اینجا نمایش داده می‌شوند.'}
                        </ThemedText>
                    </View>
                )}
                ListFooterComponent={query.isFetchingNextPage
                    ? <ActivityIndicator color={theme.primary} style={styles.footerLoader} />
                    : undefined}
                renderItem={({ item, index }) => {
                    const selectedCategory = categoriesByKey.get(item.category);
                    const nextItem = items[index + 1];
                    const itemDayKey = notificationDayKeys[index];
                    const startsDay = index === 0 || notificationDayKeys[index - 1] !== itemDayKey;
                    const endsDay = !nextItem || notificationDayKeys[index + 1] !== itemDayKey;
                    const hasLongBody = item.body.length > LONG_NOTIFICATION_BODY_LENGTH;
                    const isBodyExpanded = expandedNotificationIds.has(item.id);

                    return (
                        <>
                            {startsDay ? (
                                <View style={styles.dayHeading}>
                                    <View style={[styles.dayRule, { backgroundColor: theme.border }]} />
                                    <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>
                                        {notificationDayTitle(item.created_at)}
                                    </ThemedText>
                                    <View style={[styles.dayRule, { backgroundColor: theme.border }]} />
                                </View>
                            ) : null}
                            <View
                                style={[
                                    styles.timelineItem,
                                    { backgroundColor: theme.surface },
                                ]}
                            >
                                <View style={styles.timelineRail}>
                                    <View style={[styles.categoryIcon, { backgroundColor: item.read_at ? theme.surfaceVariant : theme.primary }]}>
                                        <MaterialCommunityIcons
                                            name={selectedCategory?.icon ?? 'bell-outline'}
                                            size={19}
                                            color={item.read_at ? theme.textSecondary : theme.onPrimary}
                                        />
                                    </View>
                                    {!endsDay ? <View style={[styles.timelineConnector, { backgroundColor: theme.border }]} /> : null}
                                </View>
                                <View style={styles.timelineBody}>
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={`${item.title}، ${item.read_at ? 'خوانده‌شده' : 'خوانده‌نشده'}${item.priority !== 'normal' ? `، ${priorityLabels[item.priority]}` : ''}`}
                                        accessibilityHint={item.read_at ? undefined : 'برای ثبت به‌عنوان خوانده‌شده لمس کنید.'}
                                        disabled={Boolean(item.read_at) || !isOnline}
                                        onPress={() => onOpenNotification(item)}
                                        style={({ pressed }) => [
                                            styles.notificationContent,
                                            { opacity: pressed && !item.read_at ? 0.76 : 1 },
                                        ]}
                                    >
                                        <View style={styles.cardHeader}>
                                            <View style={[styles.categoryPill, { backgroundColor: theme.surfaceVariant }]}>
                                                <ThemedText type="small" numberOfLines={1} style={{ color: theme.textSecondary }}>
                                                    {selectedCategory?.label ?? 'خدمات سامانه'}
                                                </ThemedText>
                                            </View>
                                            <View style={[styles.metaDot, { backgroundColor: theme.textMuted }]} />
                                            <ThemedText type="small" style={{ color: theme.textMuted }}>
                                                {notificationTime(item.created_at)}
                                            </ThemedText>
                                            {item.priority !== 'normal' ? (
                                                <View style={[
                                                    styles.priorityMetaPill,
                                                    { backgroundColor: item.priority === 'urgent' ? theme.errorFill : theme.warningFill },
                                                ]}>
                                                    <ThemedText
                                                        type="smallBold"
                                                        style={{ color: item.priority === 'urgent' ? theme.onErrorFill : theme.onWarning }}
                                                    >
                                                        {priorityLabels[item.priority]}
                                                    </ThemedText>
                                                </View>
                                            ) : null}
                                            {!item.read_at ? (
                                                <View style={[styles.unreadStatus, { backgroundColor: theme.primaryContainer }]}>
                                                    <ThemedText type="smallBold" style={{ color: theme.primaryText }}>
                                                        خوانده‌نشده
                                                    </ThemedText>
                                                </View>
                                            ) : null}
                                        </View>
                                        <ThemedText type="smallBold" style={{ color: theme.text }}>{item.title}</ThemedText>
                                        <ThemedText
                                            type="small"
                                            numberOfLines={hasLongBody && !isBodyExpanded ? NOTIFICATION_BODY_PREVIEW_LINES : undefined}
                                            style={[styles.bodyText, { color: theme.textSecondary }]}
                                        >
                                            {item.body}
                                        </ThemedText>
                                    </Pressable>
                                    <View style={styles.cardFooter}>
                                        <View style={styles.cardFooterActions}>
                                            {hasLongBody ? (
                                                <Pressable
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`${isBodyExpanded ? 'جمع‌کردن متن' : 'نمایش متن کامل'} اعلان ${item.title}`}
                                                    accessibilityState={{ expanded: isBodyExpanded }}
                                                    onPress={() => toggleExpandedNotification(item.id)}
                                                    style={({ pressed }) => [
                                                        styles.detailsLink,
                                                        { opacity: pressed ? 0.65 : 1 },
                                                    ]}
                                                >
                                                    <ThemedText type="smallBold" style={{ color: theme.primaryText }}>
                                                        {isBodyExpanded ? 'نمایش کمتر' : 'نمایش متن کامل'}
                                                    </ThemedText>
                                                </Pressable>
                                            ) : null}
                                        </View>
                                        <Pressable
                                            accessibilityRole="button"
                                            accessibilityLabel={`حذف اعلان ${item.title}`}
                                            disabled={!isOnline || deletingNotificationId !== null || deletingReadNotifications || undoBusy}
                                            accessibilityState={{ disabled: !isOnline || deletingNotificationId !== null || deletingReadNotifications || undoBusy }}
                                            onPress={() => onRequestDelete(item)}
                                            style={({ pressed }) => [
                                                styles.deleteButton,
                                                { backgroundColor: pressed ? theme.errorFill : theme.surfaceVariant },
                                                { opacity: !isOnline || deletingNotificationId !== null || deletingReadNotifications || undoBusy ? 0.55 : 1 },
                                            ]}
                                        >
                                            {deletingNotificationId === item.id
                                                ? <ActivityIndicator size="small" color={theme.error} />
                                                : <MaterialCommunityIcons name="delete-outline" size={18} color={theme.error} />}
                                        </Pressable>
                                    </View>
                                </View>
                            </View>
                            {!endsDay ? (
                                <View style={[styles.notificationSeparator, { backgroundColor: theme.border }]} />
                            ) : null}
                        </>
                    );
                }}
            />
        </View>
    );
});

type NotificationUndoBarProps = {
    pendingCount: number;
    expiresAt: number;
    busy: boolean;
    isOnline: boolean;
    isScreenFocused: boolean;
    theme: ReturnType<typeof useTheme>;
    onUndo: () => void;
};

const NotificationUndoBar = memo(function NotificationUndoBar({
    pendingCount,
    expiresAt,
    busy,
    isOnline,
    isScreenFocused,
    theme,
    onUndo,
}: NotificationUndoBarProps) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!isScreenFocused) return;

        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [isScreenFocused]);

    const countdown = formatUndoCountdown(expiresAt - now);

    return (
        <View
            accessibilityLabel={`حذف ${pendingCount} اعلان. فرصت بازگردانی ${countdown}`}
            style={[
                styles.undoBar,
                {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    bottom: Spacing.two,
                },
            ]}
        >
            <View style={[styles.undoIcon, { backgroundColor: theme.surfaceVariant }]}>
                <MaterialCommunityIcons name="delete-restore" size={20} color={theme.primaryText} />
            </View>
            <View style={styles.undoCopy}>
                <ThemedText type="smallBold" style={{ color: theme.text }}>
                    {pendingCount === 1 ? 'اعلان حذف شد' : `${persianNumberFormatter.format(pendingCount)} اعلان حذف شد`}
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                    فرصت بازگردانی: {countdown}
                </ThemedText>
            </View>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={`بازگردانی ${pendingCount} اعلان`}
                accessibilityState={{ disabled: busy || !isOnline }}
                disabled={busy || !isOnline}
                onPress={onUndo}
                style={({ pressed }) => [
                    styles.undoButton,
                    {
                        backgroundColor: theme.primary,
                        opacity: busy || !isOnline ? 0.65 : pressed ? 0.8 : 1,
                    },
                ]}
            >
                {busy
                    ? <ActivityIndicator size="small" color={theme.onPrimary} />
                    : <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>بازگردانی</ThemedText>}
            </Pressable>
        </View>
    );
});

export default function NotificationsScreen() {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const isScreenFocused = useIsFocused();
    const isOnline = useOnlineStatus();
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const { showError } = useAppFeedback();
    const userId = user?.id ?? null;
    const securityRestricted = user?.restricted_capabilities?.includes('security') ?? false;
    const [activeFilter, setActiveFilter] = useState<NotificationFilter>('all');
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [deleteReadConfirmationVisible, setDeleteReadConfirmationVisible] = useState(false);
    const [notificationToDelete, setNotificationToDelete] = useState<InboxNotification | null>(null);
    const [markingAll, setMarkingAll] = useState(false);
    const [pushEnabled, setPushEnabled] = useState(false);
    const [pushBusy, setPushBusy] = useState(false);
    const [pushStatusLoading, setPushStatusLoading] = useState(true);
    const [pushStatusUnavailable, setPushStatusUnavailable] = useState(false);
    const [pushMessage, setPushMessage] = useState<string | null>(null);
    const [pushMessageKind, setPushMessageKind] = useState<'success' | 'error'>('success');
    const [undoOperations, setUndoOperations] = useState<PendingNotificationUndo[]>([]);
    const [deletingNotificationId, setDeletingNotificationId] = useState<number | null>(null);
    const [deletingReadNotifications, setDeletingReadNotifications] = useState(false);
    const [undoBusy, setUndoBusy] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [offlineNotificationDataKeys, setOfflineNotificationDataKeys] = useState<Set<string>>(() => new Set());
    const hasInitializedNotificationFocus = useRef(false);
    const undoBusyRef = useRef(false);

    const countsQuery = useQuery({
        queryKey: notificationQueryKeys.counts(userId ?? 0),
        enabled: userId !== null && isScreenFocused,
        queryFn: async () => {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('برای مشاهدهٔ اعلان‌ها وارد حساب شوید.');
            if (userId === null) throw new Error('برای مشاهدهٔ اعلان‌ها وارد حساب شوید.');
            const result = await fetchWithOfflineFallback(
                userId,
                {
                    ...NOTIFICATION_OFFLINE_CACHE,
                    key: 'counts',
                },
                () => fetchNotificationCounts(token),
                isNotificationCountsCacheValue,
                { isOnline: onlineManager.isOnline() },
            );
            return withOfflineCacheMetadata(result);
        },
        staleTime: CACHE_POLICY.query.resources.notificationCounts.staleTimeMs,
        retry: false,
        networkMode: 'always',
    });

    const unreadCount = countsQuery.data?.unread_count ?? 0;
    const readCount = countsQuery.data?.read_count ?? 0;
    const countsMarkedOffline = userId !== null && offlineNotificationDataKeys.has(
        getNotificationOfflineMarkerKey(userId, 'counts'),
    );
    const refetchCounts = countsQuery.refetch;
    const clearOfflineNotificationMarker = useCallback((filter: NotificationFilter | 'counts') => {
        if (userId === null) return;
        const markerKey = getNotificationOfflineMarkerKey(userId, filter);
        setOfflineNotificationDataKeys((current) => {
            if (!current.has(markerKey)) return current;
            const next = new Set(current);
            next.delete(markerKey);
            return next;
        });
    }, [userId]);
    const refreshCounts = useCallback(async () => {
        const result = await refetchCounts();
        if (result.isSuccess && result.data.offlineCacheSavedAt === undefined) {
            clearOfflineNotificationMarker('counts');
        }
        return result;
    }, [clearOfflineNotificationMarker, refetchCounts]);
    const notificationQueryError = countsQuery.error
        ? getUserFacingErrorMessage(countsQuery.error, 'دریافت شمارندهٔ اعلان‌ها ناموفق بود.')
        : null;
    const visibleErrorMessage = errorMessage ?? notificationQueryError;
    const loadNotifications = useCallback(() => {
        if (userId === null) return;
        void Promise.all([
            queryClient.invalidateQueries({
                queryKey: notificationQueryKeys.inboxPrefix(userId),
            }),
            queryClient.invalidateQueries({
                queryKey: notificationQueryKeys.counts(userId),
            }),
        ]);
    }, [queryClient, userId]);
    useEffect(() => {
        if (userId === null) return;

        const markCachedNotificationDataOffline = () => {
            if (onlineManager.isOnline()) return;
            const markers = new Set<string>();
            for (const [queryKey, data] of queryClient.getQueriesData<NotificationInboxData>({
                queryKey: notificationQueryKeys.inboxPrefix(userId),
            })) {
                const filter = queryKey[2];
                const matchedFilter = notificationFilters.find((item) => item.key === filter)?.key;
                if (!data?.pages.length || !matchedFilter) continue;
                markers.add(getNotificationOfflineMarkerKey(userId, matchedFilter));
            }

            if (queryClient.getQueryData(notificationQueryKeys.counts(userId)) !== undefined) {
                markers.add(getNotificationOfflineMarkerKey(userId, 'counts'));
            }
            if (markers.size === 0) return;
            setOfflineNotificationDataKeys((current) => {
                if ([...markers].every((marker) => current.has(marker))) return current;
                return new Set([...current, ...markers]);
            });
        };
        markCachedNotificationDataOffline();
        const unsubscribeOnline = onlineManager.subscribe(markCachedNotificationDataOffline);
        return () => {
            unsubscribeOnline();
        };
    }, [queryClient, userId]);
    const invalidateNotificationQueries = useCallback(() => {
        if (userId === null) return;
        void clearOfflineCacheNamespace(userId, NOTIFICATION_OFFLINE_CACHE.namespace)
            .catch((error: unknown) => {
                console.error('پاک‌کردن کش آفلاین اعلان‌ها ناموفق بود.', error);
            })
            .finally(() => Promise.all([
                queryClient.invalidateQueries({ queryKey: notificationQueryKeys.inboxPrefix(userId) }),
                queryClient.invalidateQueries({ queryKey: notificationQueryKeys.counts(userId) }),
            ]));
    }, [queryClient, userId]);

    const updateCachedCounts = useCallback((update: (counts: NotificationCounts) => NotificationCounts) => {
        if (userId === null) return;
        queryClient.setQueryData<NotificationCounts>(
            notificationQueryKeys.counts(userId),
            (current) => current ? update(current) : current,
        );
    }, [queryClient, userId]);

    useFocusEffect(useCallback(() => {
        if (userId === null) return;
        if (!hasInitializedNotificationFocus.current) {
            hasInitializedNotificationFocus.current = true;
            return;
        }
        if (!isOnline) return;

        void queryClient.refetchQueries({
            queryKey: notificationQueryKeys.inboxPrefix(userId),
            stale: true,
            type: 'active',
        });
        const counts = queryClient.getQueryData<OfflineAware<NotificationCounts>>(
            notificationQueryKeys.counts(userId),
        );
        if (
            counts?.offlineCacheSavedAt !== undefined
            || countsMarkedOffline
        ) {
            void refreshCounts();
        } else {
            void queryClient.refetchQueries({
                queryKey: notificationQueryKeys.counts(userId),
                stale: true,
                type: 'active',
            });
        }
    }, [countsMarkedOffline, isOnline, queryClient, refreshCounts, userId]));

    useFocusEffect(useCallback(() => {
        if (!settingsVisible) return;

        let isMounted = true;

        const loadPushStatus = async () => {
            if (!user) {
                setPushEnabled(false);
                setPushStatusLoading(false);
                return;
            }
            if (!isOnline) {
                setPushStatusUnavailable(true);
                setPushStatusLoading(false);
                return;
            }

            setPushStatusLoading(true);
            try {
                const token = await getStoredAuthToken();
                if (!token) throw new Error('نشست کاربری برای بررسی وضعیت اعلان‌ها در دسترس نیست.');
                const enabled = await fetchPushSubscriptionStatus(token);
                if (isMounted) setPushStatusUnavailable(false);
                if (isExpoGo) {
                    if (isMounted) setPushEnabled(enabled);
                    return;
                }

                const Notifications = await import('expo-notifications');
                const permission = await Notifications.getPermissionsAsync();
                if (isMounted) setPushEnabled(enabled && permission.status === 'granted');
            } catch (error) {
                if (isMounted) {
                    setPushStatusUnavailable(true);
                    showError(error, 'وضعیت اعلان‌ها دریافت نشد.');
                }
            } finally {
                if (isMounted) setPushStatusLoading(false);
            }
        };

        void loadPushStatus();
        return () => {
            isMounted = false;
        };
    }, [isOnline, settingsVisible, showError, user]));

    const togglePushNotifications = async () => {
        if (pushBusy || !isOnline) return;
        setPushBusy(true);
        try {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('برای مدیریت اعلان‌ها ابتدا دوباره وارد حساب شوید.');

            if (pushEnabled) {
                await removePushSubscription(token);
                setPushEnabled(false);
                setPushMessage('اعلان‌ها برای این دستگاه خاموش شدند.');
                setPushMessageKind('success');
                return;
            }

            if (isExpoGo) {
                throw new Error('برای فعال‌سازی اعلان‌های راه‌دور، برنامه را با development build اجرا کنید؛ Expo Go در اندروید از این قابلیت پشتیبانی نمی‌کند.');
            }
            if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
                throw new Error('اعلان‌های موبایل در نسخهٔ وب در دسترس نیستند.');
            }
            if (!Device.isDevice) {
                throw new Error('برای فعال‌سازی اعلان‌ها از دستگاه واقعی استفاده کنید.');
            }

            const Notifications = await import('expo-notifications');
            let permission = await Notifications.getPermissionsAsync();
            if (permission.status !== 'granted') {
                permission = await Notifications.requestPermissionsAsync();
            }
            if (permission.status !== 'granted') {
                throw new Error('مجوز اعلان داده نشد. می‌توانید آن را از تنظیمات دستگاه فعال کنید.');
            }

            if (Platform.OS === 'android') {
                await Notifications.setNotificationChannelAsync('default', {
                    name: 'اعلان‌های پهناورکار',
                    importance: Notifications.AndroidImportance.DEFAULT,
                });
            }

            const projectId = Constants.expoConfig?.extra?.eas?.projectId;
            if (!projectId) throw new Error('شناسهٔ پروژهٔ Expo تنظیم نشده است.');
            const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
            await savePushSubscription(token, pushToken, Platform.OS);
            setPushEnabled(true);
            setPushMessage('اعلان‌ها برای این دستگاه فعال شدند.');
            setPushMessageKind('success');
        } catch (error) {
            showError(error, 'تغییر تنظیم اعلان‌ها ناموفق بود.');
        } finally {
            setPushBusy(false);
            setSettingsVisible(false);
        }
    };

    const deleteOne = async (item: InboxNotification) => {
        if (!isOnline || !user || deletingNotificationId !== null || undoBusy) return;
        setDeletingNotificationId(item.id);
        try {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('برای حذف اعلان ابتدا دوباره وارد حساب شوید.');
            const result = await deleteNotification(token, item.id);
            updateCachedNotificationLists(queryClient, user.id, (notification) =>
                notification.id === item.id ? null : notification,
            );
            updateCachedCounts((current) => item.read_at
                ? { ...current, read_count: Math.max(0, current.read_count - result.deleted_count) }
                : { ...current, unread_count: Math.max(0, current.unread_count - result.deleted_count) });
            invalidateNotificationQueries();
            if (result.undo_token && result.undo_expires_at) {
                const expiresAt = Date.parse(result.undo_expires_at);
                if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
                    const undoToken = result.undo_token;
                    setUndoOperations((current) => [
                        ...current.filter((operation) => operation.token !== undoToken),
                        { token: undoToken, deletedCount: result.deleted_count, expiresAt, userId: user.id },
                    ]);
                    setPushMessage(null);
                } else {
                    setPushMessage('اعلان حذف شد، اما زمان بازگردانی از سرور معتبر نبود.');
                    setPushMessageKind('error');
                }
            } else {
                setPushMessage('اعلان حذف شد، اما امکان بازگردانی از سرور دریافت نشد.');
                setPushMessageKind('error');
            }
        } catch (error) {
            showError(error, 'حذف اعلان انجام نشد.');
        } finally {
            setDeletingNotificationId(null);
        }
    };

    const deleteAllRead = async () => {
        if (!isOnline || !user || deletingReadNotifications || readCount === 0) return;
        setSettingsVisible(false);
        setDeleteReadConfirmationVisible(true);
    };

    const performDeleteAllRead = async () => {
        if (!isOnline || !user || deletingReadNotifications || readCount === 0 || undoBusy) return;
        setDeletingReadNotifications(true);
        try {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('برای حذف اعلان‌ها ابتدا دوباره وارد حساب شوید.');
            const result = await deleteReadNotifications(token);
            updateCachedNotificationLists(queryClient, user.id, (notification) =>
                notification.read_at === null ? notification : null,
            );
            updateCachedCounts((current) => ({
                ...current,
                read_count: Math.max(0, current.read_count - result.deleted_count),
            }));
            invalidateNotificationQueries();
            if (result.undo_token && result.undo_expires_at && result.deleted_count > 0) {
                const expiresAt = Date.parse(result.undo_expires_at);
                if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
                    const undoToken = result.undo_token;
                    setUndoOperations((current) => [
                        ...current.filter((operation) => operation.token !== undoToken),
                        { token: undoToken, deletedCount: result.deleted_count, expiresAt, userId: user.id },
                    ]);
                    setPushMessage(null);
                } else {
                    setPushMessage('اعلان‌ها حذف شدند، اما زمان بازگردانی از سرور معتبر نبود.');
                    setPushMessageKind('error');
                }
            } else if (result.deleted_count === 0) {
                setPushMessage('اعلان خوانده‌شده‌ای برای حذف وجود ندارد.');
                setPushMessageKind('success');
            } else {
                setPushMessage('اعلان‌ها حذف شدند، اما امکان بازگردانی از سرور دریافت نشد.');
                setPushMessageKind('error');
            }
        } catch (error) {
            showError(error, 'حذف اعلان‌های خوانده‌شده انجام نشد.');
        } finally {
            setDeletingReadNotifications(false);
        }
    };

    const undoDelete = useCallback(async () => {
        const activeOperations = undoOperations.filter((operation) => operation.userId === user?.id);
        if (!isOnline || !user || activeOperations.length === 0 || undoBusyRef.current) return;
        undoBusyRef.current = true;
        setUndoBusy(true);
        const pending = activeOperations;
        const remaining: PendingNotificationUndo[] = [];
        let restoredCount = 0;
        let restoreError: unknown = null;
        try {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('برای بازگردانی اعلان ابتدا دوباره وارد حساب شوید.');
            for (const operation of pending) {
                if (operation.expiresAt <= Date.now()) continue;
                try {
                    restoredCount += await restoreDeletedNotifications(token, operation.token);
                } catch (error) {
                    if (operation.expiresAt > Date.now()) remaining.push(operation);
                    restoreError ??= error;
                }
            }
            setUndoOperations((current) => [
                ...current.filter((operation) => operation.userId !== user.id),
                ...remaining,
            ]);
            if (restoredCount > 0) invalidateNotificationQueries();
            if (remaining.length > 0 && restoreError) {
                showError(restoreError, 'بازگردانی بخشی از اعلان‌ها ناموفق بود. دوباره تلاش کنید.');
            } else if (restoredCount > 0) {
                setPushMessage(`${persianNumberFormatter.format(restoredCount)} اعلان بازگردانی شد.`);
                setPushMessageKind('success');
            } else {
                setPushMessage('مهلت بازگردانی به پایان رسیده است.');
                setPushMessageKind('error');
            }
        } catch (error) {
            showError(error, 'بازگردانی اعلان انجام نشد.');
        } finally {
            undoBusyRef.current = false;
            setUndoBusy(false);
        }
    }, [invalidateNotificationQueries, isOnline, showError, undoOperations, user]);

    const markAllRead = async () => {
        if (!isOnline || !user || markingAll || unreadCount === 0) return;
        setMarkingAll(true);
        try {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('برای مدیریت اعلان‌ها وارد حساب شوید.');
            await markAllNotificationsRead(token);
            const readAt = new Date().toISOString();
            updateCachedNotificationLists(queryClient, user.id, (item, filter) => {
                if (filter === 'unread') return null;
                return item.read_at ? item : { ...item, read_at: readAt };
            });
            updateCachedCounts((current) => ({
                unread_count: 0,
                read_count: current.read_count + current.unread_count,
            }));
            invalidateNotificationQueries();
        } catch (error) {
            setErrorMessage(getUserFacingErrorMessage(error, 'خوانده‌شدن همهٔ اعلان‌ها ثبت نشد.'));
        } finally {
            setMarkingAll(false);
            setSettingsVisible(false);
        }
    };

    const openNotification = useCallback(async (item: InboxNotification) => {
        if (!isOnline || !user) return;
        if (!item.read_at) {
            try {
                const token = await getStoredAuthToken();
                if (!token) throw new Error('برای مدیریت اعلان‌ها وارد حساب شوید.');
                await markNotificationRead(token, item.id);
                const readAt = new Date().toISOString();
                updateCachedNotificationLists(queryClient, user.id, (notification, filter) => {
                    if (notification.id !== item.id) return notification;
                    return filter === 'unread' ? null : { ...notification, read_at: readAt };
                });
                updateCachedCounts((current) => ({
                    unread_count: Math.max(0, current.unread_count - 1),
                    read_count: current.read_count + 1,
                }));
                invalidateNotificationQueries();
            } catch (error) {
                setErrorMessage(getUserFacingErrorMessage(error, 'وضعیت اعلان به‌روزرسانی نشد.'));
                return;
            }
        }

    }, [invalidateNotificationQueries, isOnline, queryClient, updateCachedCounts, user]);

    const openSettings = useCallback(() => setSettingsVisible(true), []);
    const handleOpenNotification = useCallback(
        (item: InboxNotification) => void openNotification(item),
        [openNotification],
    );

    const activeUndoOperations = undoOperations.filter((operation) => operation.userId === userId);
    const pendingUndoCount = activeUndoOperations.reduce((count, operation) => count + operation.deletedCount, 0);
    const nextUndoExpiry = activeUndoOperations.reduce(
        (earliest, operation) => Math.min(earliest, operation.expiresAt),
        Number.POSITIVE_INFINITY,
    );
    useEffect(() => {
        if (!Number.isFinite(nextUndoExpiry)) return;

        const timeout = setTimeout(() => {
            const now = Date.now();
            setUndoOperations((current) => current.filter((operation) => operation.expiresAt > now));
        }, Math.max(0, nextUndoExpiry - Date.now()));

        return () => clearTimeout(timeout);
    }, [nextUndoExpiry]);

    return (
        <ThemedView style={styles.container}>
            <NotificationUnreadCountContext.Provider value={unreadCount}>
                <TabView
                    navigationState={{
                        index: Math.max(0, notificationFilters.findIndex((filter) => filter.key === activeFilter)),
                        routes: NOTIFICATION_ROUTES,
                    }}
                    onIndexChange={(index) => {
                        const filter = notificationFilters[index];
                        if (filter) setActiveFilter(filter.key);
                    }}
                    renderScene={({ route }) => (
                        <NotificationFilterScene
                            filter={route.key}
                            isActive={route.key === activeFilter}
                            isScreenFocused={isScreenFocused}
                            isOnline={isOnline}
                            offlineInboxMarked={userId !== null && offlineNotificationDataKeys.has(
                                getNotificationOfflineMarkerKey(userId, route.key),
                            )}
                            offlineCountsMarked={userId !== null && offlineNotificationDataKeys.has(
                                getNotificationOfflineMarkerKey(userId, 'counts'),
                            )}
                            userId={user?.id ?? null}
                            theme={theme}
                            bottomInset={insets.bottom}
                            countsOfflineCacheSavedAt={countsQuery.data?.offlineCacheSavedAt}
                            countsHasData={countsQuery.data !== undefined}
                            settingsVisible={settingsVisible}
                            visibleErrorMessage={visibleErrorMessage}
                            undoBarVisible={activeUndoOperations.length > 0}
                            undoBusy={undoBusy}
                            deletingNotificationId={deletingNotificationId}
                            deletingReadNotifications={deletingReadNotifications}
                            onRefreshCounts={refreshCounts}
                            onLiveInboxRefresh={clearOfflineNotificationMarker}
                            onRetry={loadNotifications}
                            onOpenSettings={openSettings}
                            onOpenNotification={handleOpenNotification}
                            onRequestDelete={setNotificationToDelete}
                        />
                    )}
                    renderTabBar={(props) => (
                        <NotificationFilterTabBar {...props} theme={theme} unreadCount={unreadCount} />
                    )}
                    lazy
                    lazyPreloadDistance={1}
                    direction="rtl"
                    swipeEnabled
                    animationEnabled={false}
                    initialLayout={{ width }}
                    style={styles.tabView}
                />
            </NotificationUnreadCountContext.Provider>

            {activeUndoOperations.length > 0 ? (
                <NotificationUndoBar
                    pendingCount={pendingUndoCount}
                    expiresAt={nextUndoExpiry}
                    busy={undoBusy}
                    isOnline={isOnline}
                    isScreenFocused={isScreenFocused}
                    theme={theme}
                    onUndo={undoDelete}
                />
            ) : null}

            <Modal
                visible={settingsVisible}
                transparent
                animationType="slide"
                onRequestClose={() => setSettingsVisible(false)}
            >
                <View style={styles.modalRoot}>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="بستن تنظیمات اعلان‌ها"
                        onPress={() => setSettingsVisible(false)}
                        style={[styles.modalBackdrop, { backgroundColor: theme.overlay }]}
                    />
                    <View style={[styles.settingsSheet, { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.three }]}>
                        <View style={[styles.sheetHandle, { backgroundColor: theme.borderStrong }]} />
                        <View style={styles.sheetHeading}>
                            <View>
                                <ThemedText type="bodyBold" style={{ color: theme.text }}>تنظیمات اعلان‌ها</ThemedText>
                                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                    مدیریت دریافت و پاک‌سازی اعلان‌ها
                                </ThemedText>
                            </View>
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="بستن"
                                onPress={() => setSettingsVisible(false)}
                                style={[styles.closeButton, { backgroundColor: theme.surfaceVariant }]}
                            >
                                <MaterialCommunityIcons name="close" size={20} color={theme.textSecondary} />
                            </Pressable>
                        </View>

                        <ScrollView
                            style={styles.settingsOptions}
                            contentContainerStyle={styles.settingsOptionList}
                            showsVerticalScrollIndicator={false}
                        >
                            {!isOnline ? (
                                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                    برای تغییر وضعیت، حذف یا مدیریت اعلان‌ها به اتصال سرور نیاز است.
                                </ThemedText>
                            ) : null}
                            <View style={[styles.pushCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                <View style={[styles.pushIcon, { backgroundColor: pushEnabled ? theme.successFill : theme.surfaceVariant }]}>
                                    <MaterialCommunityIcons
                                        name={pushEnabled ? 'bell-ring-outline' : 'bell-off-outline'}
                                        size={18}
                                        color={pushEnabled ? theme.onSuccess : theme.textSecondary}
                                    />
                                </View>
                                <View style={styles.pushCopy}>
                                    <ThemedText type="smallBold" style={{ color: theme.text }}>اعلان‌های این دستگاه</ThemedText>
                                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                        {pushStatusLoading
                                            ? 'در حال بررسی وضعیت…'
                                            : pushStatusUnavailable ? 'وضعیت نامشخص' : pushEnabled ? 'روشن' : 'خاموش'}
                                    </ThemedText>
                                </View>
                                <Pressable
                                    accessibilityRole="switch"
                                    accessibilityLabel="اعلان‌های این دستگاه"
                                    accessibilityState={{
                                        disabled: !isOnline || pushBusy || pushStatusLoading || pushStatusUnavailable || (securityRestricted && !pushEnabled) || (isExpoGo && !pushEnabled),
                                        checked: pushEnabled,
                                    }}
                                    disabled={!isOnline || pushBusy || pushStatusLoading || pushStatusUnavailable || (securityRestricted && !pushEnabled) || (isExpoGo && !pushEnabled)}
                                    onPress={() => void togglePushNotifications()}
                                    style={({ pressed }) => [
                                        styles.pushToggle,
                                        {
                                            backgroundColor: pushEnabled ? theme.surfaceVariant : theme.primary,
                                            borderColor: pushEnabled ? theme.border : theme.primary,
                                            opacity: pressed || !isOnline || pushBusy || pushStatusLoading || pushStatusUnavailable ? 0.7 : 1,
                                        },
                                    ]}
                                >
                                    {pushBusy ? (
                                        <ActivityIndicator size="small" color={pushEnabled ? theme.text : theme.onPrimary} />
                                    ) : (
                                        <ThemedText type="smallBold" style={{ color: pushEnabled ? theme.text : theme.onPrimary }}>
                                            {pushEnabled ? 'خاموش' : 'فعال‌سازی'}
                                        </ThemedText>
                                    )}
                                </Pressable>
                            </View>
                            {securityRestricted && !pushEnabled ? (
                                <ThemedText type="small" style={{ color: theme.warning }}>
                                    به‌دلیل محدودیت امنیت حساب، فعال‌سازی اعلان روی این دستگاه موقتاً غیرفعال است.
                                </ThemedText>
                            ) : null}
                            {isExpoGo && !pushEnabled ? (
                                <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                    فعال‌سازی اعلان‌های راه‌دور به development build نیاز دارد؛ Expo Go در اندروید از این قابلیت پشتیبانی نمی‌کند.
                                </ThemedText>
                            ) : null}

                            {unreadCount > 0 ? (
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel="علامت‌گذاری همه به‌عنوان خوانده‌شده"
                                    disabled={!isOnline || markingAll}
                                    onPress={() => void markAllRead()}
                                    style={({ pressed }) => [
                                        styles.settingsAction,
                                        { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed || !isOnline || markingAll ? 0.65 : 1 },
                                    ]}
                                >
                                    {markingAll
                                        ? <ActivityIndicator size="small" color={theme.primaryText} />
                                        : <MaterialCommunityIcons name="email-open-outline" size={20} color={theme.primaryText} />}
                                    <View style={styles.settingsActionCopy}>
                                        <ThemedText type="smallBold" style={{ color: theme.text }}>علامت‌گذاری همه به‌عنوان خوانده‌شده</ThemedText>
                                        <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                            {persianNumberFormatter.format(unreadCount)} اعلان خوانده‌نشده
                                        </ThemedText>
                                    </View>
                                </Pressable>
                            ) : null}
                            {readCount > 0 ? (
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`پاک‌کردن همهٔ اعلان‌های خوانده‌شده، ${readCount} اعلان`}
                                    disabled={!isOnline || deletingReadNotifications || deletingNotificationId !== null || undoBusy}
                                    onPress={() => void deleteAllRead()}
                                    style={({ pressed }) => [
                                        styles.settingsAction,
                                        {
                                            backgroundColor: theme.surface,
                                            borderColor: theme.border,
                                            opacity: pressed || !isOnline || deletingReadNotifications || deletingNotificationId !== null || undoBusy ? 0.65 : 1,
                                        },
                                    ]}
                                >
                                    {deletingReadNotifications
                                        ? <ActivityIndicator size="small" color={theme.error} />
                                        : <MaterialCommunityIcons name="delete-sweep-outline" size={20} color={theme.error} />}
                                    <View style={styles.settingsActionCopy}>
                                        <ThemedText type="smallBold" style={{ color: theme.error }}>پاک‌کردن اعلان‌های خوانده‌شده</ThemedText>
                                        <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                            {persianNumberFormatter.format(readCount)} اعلان · امکان بازگردانی تا ۳۰ ثانیه
                                        </ThemedText>
                                    </View>
                                </Pressable>
                            ) : null}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            <ConfirmationModal
                visible={notificationToDelete !== null}
                title="حذف اطلاعیه"
                message={notificationToDelete
                    ? `«${notificationToDelete.title}» حذف شود؟ پس از حذف، تا ۳۰ ثانیه امکان بازگردانی آن را دارید.`
                    : ''}
                confirmLabel="حذف"
                icon="delete-outline"
                busy={notificationToDelete !== null && deletingNotificationId === notificationToDelete.id}
                onCancel={() => {
                    if (deletingNotificationId === null) setNotificationToDelete(null);
                }}
                onConfirm={async () => {
                    if (!notificationToDelete || deletingNotificationId !== null) return;
                    await deleteOne(notificationToDelete);
                    setNotificationToDelete(null);
                }}
            />
            <ConfirmationModal
                visible={deleteReadConfirmationVisible}
                title="پاک‌کردن اعلان‌های خوانده‌شده"
                message={`تعداد ${persianNumberFormatter.format(readCount)} اعلان خوانده‌شده پاک شود؟ تا ۳۰ ثانیه امکان بازگردانی دارید.`}
                confirmLabel="پاک‌کردن"
                icon="delete-sweep-outline"
                busy={deletingReadNotifications}
                onCancel={() => setDeleteReadConfirmationVisible(false)}
                onConfirm={async () => {
                    setDeleteReadConfirmationVisible(false);
                    await performDeleteAllRead();
                }}
            />
            <Snackbar variant="error"
                visible={pushMessage !== null}
                onDismiss={() => {
                    setPushMessage(null);
                }}
                duration={4000}
                wrapperStyle={{ bottom: activeUndoOperations.length > 0 ? 88 : 0 }}
                style={{ backgroundColor: pushMessageKind === 'error' ? theme.errorFill : theme.successFill }}
            >
                <ThemedText type="small" style={{ color: pushMessageKind === 'error' ? theme.onErrorFill : theme.onSuccess }}>
                    {pushMessage}
                </ThemedText>
            </Snackbar>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    tabView: { flex: 1 },
    scene: { flex: 1 },
    undoBar: {
        position: 'absolute',
        left: Spacing.three,
        right: Spacing.three,
        zIndex: 5,
        minHeight: 72,
        borderWidth: 1,
        borderRadius: Radius.lg,
        padding: Spacing.two,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
        elevation: 5,
    },
    undoIcon: {
        width: 40,
        height: 40,
        borderRadius: Radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    undoCopy: { flex: 1, gap: Spacing.one },
    undoButton: {
        minHeight: 40,
        minWidth: 88,
        borderRadius: Radius.md,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.two,
    },
    listContent: { flexGrow: 1, paddingBottom: Spacing.four },
    headerContent: { gap: Spacing.three, paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.three },
    timelineHeading: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: Spacing.two,
    },
    heroCopy: { flex: 1, gap: Spacing.one },
    unreadCount: { borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
    settingsButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 19 },
    pushCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
        borderWidth: 1,
        borderRadius: Radius.md,
        minHeight: 56,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.two,
    },
    pushIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
    pushCopy: { flex: 1, gap: Spacing.half },
    pushToggle: {
        minWidth: 68,
        minHeight: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.two,
    },
    filterTabBar: { borderBottomWidth: StyleSheet.hairlineWidth },
    filterTabsContent: { flexDirection: 'row' },
    filterTab: {
        minWidth: 88,
        minHeight: 54,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.one,
        paddingHorizontal: Spacing.three,
        position: 'relative',
    },
    filterTabIndicator: {
        position: 'absolute',
        left: Spacing.two,
        right: Spacing.two,
        bottom: 0,
        height: 4,
        borderRadius: 999,
        overflow: 'hidden',
    },
    filterCount: { minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 12, paddingHorizontal: 5 },
    markAllButton: {
        flex: 1,
        minHeight: 40,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.one,
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.one,
    },
    settingsSheet: {
        maxHeight: '72%',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: Spacing.four,
        paddingTop: Spacing.three,
    },
    settingsOptions: { flexShrink: 1 },
    settingsOptionList: { gap: Spacing.three, paddingBottom: Spacing.two },
    settingsAction: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.three },
    settingsActionCopy: { flex: 1, gap: Spacing.one },
    dayHeading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingHorizontal: Spacing.four, paddingTop: Spacing.three, paddingBottom: Spacing.two },
    dayRule: { flex: 1, height: StyleSheet.hairlineWidth },
    timelineItem: { flexDirection: 'row', alignItems: 'stretch', gap: Spacing.two, marginHorizontal: Spacing.four, paddingHorizontal: Spacing.two, paddingVertical: Spacing.two },
    notificationSeparator: {
        height: StyleSheet.hairlineWidth,
        marginStart: Spacing.four + Spacing.two + 36 + Spacing.two,
        marginEnd: Spacing.four + Spacing.two,
    },
    timelineRail: { width: 36, alignItems: 'center' },
    timelineConnector: { width: 2, flex: 1, minHeight: Spacing.two, marginTop: Spacing.one, borderRadius: 1 },
    timelineBody: { flex: 1, gap: Spacing.two },
    notificationContent: { gap: Spacing.one },
    cardHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.one },
    categoryIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    categoryPill: { maxWidth: '65%', borderRadius: 999, paddingHorizontal: Spacing.one, paddingVertical: 3 },
    metaDot: { width: 3, height: 3, borderRadius: 2 },
    unreadStatus: { borderRadius: 999, paddingHorizontal: Spacing.one, paddingVertical: 2, marginStart: 'auto' },
    bodyText: { lineHeight: Typography.lineHeight.label },
    cardFooter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
    cardFooterActions: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.one },
    priorityMetaPill: { borderRadius: 999, paddingHorizontal: Spacing.one, paddingVertical: 2 },
    detailsLink: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: Spacing.one, borderRadius: Radius.sm },
    deleteButton: { width: 36, height: 36, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
    emptyCard: {
        minHeight: 210,
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.two,
        borderWidth: 1,
        borderRadius: Radius.lg,
        padding: Spacing.four,
        marginHorizontal: Spacing.four,
    },
    emptyIcon: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 20, marginBottom: Spacing.one },
    footerLoader: { paddingVertical: Spacing.three },
    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    modalBackdrop: { ...StyleSheet.absoluteFill },
    sheetHandle: { width: 38, height: 4, alignSelf: 'center', borderRadius: 2, marginBottom: Spacing.two },
    sheetHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.two },
    closeButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
});
