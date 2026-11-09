import { Typography } from '@/constants/typography';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, LayoutChangeEvent, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabView, type NavigationState, type SceneRendererProps } from 'react-native-tab-view';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ErrorNoticeCard } from '@/components/error-notice-card';
import { ToolListItem } from '@/components/tool-list-item';
import { WebBadge } from '@/components/web-badge';
import { LegalCategoryList } from '@/components/legal/legal-category-list';
import { Radius, Spacing } from '@/constants/theme';
import { TOOL_DEFINITIONS, type ToolDefinition } from '@/constants/tool-definitions';
import { getToolRoute } from '@/constants/tool-routes';
import { useTheme } from '@/hooks/use-theme';
import { usePlanAccess } from '@/hooks/use-plan-access';
import { HOME_ROUTES, groupHomeActions, type HomeRoute, type HomeTab } from '@/utils/home-tabs';
import { hasPlanFeature } from '@/utils/plan-access';

type HomeAction = ToolDefinition & { onPress: () => void };

type HomeTabBarProps = SceneRendererProps & {
    navigationState: NavigationState<HomeRoute>;
    theme: ReturnType<typeof useTheme>;
};

function createHomeActions(router: ReturnType<typeof useRouter>): HomeAction[] {
    return TOOL_DEFINITIONS.map((tool) => ({
        ...tool,
        onPress: () => router.push(getToolRoute(tool.route) as never),
    }));
}

type HomeTabItemProps = {
    route: HomeRoute;
    isActive: boolean;
    onSelect: (key: string) => void;
    theme: ReturnType<typeof useTheme>;
    onLayout: (key: string, event: LayoutChangeEvent) => void;
};

