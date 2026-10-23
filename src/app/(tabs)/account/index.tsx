import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Snackbar } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import appConfig from '@/../app.json';

import { ConfirmationModal } from '@/components/confirmation-modal';
import { ProfilePhotoPreview } from '@/components/profile-photo-preview';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/hooks/use-auth';
import { getProfilePhotoUrl } from '@/services/auth-api';

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
            { key: 'edit-profile', label: 'ویرایش پروفایل', subtitle: 'نام، ایمیل و تصویر پروفایل', icon: 'account-edit' },
            { key: 'privacy-security', label: 'حریم خصوصی و امنیت', subtitle: 'نشست‌ها، دستگاه‌ها و امنیت حساب', icon: 'shield-lock-outline' },
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
    const [signOutConfirmationVisible, setSignOutConfirmationVisible] = useState(false);
    const [photoPreviewVisible, setPhotoPreviewVisible] = useState(false);
    const { user, isLoading: authLoading, sessionError, refreshUser, signOut } = useAuth();
    const appVersion = appConfig.expo?.version ?? '1.0.0';
    const profilePhotoUrl = getProfilePhotoUrl(user?.profile_photo_path ?? null);

    const handleUnavailableAction = (key: string) => {
        if (key === 'edit-profile' || key === 'privacy-security') {
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
            setSnackbarMessage(error instanceof Error ? error.message : 'خروج از حساب ناموفق بود.');
            setSnackbarVisible(true);
        } finally {
            setSignOutBusy(false);
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
                            <View style={[styles.heroAvatar, { backgroundColor: theme.primaryContainer }]}>
                                <MaterialCommunityIcons name="account-outline" size={42} color={theme.primaryText} />
                            </View>
                        )}
                        <ThemedText type="largeTitle" style={styles.heroName}>{user.name}</ThemedText>
                        <View style={styles.heroContact}>
                            <MaterialCommunityIcons
                                accessibilityLabel="شمارهٔ تلفن"
                                name="cellphone"
                                size={18}
                                color={theme.textSecondary}
                            />
                            <ThemedText type="body" style={[styles.heroPhone, { color: theme.textSecondary }]}>
                                {user.phone}
                            </ThemedText>
                        </View>
                        {user.email ? (
                            <View style={styles.heroContact}>
                                <MaterialCommunityIcons
                                    accessibilityLabel={user.email_verified_at ? 'ایمیل تأییدشده' : 'ایمیل تأییدنشده'}
                                    name={user.email_verified_at ? 'check-decagram' : 'email-alert-outline'}
                                    size={16}
                                    color={user.email_verified_at ? theme.success : theme.warning}
                                />
                                <ThemedText type="small" style={[styles.heroEmail, { color: theme.textSecondary }]}>
                                    {user.email}
                                </ThemedText>
                            </View>
                        ) : null}
                        {sessionError ? (
                            <View style={styles.syncError}>
                                <ThemedText type="small" style={{ color: theme.error }}>
                                    همگام‌سازی حساب ناموفق بود: {sessionError}
                                </ThemedText>
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={() => void refreshUser().catch((error: unknown) => {
                                        setSnackbarMessage(error instanceof Error ? error.message : 'همگام‌سازی حساب ناموفق بود.');
                                        setSnackbarVisible(true);
                                    })}
                                >
                                    <ThemedText type="smallBold" style={{ color: theme.primaryText }}>تلاش دوباره</ThemedText>
                                </Pressable>
                            </View>
                        ) : null}
                    </View>
                ) : (
                    <View style={[styles.profileHero, styles.guestHero, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <View style={[styles.heroAvatar, { backgroundColor: theme.primaryContainer }]}>
                            <MaterialCommunityIcons name="account-outline" size={42} color={theme.primaryText} />
                        </View>
                        <ThemedText type="largeTitle" style={styles.heroName}>پروفایل مهمان</ThemedText>
                        <ThemedText type="body" style={[styles.guestDescription, { color: theme.textSecondary }]}>
                            برای ورود یا ساخت حساب، شمارهٔ موبایل خود را تأیید کنید.
                        </ThemedText>
                        {sessionError ? (
                            <View style={styles.syncError}>
                                <ThemedText type="small" style={{ color: theme.error }}>
                                    بازیابی نشست ناموفق بود: {sessionError}
                                </ThemedText>
                                <Pressable
                                    accessibilityRole="button"
                                    onPress={() => void refreshUser().catch((error: unknown) => {
                                        setSnackbarMessage(error instanceof Error ? error.message : 'بازیابی نشست ناموفق بود.');
                                        setSnackbarVisible(true);
                                    })}
                                >
                                    <ThemedText type="smallBold" style={{ color: theme.primaryText }}>تلاش دوباره</ThemedText>
                                </Pressable>
                            </View>
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
                                    <View style={[styles.actionIcon, { backgroundColor: theme.primaryContainer }]}>
                                        <MaterialCommunityIcons name={action.icon} size={20} color={theme.primaryText} />
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
                                        <View style={[styles.valuePill, { backgroundColor: theme.primaryContainer }]}>
                                            <ThemedText type="smallBold" style={[styles.valueText, { color: theme.primaryText }]}>
                                                {appVersion}
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
    heroEmail: {
        writingDirection: 'ltr',
        textAlign: 'left',
        flexShrink: 1,
    },
    syncError: {
        alignItems: 'center',
        gap: Spacing.one,
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
        fontSize: 13,
        lineHeight: 18,
    },
    valuePill: {
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        borderRadius: 999,
    },
    valueText: {
        fontSize: 11,
    },
});
