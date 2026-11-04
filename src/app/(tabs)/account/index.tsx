import { Typography } from '@/constants/typography';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Snackbar } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import appConfig from '@/../app.json';

import { ConfirmationModal } from '@/components/confirmation-modal';
import { ErrorNoticeCard } from '@/components/error-notice-card';
import { ProfilePhotoPreview } from '@/components/profile-photo-preview';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAppContext } from '@/hooks/use-app-context';
import { useAuth } from '@/hooks/use-auth';
import { useAppFeedback } from '@/hooks/use-app-feedback';
import { usePlanAccess } from '@/hooks/use-plan-access';
import { fetchNotificationUnreadCount, getProfilePhotoUrl, getStoredAuthToken } from '@/services/auth-api';
import { getPlanTierColor, getPlanTierIcon, getPlanTierLogoBackground, getPlanTierLogoForeground } from '@/utils/plan-tier-visual';

type ProfileAction = {
    key: string;
    label: string;
    subtitle: string;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
};

const profileGroups = [
    {
        title: 'حساب',
        actions: [
            { key: 'edit-profile', label: 'ویرایش پروفایل', subtitle: 'نام، تصویر و شماره تلفن', icon: 'account-edit' },
            { key: 'privacy-security', label: 'حریم خصوصی و امنیت', subtitle: 'نشست‌ها، دستگاه‌ها و تأیید دومرحله‌ای', icon: 'shield-lock-outline' },
            { key: 'notifications', label: 'اعلان‌ها', subtitle: 'پیام‌های حساب، امنیت و خدمات برنامه', icon: 'bell-outline' },
        ],
    },
    {
        title: 'اشتراک و امور مالی',
        actions: [
            { key: 'plans', label: 'پلن‌ها و اشتراک', subtitle: 'مشاهدهٔ پلن‌ها و مدیریت اشتراک', icon: 'crown-outline' },
            { key: 'wallet', label: 'کیف پول', subtitle: 'موجودی، شارژ و برداشت', icon: 'wallet-outline' },
            { key: 'financial-history', label: 'تاریخچه مالی', subtitle: 'تراکنش‌ها، پرداخت‌ها و برداشت‌ها', icon: 'receipt-text-outline' },
        ],
    },
    {
        title: 'برنامه',
        actions: [
            { key: 'settings', label: 'تنظیمات', subtitle: 'ظاهر برنامه و فونت', icon: 'cog-outline' },
            { key: 'support', label: 'پشتیبانی', subtitle: 'راهنما و ارتباط با ما', icon: 'lifebuoy' },
            { key: 'about-us', label: 'درباره ما', subtitle: 'معرفی پهناور کار', icon: 'information-outline' },
            { key: 'app-info', label: 'اطلاعات برنامه', subtitle: 'نسخه و وضعیت برنامه', icon: 'cellphone-information' },
        ],
    },
] satisfies { title: string; actions: ProfileAction[] }[];

function runDebouncedAction(lastPressRef: { current: number }, callback: () => void) {
    const now = Date.now();
    if (now - lastPressRef.current < 500) {
        return;
    }

    lastPressRef.current = now;
    callback();
}

