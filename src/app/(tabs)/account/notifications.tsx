import { MaterialCommunityIcons } from '@expo/vector-icons';
import Constants, { AppOwnership } from 'expo-constants';
import * as Device from 'expo-device';
import { useFocusEffect } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, LayoutChangeEvent, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import { TabView, type NavigationState, type SceneRendererProps } from 'react-native-tab-view';
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { Snackbar } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmationModal } from '@/components/confirmation-modal';
import { ErrorNoticeCard } from '@/components/error-notice-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useAppFeedback } from '@/hooks/use-app-feedback';
import { useOnlineRefetch } from '@/hooks/use-online-refetch';
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
import { formatPersianDate } from '@/utils/persian-date';

const categories: { key: NotificationCategory; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [
    { key: 'account_access', label: 'حساب و دسترسی', icon: 'account-lock-outline' },
    { key: 'security', label: 'امنیت', icon: 'shield-lock-outline' },
    { key: 'finance', label: 'مالی و کیف پول', icon: 'wallet-outline' },
    { key: 'subscription', label: 'اشتراک و پلن', icon: 'crown-outline' },
    { key: 'service', label: 'خدمات سامانه', icon: 'application-cog-outline' },
    { key: 'announcement', label: 'اطلاعیه‌های رسمی', icon: 'bullhorn-outline' },
];

type NotificationFilter = 'all' | 'unread' | NotificationCategory;
type NotificationInboxData = InfiniteData<PaginatedResult<InboxNotification>, number>;
type PendingNotificationUndo = {
    token: string;
    deletedCount: number;
    expiresAt: number;
    userId: number;
};

function formatUndoCountdown(milliseconds: number): string {
    const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
    const format = new Intl.NumberFormat('fa-IR', { minimumIntegerDigits: 2, useGrouping: false });
    return `${format.format(Math.floor(totalSeconds / 60))}:${format.format(totalSeconds % 60)}`;
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

        queryClient.setQueryData<NotificationInboxData>(queryKey, {
            ...cachedList,
            pages: cachedList.pages.map((page) => {
                const data = page.data.flatMap((notification) => {
                    const updated = update(notification, activeFilter);
                    return updated ? [updated] : [];
                });
                const removedCount = page.data.length - data.length;
                return {
                    ...page,
                    data,
                    meta: { ...page.meta, total: Math.max(0, page.meta.total - removedCount) },
                };
            }),
        });
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
    return formatPersianDate(date, { dateStyle: 'long' }) ?? 'زمان نامشخص';
}

function notificationTime(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'زمان نامشخص';
    return formatPersianDate(date, { timeStyle: 'short' }) ?? 'زمان نامشخص';
}

type NotificationFilterTabProps = {
    filter: NotificationRoute;
    isActive: boolean;
    unreadCount: number;
    theme: ReturnType<typeof useTheme>;
    onPress: () => void;
    onLayout: (event: LayoutChangeEvent) => void;
};

const NotificationFilterTab = memo(function NotificationFilterTab({
    filter,
    isActive,
    unreadCount,
    theme,
    onPress,
    onLayout,
}: NotificationFilterTabProps) {
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
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={filter.label}
            onPress={onPress}
            onLayout={onLayout}
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
                <View style={[styles.filterCount, { backgroundColor: isActive ? theme.primaryContainer : theme.backgroundElement }]}>
                    <ThemedText type="smallBold" style={{ color: theme.primaryText }}>
                        {new Intl.NumberFormat('fa-IR').format(unreadCount)}
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
                        unreadCount={unreadCount}
                        theme={theme}
                        onPress={() => jumpTo(route.key)}
                        onLayout={(event) => {
                            const { x, width } = event.nativeEvent.layout;
                            tabLayouts.current[route.key] = { x, width };
                        }}
                    />
                ))}
            </ScrollView>
        </View>
    );
}