const HomeTabItem = memo(function HomeTabItem({ route, isActive, onSelect, theme, onLayout }: HomeTabItemProps) {
    const [indicatorProgress] = useState(() => new Animated.Value(isActive ? 1 : 0));
    const handlePress = useCallback(() => onSelect(route.key), [onSelect, route.key]);
    const handleLayout = useCallback(
        (event: LayoutChangeEvent) => onLayout(route.key, event),
        [onLayout, route.key],
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
            onPress={handlePress}
            style={({ pressed }) => [
                styles.tabItem,
                { backgroundColor: pressed ? theme.surfaceVariant : theme.surface },
            ]}
            onLayout={handleLayout}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={route.label}
        >
            <ThemedText
                type="smallBold"
                numberOfLines={1}
                style={[styles.tabLabel, { color: isActive ? theme.primaryText : theme.textSecondary }]}
            >
                {route.label}
            </ThemedText>
            <Animated.View
                style={[
                    styles.tabIndicator,
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

function HomeTabBar({ navigationState, jumpTo, theme }: HomeTabBarProps) {
    const scrollViewRef = useRef<ScrollViewInstance>(null);
    const tabLayouts = useRef<Record<string, { x: number; width: number }>>({});
    const [viewportWidth, setViewportWidth] = useState(0);
    const handleTabLayout = useCallback((key: string, event: LayoutChangeEvent) => {
        const { x, width } = event.nativeEvent.layout;
        tabLayouts.current[key] = { x, width };
    }, []);

    useEffect(() => {
        const activeTab = navigationState.routes[navigationState.index];
        const layout = activeTab ? tabLayouts.current[activeTab.key] : undefined;

        if (!layout || viewportWidth <= 0) {
            return;
        }

        const targetOffset = Math.max(0, layout.x - (viewportWidth - layout.width) / 2);
        scrollViewRef.current?.scrollTo({ x: targetOffset, animated: true });
    }, [navigationState.index, navigationState.routes, viewportWidth]);

    return (
        <View
            accessibilityRole="tablist"
            style={[styles.tabBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}
        >
            <ScrollView
                ref={scrollViewRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.tabBarContent}
                onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
            >
                {navigationState.routes.map((route, index) => (
                    <HomeTabItem
                        key={route.key}
                        route={route}
                        isActive={navigationState.index === index}
                        onSelect={jumpTo}
                        theme={theme}
                        onLayout={handleTabLayout}
                    />
                ))}
            </ScrollView>
        </View>
    );
}

type SceneProps = {
    tab: HomeTab;
    actions: HomeAction[];
    theme: ReturnType<typeof useTheme>;
    bottomInset: number;
    accessLoading: boolean;
    accessError: string | null;
    accessResolved: boolean;
    refreshAccess: () => Promise<void>;
    legalAccess: boolean;
};

const HomeToolRow = memo(function HomeToolRow({ action }: { action: HomeAction }) {
    return <ToolListItem tool={action} onPress={action.onPress} compactIcon />;
});

const HomeScene = memo(function HomeScene({ tab, actions, theme, bottomInset, accessLoading, accessError, accessResolved, refreshAccess, legalAccess }: SceneProps) {
    const actionGroups = useMemo(() => groupHomeActions(actions, tab), [actions, tab]);
    const tabActionCount = Object.values(actionGroups).reduce((total, items) => total + items.length, 0);

    const renderActionList = (items: HomeAction[]) => (
        <View style={[styles.listCard, { backgroundColor: theme.surface }]}>
            {items.map((action, index) => (
                <Fragment key={action.key}>
                    <HomeToolRow action={action} />
                    {index < items.length - 1 ? <View style={[styles.chatSeparator, { backgroundColor: theme.border }]} /> : null}
                </Fragment>
            ))}
        </View>
    );

    const renderSection = (items: HomeAction[]) => items.length > 0 ? (
        <View style={styles.categorySection}>
            {renderActionList(items)}
        </View>
    ) : null;

    return (
        <ScrollView
            style={styles.sceneScroll}
            contentContainerStyle={[styles.sceneContent, { paddingBottom: bottomInset + Spacing.four + 56 }]}
            showsVerticalScrollIndicator={false}
        >
            <View style={styles.page}>
                {accessLoading ? (
                    <View style={styles.emptyState}>
                        <ActivityIndicator color={theme.primary} />
                        <ThemedText type="small" style={{ color: theme.textSecondary }}>در حال بررسی دسترسی پلن…</ThemedText>
                    </View>
                ) : accessError ? (
                    <ErrorNoticeCard
                        title="دسترسی ابزارها بررسی نشد"
                        message={accessError}
                        onRetry={() => void refreshAccess()}
                        retryLabel="بررسی دوباره"
                        style={{ margin: Spacing.three }}
                    />
                ) : !accessResolved ? (
                    <View style={styles.emptyState}>
                        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                            دسترسی پلن هنوز تأیید نشده است.
                        </ThemedText>
                        <Pressable onPress={() => void refreshAccess()} accessibilityRole="button">
                            <ThemedText type="smallBold" themeColor="primaryText">بررسی دوباره</ThemedText>
                        </Pressable>
                    </View>
                ) : tab === 'rules' && legalAccess ? (
                    <LegalCategoryList />
                ) : tab === 'rules' ? (
                    <View style={[styles.listCard, { backgroundColor: theme.surface }]}>
                        <View style={styles.emptyState}>
                            <MaterialCommunityIcons name="lock-outline" size={28} color={theme.textMuted} />
                            <ThemedText type="smallBold" style={{ color: theme.text }}>دسترسی به قوانین و مقررات در پلن فعلی فعال نیست</ThemedText>
                        </View>
                    </View>
                ) : tabActionCount > 0 ? (
                    <>
                        {tab === 'all' ? renderSection(actionGroups.yearlyInfo) : null}
                        {renderSection(actionGroups.wageContinuous)}
                        {renderSection(actionGroups.wageNonContinuous)}
                        {renderSection(actionGroups.nonWage)}
                        {tab !== 'all' ? renderSection(actionGroups.yearlyInfo) : null}
                    </>
                ) : (
                    <View style={[styles.listCard, { backgroundColor: theme.surface }]}>
                        <View style={styles.emptyState}>
                            <MaterialCommunityIcons name="book-open-page-variant-outline" size={28} color={theme.textMuted} />
                            <ThemedText type="smallBold" style={{ color: theme.text }}>در پلن فعلی دسترسی به این ابزارها فعال نیست</ThemedText>
                        </View>
                    </View>
                )}
            </View>
            {Platform.OS === 'web' && <WebBadge />}
        </ScrollView>
    );
});

export default function HomeTabScreen() {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { width } = useWindowDimensions();
    const [tabIndex, setTabIndex] = useState(0);
    const { planAccess, isLoading: accessLoading, error: accessError, refresh: refreshAccess } = usePlanAccess();
    const hasFocusedHome = useRef(false);
    const handleRefreshAccess = useCallback(async () => {
        try {
            await refreshAccess();
        } catch (error) {
            console.error('بازخوانی دستی دسترسی امکانات ناموفق بود.', error);
        }
    }, [refreshAccess]);
    useFocusEffect(useCallback(() => {
        if (!hasFocusedHome.current) {
            hasFocusedHome.current = true;
            return;
        }

        void handleRefreshAccess();
    }, [handleRefreshAccess]));
    const hasResolvedAccess = !accessLoading && !accessError && planAccess !== null;
    const actions = useMemo(
        () => hasResolvedAccess
            ? createHomeActions(router).filter((action) => hasPlanFeature(planAccess, action.key))
            : [],
        [hasResolvedAccess, planAccess, router],
    );
    const legalAccess = hasResolvedAccess && hasPlanFeature(planAccess, 'legal_library');
    const canAccessGroupCalculation = hasResolvedAccess && hasPlanFeature(planAccess, 'group-calculation');

    const renderScene = useCallback(({ route }: { route: HomeRoute }) => (
        <HomeScene
            tab={route.key}
            actions={actions}
            theme={theme}
            bottomInset={insets.bottom}
            accessLoading={accessLoading}
            accessError={accessError}
            accessResolved={hasResolvedAccess}
            refreshAccess={handleRefreshAccess}
            legalAccess={legalAccess}
        />
    ), [accessError, accessLoading, actions, handleRefreshAccess, hasResolvedAccess, insets.bottom, legalAccess, theme]);

    const renderTabBar = useCallback((props: SceneRendererProps & { navigationState: NavigationState<HomeRoute> }) => (
        <HomeTabBar {...props} theme={theme} />
    ), [theme]);
    const commonOptions = useMemo(() => ({
        label: ({ route, color }: { route: HomeRoute; color: string }) => (
            <ThemedText type="smallBold" style={[styles.tabLabel, { color }]}>{route.label}</ThemedText>
        ),
    }), []);
    const handleGroupCalculationPress = useCallback(() => {
        router.push('/group-calculation' as never);
    }, [router]);

    return (
        <ThemedView style={styles.container}>
            <TabView
                navigationState={{ index: tabIndex, routes: HOME_ROUTES }}
                onIndexChange={setTabIndex}
                renderScene={renderScene}
                renderTabBar={renderTabBar}
                direction="rtl"
                swipeEnabled
                lazy
                lazyPreloadDistance={1}
                commonOptions={commonOptions}
                initialLayout={{ width }}
                style={styles.tabView}
            />
            {HOME_ROUTES[tabIndex]?.key !== 'rules' && canAccessGroupCalculation ? (
                <Pressable
                    onPress={handleGroupCalculationPress}
                    accessibilityRole="button"
                    accessibilityLabel="محاسبات جامع"
                    style={({ pressed }) => [
                        styles.groupCalculationButton,
                        {
                            backgroundColor: theme.primary,
                            shadowColor: theme.shadow,
                            bottom: Spacing.two,
                            opacity: pressed ? 0.82 : 1,
                        },
                    ]}
                >
                    <MaterialCommunityIcons name="calculator-variant" size={22} color={theme.onPrimary} />
                    <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
                        محاسبات جامع
                    </ThemedText>
                </Pressable>
            ) : null}
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    tabView: { flex: 1 },
    groupCalculationButton: {
        position: 'absolute',
        right: Spacing.three,
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.one,
        paddingHorizontal: Spacing.three,
        borderRadius: 24,
        elevation: 5,
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.24,
        shadowRadius: 4,
    },
    tabBar: { borderBottomWidth: StyleSheet.hairlineWidth },
    tabBarContent: { flexDirection: 'row' },
    tabItem: { minWidth: 88, minHeight: 54, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.three, position: 'relative' },
    tabLabel: { fontFamily: 'AppFont-Medium', fontSize: Typography.fontSize.footnote, textTransform: 'none' },
    tabIndicator: { position: 'absolute', left: Spacing.two, right: Spacing.two, bottom: 0, height: 4, borderRadius: 999, overflow: 'hidden' },
    sceneScroll: { flex: 1 },
    sceneContent: { flexGrow: 1 },
    page: { gap: Spacing.one },
    categorySection: { gap: Spacing.one, marginTop: 0 },
    listCard: { overflow: 'hidden', borderRadius: Radius.md},
    chatSeparator: { height: StyleSheet.hairlineWidth, marginStart: Spacing.three + 50 + Spacing.two },
    emptyState: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: Spacing.one, padding: Spacing.four },
});