export default function ProfileScreen() {
    const theme = useTheme();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const lastPressRef = useRef(0);
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('به زودی فعال می‌شود');
    const [signOutBusy, setSignOutBusy] = useState(false);
    const [sessionRefreshBusy, setSessionRefreshBusy] = useState(false);
    const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
    const [signOutConfirmationVisible, setSignOutConfirmationVisible] = useState(false);
    const [photoPreviewVisible, setPhotoPreviewVisible] = useState(false);
    const { user, isLoading: authLoading, sessionError, refreshUser, signOut } = useAuth();
    const { showError } = useAppFeedback();
    const { planAccess } = usePlanAccess();
    const { theme: appTheme } = useAppContext();
    const appVersion = appConfig.expo?.version ?? '1.0.0';
    const profilePhotoUrl = getProfilePhotoUrl(user?.profile_photo_path ?? null);
    const subscriptionBadge: {
        label: string;
        icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
        tier: string;
    } | null = planAccess
        ? {
            label: planAccess.is_unlimited
                ? 'دسترسی مدیریتی نامحدود'
                : planAccess.key === 'free'
                    ? 'اشتراک رایگان'
                    : `اشتراک ${planAccess.name}`,
            icon: planAccess.is_unlimited ? 'crown' : getPlanTierIcon(planAccess.key),
            tier: planAccess.is_unlimited ? 'gold' : planAccess.key,
        }
        : null;

    useFocusEffect(useCallback(() => {
        let active = true;

        const loadUnreadCount = async () => {
            if (!user) {
                setUnreadNotificationCount(0);
                return;
            }

            try {
                const token = await getStoredAuthToken();
                if (!token) throw new Error('نشست کاربر پیدا نشد.');
                const count = await fetchNotificationUnreadCount(token);
                if (active) setUnreadNotificationCount(count);
            } catch (error) {
                if (active) showError(error, 'دریافت تعداد اعلان‌های خوانده‌نشده ناموفق بود.');
            }
        };

        void loadUnreadCount();
        return () => {
            active = false;
        };
    }, [showError, user]));

    const handleUnavailableAction = (key: string) => {
        if (key === 'notifications') {
            runDebouncedAction(lastPressRef, () => router.push(
                user ? '/(tabs)/account/notifications' : '/auth?returnTo=notifications',
            ));
            return;
        }

        if (key === 'plans') {
            runDebouncedAction(lastPressRef, () => router.push('/(tabs)/account/plans'));
            return;
        }

        if (key === 'wallet' || key === 'financial-history' || key === 'edit-profile' || key === 'privacy-security') {
            if (!user) {
                runDebouncedAction(lastPressRef, () => router.push('/auth'));
                return;
            }
            runDebouncedAction(lastPressRef, () => router.push(`/(tabs)/account/${key}` as any));
            return;
        }

        if (key === 'settings' || key === 'about-us' || key === 'app-info') {
            runDebouncedAction(lastPressRef, () => router.push(`/(tabs)/account/${key}` as any));
            return;
        }

        runDebouncedAction(lastPressRef, () => {
            setSnackbarMessage('به زودی فعال می‌شود');
            setSnackbarVisible(true);
        });
    };

    const handleSignOut = async () => {
        if (signOutBusy) return;

        setSignOutBusy(true);
        try {
            await signOut();
            setSignOutConfirmationVisible(false);
        } catch (error) {
            setSignOutConfirmationVisible(false);
            showError(error, 'خروج از حساب ناموفق بود.');
        } finally {
            setSignOutBusy(false);
        }
    };

    const handleCopyPhone = async () => {
        if (!user?.phone) return;
        try {
            await Clipboard.setStringAsync(user.phone);
            setSnackbarMessage('شمارهٔ تلفن کپی شد.');
            setSnackbarVisible(true);
        } catch (error) {
            showError(error, 'کپی شمارهٔ تلفن ناموفق بود.');
        }
    };

    const handleRefreshSession = async () => {
        if (sessionRefreshBusy) return;

        setSessionRefreshBusy(true);
        try {
            await refreshUser();
        } catch (error) {
            console.error('تلاش دوباره برای همگام‌سازی نشست ناموفق بود.', error);
        } finally {
            setSessionRefreshBusy(false);
        }
    };

    return (
        <ThemedView style={styles.container}>
            <ScrollView
                contentContainerStyle={[
                    styles.scrollContent,
                    {
                        paddingBottom: insets.bottom + Spacing.four,
                    },
                ]}
                showsVerticalScrollIndicator={false}
            >
                {authLoading ? (
                    <View style={[styles.profileHero, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <ThemedText type="body" style={{ color: theme.textSecondary }}>
                            در حال بررسی وضعیت حساب...
                        </ThemedText>
                    </View>
                ) : user ? (
                    <View style={[styles.profileHero, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        {profilePhotoUrl ? (
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="پیش‌نمایش تصویر پروفایل"
                                onPress={() => setPhotoPreviewVisible(true)}
                                style={styles.heroAvatarButton}
                            >
                                <Image source={{ uri: profilePhotoUrl }} contentFit="cover" style={styles.heroAvatar} />
                            </Pressable>
                        ) : (
                            <View style={[styles.heroAvatar, { backgroundColor: theme.primary }]}>
                                <MaterialCommunityIcons name="account-outline" size={42} color={theme.onPrimary} />
                            </View>
                        )}
                        <ThemedText type="largeTitle" style={styles.heroName}>{user.name}</ThemedText>
                        <Pressable
                            accessibilityLabel={`کپی شمارهٔ تلفن ${user.phone}`}
                            accessibilityRole="button"
                            onPress={() => void handleCopyPhone()}
                            style={({ pressed }) => [styles.heroContact, { opacity: pressed ? 0.7 : 1 }]}
                        >
                            <MaterialCommunityIcons
                                name="cellphone"
                                size={18}
                                color={theme.textSecondary}
                            />
                            <ThemedText type="body" style={[styles.heroPhone, { color: theme.textSecondary }]}>
                                {user.phone}
                            </ThemedText>
                            <MaterialCommunityIcons
                                name="content-copy"
                                size={16}
                                color={theme.textSecondary}
                            />
                        </Pressable>
                        {subscriptionBadge && (
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`${subscriptionBadge.label}؛ مشاهدهٔ پلن‌ها و اشتراک`}
                                onPress={() => runDebouncedAction(lastPressRef, () => router.push('/(tabs)/account/plans'))}
                                style={({ pressed }) => [
                                    styles.subscriptionBadge,
                                    {
                                        backgroundColor: getPlanTierLogoBackground(subscriptionBadge.tier, appTheme),
                                        borderColor: getPlanTierColor(subscriptionBadge.tier, appTheme),
                                        opacity: pressed ? 0.8 : 1,
                                    },
                                ]}
                            >
                                <View style={[styles.subscriptionBadgeIcon, { backgroundColor: theme.surface }]}>
                                    <MaterialCommunityIcons
                                        name={subscriptionBadge.icon}
                                        size={16}
                                        color={getPlanTierColor(subscriptionBadge.tier, appTheme)}
                                    />
                                </View>
                                <ThemedText type="smallBold" style={{ color: getPlanTierLogoForeground(subscriptionBadge.tier, appTheme) }}>
                                    {subscriptionBadge.label}
                                </ThemedText>
                            </Pressable>
                        )}
                        {sessionError ? (
                            <ErrorNoticeCard
                                title="همگام‌سازی حساب کامل نشد"
                                message={sessionError}
                                onRetry={() => void handleRefreshSession()}
                                retryLabel="همگام‌سازی دوباره"
                                busy={sessionRefreshBusy}
                                busyLabel="در حال همگام‌سازی…"
                                tone="warning"
                                style={{ marginTop: Spacing.one }}
                            />
                        ) : null}
                    </View>
                ) : (
                    <View style={[styles.profileHero, styles.guestHero, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <View style={[styles.heroAvatar, { backgroundColor: theme.primary }]}>
                            <MaterialCommunityIcons name="account-outline" size={42} color={theme.onPrimary} />
                        </View>
                        <ThemedText type="largeTitle" style={styles.heroName}>پروفایل مهمان</ThemedText>
                        <ThemedText type="body" style={[styles.guestDescription, { color: theme.textSecondary }]}>
                            برای ورود یا ساخت حساب، شمارهٔ موبایل خود را تأیید کنید.
                        </ThemedText>
                        {sessionError ? (
                            <ErrorNoticeCard
                                title="بررسی ورود انجام نشد"
                                message={sessionError}
                                onRetry={() => void handleRefreshSession()}
                                retryLabel="بررسی دوباره"
                                busy={sessionRefreshBusy}
                                busyLabel="در حال بررسی…"
                                tone="warning"
                                style={{ marginTop: Spacing.one }}
                            />
                        ) : null}
                        <Pressable
                            accessibilityRole="button"
                            onPress={() => runDebouncedAction(lastPressRef, () => router.push('/auth'))}
                            style={({ pressed }) => [
                                styles.signInButton,
                                { backgroundColor: theme.primary, opacity: pressed ? 0.86 : 1 },
                            ]}
                        >
                            <ThemedText type="smallBold" style={[styles.signInButtonText, { color: theme.onPrimary }]}>
                                ورود یا ثبت‌نام
                            </ThemedText>
                            <MaterialCommunityIcons name="chevron-left" size={20} color={theme.onPrimary} />
                        </Pressable>
                    </View>
                )}

                {profileGroups.map((group) => (
                    <View key={group.title} style={styles.sectionWrap}>
                        <ThemedText type="smallBold" style={[styles.sectionTitle, { color: theme.textSecondary }]}>
                            {group.title}
                        </ThemedText>
                        <View style={[styles.actionsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                            {group.actions.map((action, index) => (
                                <Pressable
                                    key={action.key}
                                    accessibilityRole="button"
                                    onPress={() => handleUnavailableAction(action.key)}
                                    style={({ pressed }) => [
                                        styles.actionItem,
                                        index === 0 && styles.firstActionItem,
                                        {
                                            opacity: pressed ? 0.88 : 1,
                                            borderTopColor: theme.border,
                                        },
                                    ]}
                                >
                                    <View style={[styles.actionIcon, { backgroundColor: theme.primary }]}>
                                        <MaterialCommunityIcons name={action.icon} size={20} color={theme.onPrimary} />
                                    </View>
                                    <View style={styles.actionTextWrap}>
                                        <ThemedText type="smallBold" style={[styles.actionLabel, { color: theme.text }]}>
                                            {action.label}
                                        </ThemedText>
                                        <ThemedText type="small" style={[styles.actionSubtitle, { color: theme.textSecondary }]}>
                                            {action.subtitle}
                                        </ThemedText>
                                    </View>
                                    {action.key === 'app-info' ? (
                                        <View style={[styles.valuePill, { backgroundColor: theme.primary }]}>
                                            <ThemedText type="smallBold" style={[styles.valueText, { color: theme.onPrimary }]}>
                                                {appVersion}
                                            </ThemedText>
                                        </View>
                                    ) : null}
                                    {action.key === 'notifications' && unreadNotificationCount > 0 ? (
                                        <View style={[styles.valuePill, { backgroundColor: theme.primary }]}>
                                            <ThemedText type="smallBold" style={[styles.valueText, { color: theme.onPrimary }]}>
                                                {unreadNotificationCount > 99 ? '۹۹+' : unreadNotificationCount.toLocaleString('fa-IR')}
                                            </ThemedText>
                                        </View>
                                    ) : null}
                                    <MaterialCommunityIcons name="chevron-left" size={18} color={theme.textSecondary} />
                                </Pressable>
                            ))}
                        </View>
                    </View>
                ))}

                {user ? (
                    <Pressable
                        accessibilityRole="button"
                        disabled={signOutBusy}
                        onPress={() => setSignOutConfirmationVisible(true)}
                        style={({ pressed }) => [
                            styles.signOutButton,
                            {
                                backgroundColor: theme.surface,
                                borderColor: theme.border,
                                opacity: pressed || signOutBusy ? 0.72 : 1,
                            },
                        ]}
                    >
                        <MaterialCommunityIcons name="logout" size={19} color={theme.primaryText} />
                        <ThemedText type="smallBold" style={{ color: theme.primaryText }}>خروج از حساب</ThemedText>
                    </Pressable>
                ) : null}

            </ScrollView>

            <ConfirmationModal
                visible={signOutConfirmationVisible}
                title="خروج از حساب؟"
                message="از این دستگاه خارج می‌شوید. برای استفادهٔ دوباره باید وارد حساب شوید."
                confirmLabel="خروج از حساب"
                icon="logout"
                busy={signOutBusy}
                onCancel={() => setSignOutConfirmationVisible(false)}
                onConfirm={handleSignOut}
            />

            <Snackbar
                visible={snackbarVisible}
                onDismiss={() => setSnackbarVisible(false)}
                duration={5000}
                style={{ backgroundColor: theme.infoFill, borderRadius: Radius.md }}
                action={{
                    label: 'بستن',
                    onPress: () => setSnackbarVisible(false),
                    labelStyle: { color: theme.onStatus },
                }}
            >
                <ThemedText type="small" style={{ color: theme.onStatus }}>
                    {snackbarMessage}
                </ThemedText>
            </Snackbar>
            <ProfilePhotoPreview
                uri={profilePhotoUrl}
                visible={photoPreviewVisible}
                onClose={() => setPhotoPreviewVisible(false)}
            />
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: Spacing.four,
        paddingTop: Spacing.four,
        gap: Spacing.three,
    },
    profileHero: {
        borderRadius: Radius.lg,
        borderWidth: 1,
        paddingHorizontal: Spacing.four,
        paddingVertical: Spacing.five,
        alignItems: 'center',
        gap: Spacing.two,
    },
    guestHero: {
        paddingVertical: Spacing.four,
    },
    heroAvatar: {
        width: 88,
        height: 88,
        borderRadius: 44,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.one,
    },
    heroAvatarButton: {
        width: 88,
        height: 88,
        borderRadius: 44,
        marginBottom: Spacing.one,
    },
    heroName: {
        textAlign: 'center',
    },
    heroContact: {
        maxWidth: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.one,
    },
    heroPhone: {
        writingDirection: 'ltr',
        textAlign: 'left',
    },
    subscriptionBadge: {
        minHeight: 36,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.one,
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.one,
        marginTop: Spacing.one,
    },
    guestDescription: {
        textAlign: 'center',
    },
    signInButton: {
        width: '100%',
        minHeight: 48,
        borderRadius: Radius.md,
        marginTop: Spacing.one,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.two,
    },
    signInButtonText: {
        textAlign: 'center',
    },
    signOutButton: {
        minHeight: 52,
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.three,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.two,
        marginTop: Spacing.one,
    },
    sectionWrap: {
        gap: Spacing.one,
    },
    subscriptionBadgeIcon: {
        width: 26,
        height: 26,
        borderRadius: 13,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sectionTitle: {
        marginHorizontal: Spacing.one,
    },
    actionsCard: {
        borderRadius: Radius.md,
        borderWidth: 1,
        overflow: 'hidden',
    },
    actionItem: {
        minHeight: 70,
        alignItems: 'center',
        flexDirection: 'row',
        gap: Spacing.two,
        paddingHorizontal: Spacing.three,
        borderTopWidth: 1,
        borderTopColor: 'transparent',
    },
    actionItemSeparated: {
        borderTopWidth: 1,
    },
    firstActionItem: {
        borderTopWidth: 0,
    },
    actionIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionTextWrap: {
        flex: 1,
        justifyContent: 'center',
        gap: 2,
    },
    actionLabel: {},
    actionSubtitle: {
        fontSize: Typography.fontSize.compact,
        lineHeight: Typography.lineHeight.caption,
    },
    valuePill: {
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        borderRadius: 999,
    },
    valueText: {
        fontSize: Typography.fontSize.caption,
    },
});