type NotificationFilterSceneProps = {
    filter: NotificationFilter;
    userId: number | null;
    theme: ReturnType<typeof useTheme>;
    bottomInset: number;
    unreadCount: number;
    settingsVisible: boolean;
    visibleErrorMessage: string | null;
    undoBarVisible: boolean;
    undoBusy: boolean;
    deletingNotificationId: number | null;
    deletingReadNotifications: boolean;
    onRefreshCounts: () => Promise<unknown>;
    onRetry: () => void;
    onOpenSettings: () => void;
    expandedNotificationIds: Set<number>;
    onToggleExpanded: (notificationId: number) => void;
    onOpenNotification: (item: InboxNotification) => void;
    onRequestDelete: (item: InboxNotification) => void;
};

const NotificationFilterScene = memo(function NotificationFilterScene({
    filter,
    userId,
    theme,
    bottomInset,
    unreadCount,
    settingsVisible,
    visibleErrorMessage,
    undoBarVisible,
    undoBusy,
    deletingNotificationId,
    deletingReadNotifications,
    onRefreshCounts,
    onRetry,
    onOpenSettings,
    expandedNotificationIds,
    onToggleExpanded,
    onOpenNotification,
    onRequestDelete,
}: NotificationFilterSceneProps) {
    const category = categories.find((item) => item.key === filter)?.key ?? null;
    const unreadOnly = filter === 'unread';
    const query = useInfiniteQuery({
        queryKey: notificationQueryKeys.inbox(userId ?? 0, filter),
        enabled: userId !== null,
        initialPageParam: 1,
        queryFn: async ({ pageParam }) => {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('برای مشاهدهٔ اعلان‌ها وارد حساب شوید.');
            return fetchNotificationInbox(token, {
                page: pageParam,
                category: category ?? undefined,
                unreadOnly,
            });
        },
        getNextPageParam: (lastPage) => lastPage.meta.current_page < lastPage.meta.last_page
            ? lastPage.meta.current_page + 1
            : undefined,
        staleTime: CACHE_POLICY.query.resources.notificationInbox.staleTimeMs,
        retry: false,
    });
    const items = query.data?.pages.flatMap((page) => page.data) ?? [];
    const loading = userId !== null && query.isPending;
    const queryError = query.error
        ? getUserFacingErrorMessage(query.error, 'دریافت اعلان‌ها ناموفق بود.')
        : null;
    const activeCategory = categories.find((item) => item.key === category);

    return (
        <View style={styles.scene}>
            <View style={styles.headerContent}>
                <View style={styles.timelineHeading}>
                    <ThemedText type="bodyBold" style={{ color: theme.text }}>صندوق اعلان‌ها</ThemedText>
                    <View style={styles.headerActions}>
                        <View style={[styles.unreadCount, { backgroundColor: theme.primaryContainer }]}>
                            <ThemedText type="smallBold" style={{ color: theme.primaryText }}>
                                {new Intl.NumberFormat('fa-IR').format(unreadCount)} خوانده‌نشده
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
            contentContainerStyle={[
                styles.listContent,
                { paddingBottom: bottomInset + Spacing.four + (undoBarVisible ? 88 : 0) },
            ]}
            onRefresh={() => {
                void Promise.all([query.refetch(), onRefreshCounts()]);
            }}
            refreshing={query.isRefetching}
            onEndReached={() => {
                if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
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
                    <View style={[styles.emptyIcon, { backgroundColor: theme.primaryContainer }]}>
                        <MaterialCommunityIcons name="bell-check-outline" size={31} color={theme.primaryText} />
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
                const selectedCategory = categories.find((entry) => entry.key === item.category);
                const previousItem = items[index - 1];
                const nextItem = items[index + 1];
                const startsDay = index === 0 || notificationDayKey(previousItem?.created_at ?? '') !== notificationDayKey(item.created_at);
                const endsDay = !nextItem || notificationDayKey(nextItem.created_at) !== notificationDayKey(item.created_at);
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
                                <View style={[styles.categoryIcon, { backgroundColor: item.read_at ? theme.surfaceVariant : theme.primaryContainer }]}>
                                    <MaterialCommunityIcons
                                        name={selectedCategory?.icon ?? 'bell-outline'}
                                        size={19}
                                        color={item.read_at ? theme.textSecondary : theme.primaryText}
                                    />
                                </View>
                                {!endsDay ? <View style={[styles.timelineConnector, { backgroundColor: theme.border }]} /> : null}
                            </View>
                            <View style={styles.timelineBody}>
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`${item.title}، ${item.read_at ? 'خوانده‌شده' : 'خوانده‌نشده'}${item.priority !== 'normal' ? `، ${priorityLabels[item.priority]}` : ''}`}
                                    accessibilityHint={item.read_at ? undefined : 'برای ثبت به‌عنوان خوانده‌شده لمس کنید.'}
                                    disabled={Boolean(item.read_at)}
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
                                        <View style={styles.metaDot} />
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
                                                    style={{ color: item.priority === 'urgent' ? theme.onError : theme.onWarning }}
                                                >
                                                    {priorityLabels[item.priority]}
                                                </ThemedText>
                                            </View>
                                        ) : null}
                                        {!item.read_at ? <View style={[styles.unreadMarker, { backgroundColor: theme.primary }]} /> : null}
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
                                                onPress={() => onToggleExpanded(item.id)}
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
                                        disabled={deletingNotificationId !== null || deletingReadNotifications || undoBusy}
                                        accessibilityState={{ disabled: deletingNotificationId !== null || deletingReadNotifications || undoBusy }}
                                        onPress={() => onRequestDelete(item)}
                                        style={({ pressed }) => [
                                            styles.deleteButton,
                                            { backgroundColor: pressed ? theme.errorFill : theme.surfaceVariant },
                                            { opacity: deletingNotificationId !== null || deletingReadNotifications || undoBusy ? 0.55 : 1 },
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

export default function NotificationsScreen() {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
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
    const [pushMessage, setPushMessage] = useState<string | null>(null);
    const [pushMessageKind, setPushMessageKind] = useState<'success' | 'error'>('success');
    const [undoOperations, setUndoOperations] = useState<PendingNotificationUndo[]>([]);
    const [undoCountdownNow, setUndoCountdownNow] = useState(0);
    const [deletingNotificationId, setDeletingNotificationId] = useState<number | null>(null);
    const [deletingReadNotifications, setDeletingReadNotifications] = useState(false);
    const [undoBusy, setUndoBusy] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [expandedNotificationIds, setExpandedNotificationIds] = useState<Set<number>>(() => new Set());
    const hasInitializedNotificationFocus = useRef(false);
    const undoBusyRef = useRef(false);

    const countsQuery = useQuery({
        queryKey: notificationQueryKeys.counts(userId ?? 0),
        enabled: userId !== null,
        queryFn: async () => {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('برای مشاهدهٔ اعلان‌ها وارد حساب شوید.');
            return fetchNotificationCounts(token);
        },
        staleTime: CACHE_POLICY.query.resources.notificationCounts.staleTimeMs,
        retry: false,
    });

    const unreadCount = countsQuery.data?.unread_count ?? 0;
    const readCount = countsQuery.data?.read_count ?? 0;
    const notificationQueryError = countsQuery.error
        ? getUserFacingErrorMessage(countsQuery.error, 'دریافت شمارندهٔ اعلان‌ها ناموفق بود.')
        : null;
    const visibleErrorMessage = errorMessage ?? notificationQueryError;
    const loadNotifications = () => {
        if (userId === null) return;
        void Promise.all([
            queryClient.invalidateQueries({
                queryKey: notificationQueryKeys.inbox(userId, activeFilter),
            }),
            queryClient.invalidateQueries({
                queryKey: notificationQueryKeys.counts(userId),
            }),
        ]);
    };
    useOnlineRefetch(() => {
        if (userId === null) return;
        void Promise.all([
            queryClient.refetchQueries({
                queryKey: notificationQueryKeys.inboxPrefix(userId),
                type: 'active',
            }),
            queryClient.refetchQueries({
                queryKey: notificationQueryKeys.counts(userId),
                type: 'active',
            }),
        ]);
    }, userId !== null);
    const invalidateNotificationQueries = () => {
        if (userId === null) return;
        void Promise.all([
            queryClient.invalidateQueries({ queryKey: notificationQueryKeys.inboxPrefix(userId) }),
            queryClient.invalidateQueries({ queryKey: notificationQueryKeys.counts(userId) }),
        ]);
    };

    useEffect(() => {
        if (undoOperations.length === 0) return;

        const updateCountdown = () => {
            const now = Date.now();
            setUndoCountdownNow(now);
            setUndoOperations((current) => current.filter((operation) => operation.expiresAt > now));
        };
        const interval = setInterval(updateCountdown, 1000);
        return () => clearInterval(interval);
    }, [undoOperations.length]);

    const updateCachedCounts = (update: (counts: NotificationCounts) => NotificationCounts) => {
        if (userId === null) return;
        queryClient.setQueryData<NotificationCounts>(
            notificationQueryKeys.counts(userId),
            (current) => current ? update(current) : current,
        );
    };

    useFocusEffect(useCallback(() => {
        if (userId === null) return;
        if (!hasInitializedNotificationFocus.current) {
            hasInitializedNotificationFocus.current = true;
            return;
        }

        void queryClient.refetchQueries({
            queryKey: notificationQueryKeys.inboxPrefix(userId),
            stale: true,
            type: 'active',
        });
        void queryClient.refetchQueries({
            queryKey: notificationQueryKeys.counts(userId),
            stale: true,
            type: 'active',
        });
    }, [queryClient, userId]));

    useFocusEffect(useCallback(() => {
        let isMounted = true;

        const loadPushStatus = async () => {
            if (!user) {
                setPushEnabled(false);
                setPushStatusLoading(false);
                return;
            }

            setPushStatusLoading(true);
            try {
                const token = await getStoredAuthToken();
                if (!token) throw new Error('نشست کاربری برای بررسی وضعیت اعلان‌ها در دسترس نیست.');
                const enabled = await fetchPushSubscriptionStatus(token);
                if (isExpoGo) {
                    if (isMounted) setPushEnabled(enabled);
                    return;
                }

                const Notifications = await import('expo-notifications');
                const permission = await Notifications.getPermissionsAsync();
                if (isMounted) setPushEnabled(enabled && permission.status === 'granted');
            } catch (error) {
                if (isMounted) {
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
    }, [showError, user]));

    const togglePushNotifications = async () => {
        if (pushBusy) return;
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
        if (!user || deletingNotificationId !== null || undoBusy) return;
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
                    setUndoCountdownNow(Date.now());
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
        if (!user || deletingReadNotifications || readCount === 0) return;
        setSettingsVisible(false);
        setDeleteReadConfirmationVisible(true);
    };

    const performDeleteAllRead = async () => {
        if (!user || deletingReadNotifications || readCount === 0 || undoBusy) return;
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
                    setUndoCountdownNow(Date.now());
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

    const undoDelete = async () => {
        const activeOperations = undoOperations.filter((operation) => operation.userId === user?.id);
        if (!user || activeOperations.length === 0 || undoBusyRef.current) return;
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
            if (restoredCount > 0) await Promise.all([
                queryClient.invalidateQueries({ queryKey: notificationQueryKeys.inboxPrefix(user.id) }),
                queryClient.invalidateQueries({ queryKey: notificationQueryKeys.counts(user.id) }),
            ]);
            if (remaining.length > 0 && restoreError) {
                showError(restoreError, 'بازگردانی بخشی از اعلان‌ها ناموفق بود. دوباره تلاش کنید.');
            } else if (restoredCount > 0) {
                setPushMessage(`${new Intl.NumberFormat('fa-IR').format(restoredCount)} اعلان بازگردانی شد.`);
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
    };

    const markAllRead = async () => {
        if (!user || markingAll || unreadCount === 0) return;
        setMarkingAll(true);
        try {
            const token = await getStoredAuthToken();
            if (!token) throw new Error('برای مدیریت اعلان‌ها وارد حساب شوید.');
            await markAllNotificationsRead(token);
            const readAt = new Date().toISOString();
            updateCachedNotificationLists(queryClient, user.id, (item, filter) => {
                if (filter === 'unread') return null;
                return { ...item, read_at: item.read_at ?? readAt };
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

    const openNotification = async (item: InboxNotification) => {
        if (!user) return;
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

    };

    const toggleExpandedNotification = (notificationId: number) => {
        setExpandedNotificationIds((current) => {
            const next = new Set(current);
            if (next.has(notificationId)) {
                next.delete(notificationId);
            } else {
                next.add(notificationId);
            }
            return next;
        });
    };

    const activeUndoOperations = undoOperations.filter((operation) => operation.userId === userId);
    const pendingUndoCount = activeUndoOperations.reduce((count, operation) => count + operation.deletedCount, 0);
    const nextUndoExpiry = activeUndoOperations.reduce(
        (earliest, operation) => Math.min(earliest, operation.expiresAt),
        Number.POSITIVE_INFINITY,
    );
    const undoCountdown = formatUndoCountdown(nextUndoExpiry - undoCountdownNow);

    return (
        <ThemedView style={styles.container}>
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
                        userId={user?.id ?? null}
                        theme={theme}
                        bottomInset={insets.bottom}
                        unreadCount={unreadCount}
                        settingsVisible={settingsVisible}
                        visibleErrorMessage={visibleErrorMessage}
                        undoBarVisible={activeUndoOperations.length > 0}
                        undoBusy={undoBusy}
                        deletingNotificationId={deletingNotificationId}
                        deletingReadNotifications={deletingReadNotifications}
                        expandedNotificationIds={expandedNotificationIds}
                        onToggleExpanded={toggleExpandedNotification}
                        onRefreshCounts={() => countsQuery.refetch()}
                        onRetry={loadNotifications}
                        onOpenSettings={() => setSettingsVisible(true)}
                        onOpenNotification={(item) => void openNotification(item)}
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

            {activeUndoOperations.length > 0 ? (
                <View
                    accessibilityLabel={`حذف ${pendingUndoCount} اعلان. فرصت بازگردانی ${undoCountdown}`}
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
                            {pendingUndoCount === 1 ? 'اعلان حذف شد' : `${new Intl.NumberFormat('fa-IR').format(pendingUndoCount)} اعلان حذف شد`}
                        </ThemedText>
                        <ThemedText type="small" style={{ color: theme.textSecondary }}>
                            فرصت بازگردانی: {undoCountdown}
                        </ThemedText>
                    </View>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`بازگردانی ${pendingUndoCount} اعلان`}
                        accessibilityState={{ disabled: undoBusy }}
                        disabled={undoBusy}
                        onPress={() => void undoDelete()}
                        style={({ pressed }) => [
                            styles.undoButton,
                            {
                                backgroundColor: theme.primary,
                                opacity: undoBusy ? 0.65 : pressed ? 0.8 : 1,
                            },
                        ]}
                    >
                        {undoBusy
                            ? <ActivityIndicator size="small" color={theme.onPrimary} />
                            : <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>بازگردانی</ThemedText>}
                    </Pressable>
                </View>
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
                                            : pushEnabled ? 'روشن' : 'خاموش'}
                                    </ThemedText>
                                </View>
                                <Pressable
                                    accessibilityRole="switch"
                                    accessibilityLabel="اعلان‌های این دستگاه"
                                    accessibilityState={{
                                        disabled: pushBusy || pushStatusLoading || (securityRestricted && !pushEnabled) || (isExpoGo && !pushEnabled),
                                        checked: pushEnabled,
                                    }}
                                    disabled={pushBusy || pushStatusLoading || (securityRestricted && !pushEnabled) || (isExpoGo && !pushEnabled)}
                                    onPress={() => void togglePushNotifications()}
                                    style={({ pressed }) => [
                                        styles.pushToggle,
                                        {
                                            backgroundColor: pushEnabled ? theme.surfaceVariant : theme.primary,
                                            borderColor: pushEnabled ? theme.border : theme.primary,
                                            opacity: pressed || pushBusy || pushStatusLoading ? 0.7 : 1,
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
                                    disabled={markingAll}
                                    onPress={() => void markAllRead()}
                                    style={({ pressed }) => [
                                        styles.settingsAction,
                                        { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed || markingAll ? 0.65 : 1 },
                                    ]}
                                >
                                    {markingAll
                                        ? <ActivityIndicator size="small" color={theme.primaryText} />
                                        : <MaterialCommunityIcons name="email-open-outline" size={20} color={theme.primaryText} />}
                                    <View style={styles.settingsActionCopy}>
                                        <ThemedText type="smallBold" style={{ color: theme.text }}>علامت‌گذاری همه به‌عنوان خوانده‌شده</ThemedText>
                                        <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                            {new Intl.NumberFormat('fa-IR').format(unreadCount)} اعلان خوانده‌نشده
                                        </ThemedText>
                                    </View>
                                </Pressable>
                            ) : null}
                            {readCount > 0 ? (
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`پاک‌کردن همهٔ اعلان‌های خوانده‌شده، ${readCount} اعلان`}
                                    disabled={deletingReadNotifications || deletingNotificationId !== null || undoBusy}
                                    onPress={() => void deleteAllRead()}
                                    style={({ pressed }) => [
                                        styles.settingsAction,
                                        {
                                            backgroundColor: theme.surface,
                                            borderColor: theme.border,
                                            opacity: pressed || deletingReadNotifications || deletingNotificationId !== null || undoBusy ? 0.65 : 1,
                                        },
                                    ]}
                                >
                                    {deletingReadNotifications
                                        ? <ActivityIndicator size="small" color={theme.error} />
                                        : <MaterialCommunityIcons name="delete-sweep-outline" size={20} color={theme.error} />}
                                    <View style={styles.settingsActionCopy}>
                                        <ThemedText type="smallBold" style={{ color: theme.error }}>پاک‌کردن اعلان‌های خوانده‌شده</ThemedText>
                                        <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                            {new Intl.NumberFormat('fa-IR').format(readCount)} اعلان · امکان بازگردانی تا ۳۰ ثانیه
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
                message={`تعداد ${new Intl.NumberFormat('fa-IR').format(readCount)} اعلان خوانده‌شده پاک شود؟ تا ۳۰ ثانیه امکان بازگردانی دارید.`}
                confirmLabel="پاک‌کردن"
                icon="delete-sweep-outline"
                busy={deletingReadNotifications}
                onCancel={() => setDeleteReadConfirmationVisible(false)}
                onConfirm={async () => {
                    setDeleteReadConfirmationVisible(false);
                    await performDeleteAllRead();
                }}
            />
            <Snackbar
                visible={pushMessage !== null}
                onDismiss={() => {
                    setPushMessage(null);
                }}
                duration={4000}
                wrapperStyle={{ bottom: activeUndoOperations.length > 0 ? 88 : 0 }}
                style={{ backgroundColor: pushMessageKind === 'error' ? theme.errorFill : theme.successFill }}
            >
                <ThemedText type="small" style={{ color: pushMessageKind === 'error' ? theme.onError : theme.onSuccess }}>
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
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
    categoryIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    categoryPill: { maxWidth: '65%', borderRadius: 999, paddingHorizontal: Spacing.one, paddingVertical: 3 },
    metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#9CA3AF' },
    unreadMarker: { width: 8, height: 8, borderRadius: 4, marginStart: 'auto' },
    bodyText: { lineHeight: 22 },
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
