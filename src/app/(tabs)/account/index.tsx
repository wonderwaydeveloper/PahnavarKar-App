import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Snackbar } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import appConfig from '@/../app.json';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/hooks/use-auth';
import type { AuthDevice } from '@/services/auth-api';

type ProfileAction = {
    key: string;
    label: string;
    subtitle: string;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
};

const profileActions = [
    { key: 'edit-profile', label: 'ویرایش پروفایل', subtitle: 'تغییر اطلاعات شخصی و حساب شما', icon: 'account-edit' },
    { key: 'settings', label: 'تنظیمات', subtitle: 'ظاهر برنامه، فونت برنامه', icon: 'cog-outline' },
    { key: 'support', label: 'پشتیبانی', subtitle: 'ارتباط سریع با تیم پشتیبانی', icon: 'lifebuoy' },
    { key: 'about-us', label: 'درباره ما', subtitle: 'معرفی پروژه و اهداف ما', icon: 'information-outline' },
] satisfies ProfileAction[];

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
    const [devices, setDevices] = useState<AuthDevice[]>([]);
    const [authBusy, setAuthBusy] = useState(false);
    const { user, isLoading: authLoading, sessionError, refreshUser, getDevices, signOut, signOutAll, revokeUserDevice } = useAuth();
    const appVersion = appConfig.expo?.version ?? '1.0.0';
    const visibleDevices = user ? devices : [];

    useEffect(() => {
        let isMounted = true;
        if (!user) {
            return;
        }

        void getDevices()
            .then((activeDevices) => {
                if (isMounted) {
                    setDevices(activeDevices);
                }
            })
            .catch((error: unknown) => {
                if (isMounted) {
                    setSnackbarMessage(error instanceof Error ? error.message : 'دریافت فهرست دستگاه‌ها ناموفق بود.');
                    setSnackbarVisible(true);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [getDevices, user]);

    const handleSignOut = async (allDevices: boolean) => {
        setAuthBusy(true);
        try {
            if (allDevices) {
                await signOutAll();
            } else {
                await signOut();
            }
            setDevices([]);
        } catch (error) {
            setSnackbarMessage(error instanceof Error ? error.message : 'خروج از حساب ناموفق بود.');
            setSnackbarVisible(true);
        } finally {
            setAuthBusy(false);
        }
    };

    const handleRevokeDevice = async (device: AuthDevice) => {
        setAuthBusy(true);
        try {
            await revokeUserDevice(device.id);
            setDevices((current) => current.filter(({ id }) => id !== device.id));
        } catch (error) {
            setSnackbarMessage(error instanceof Error ? error.message : 'غیرفعال‌کردن دستگاه ناموفق بود.');
            setSnackbarVisible(true);
        } finally {
            setAuthBusy(false);
        }
    };

    const handleUnavailableAction = (key: string) => {
        if (key === 'settings' || key === 'about-us' || key === 'app-info') {
            runDebouncedAction(lastPressRef, () => router.push(`/(tabs)/account/${key}` as any));
            return;
        }

        runDebouncedAction(lastPressRef, () => {
            setSnackbarMessage('به زودی فعال می‌شود');
            setSnackbarVisible(true);
        });
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
                <View style={styles.sectionWrap}>
                    <ThemedText type="smallBold" style={[styles.sectionTitle, { color: theme.text }]}>حساب کاربری</ThemedText>
                    <View style={[styles.profileCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <View style={styles.guestCard}>
                            <View style={[styles.guestIcon, { backgroundColor: theme.primaryContainer }]}>
                                <MaterialCommunityIcons
                                    name={user ? 'account-check-outline' : 'account-outline'}
                                    size={30}
                                    color={theme.primaryText}
                                />
                            </View>
                            {authLoading ? (
                                <ThemedText type="body" style={[styles.guestDescription, { color: theme.textSecondary }]}>
                                    در حال بررسی وضعیت حساب...
                                </ThemedText>
                            ) : user ? (
                                <>
                                    <ThemedText type="largeTitle" style={styles.guestTitle}>{user.name}</ThemedText>
                                    <ThemedText type="body" style={[styles.guestDescription, { color: theme.textSecondary }]}>
                                        {user.phone}
                                    </ThemedText>
                                    <ThemedText type="small" style={[styles.guestDescription, { color: theme.textSecondary }]}>
                                        {user.email}
                                    </ThemedText>
                                    {sessionError ? (
                                        <>
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
                                                <ThemedText type="smallBold" style={{ color: theme.primaryText }}>
                                                    تلاش دوباره
                                                </ThemedText>
                                            </Pressable>
                                        </>
                                    ) : null}
                                    <View style={styles.deviceList}>
                                        <ThemedText type="smallBold" style={{ color: theme.text }}>
                                            دستگاه‌های فعال
                                        </ThemedText>
                                        {visibleDevices.map((device) => (
                                            <View
                                                key={device.id}
                                                style={[styles.deviceItem, { borderTopColor: theme.border }]}
                                            >
                                                <View style={styles.actionTextWrap}>
                                                    <ThemedText type="smallBold" style={{ color: theme.text }}>
                                                        {device.device_name || 'دستگاه موبایل'}
                                                    </ThemedText>
                                                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                                        آخرین فعالیت:{' '}
                                                        {device.last_activity
                                                            ? new Date(device.last_activity).toLocaleString('fa-IR')
                                                            : 'نامشخص'}
                                                    </ThemedText>
                                                </View>
                                                <Pressable
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`غیرفعال‌کردن ${device.device_name || 'دستگاه'}`}
                                                    disabled={authBusy}
                                                    onPress={() => void handleRevokeDevice(device)}
                                                >
                                                    <MaterialCommunityIcons name="logout" size={20} color={theme.error} />
                                                </Pressable>
                                            </View>
                                        ))}
                                        {visibleDevices.length === 0 ? (
                                            <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                                دستگاه فعالی پیدا نشد.
                                            </ThemedText>
                                        ) : null}
                                    </View>
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={authBusy}
                                        onPress={() => void handleSignOut(false)}
                                        style={({ pressed }) => [
                                            styles.signInButton,
                                            { backgroundColor: theme.primary, opacity: pressed || authBusy ? 0.72 : 1 },
                                        ]}
                                    >
                                        <ThemedText type="smallBold" style={[styles.signInButtonText, { color: theme.onPrimary }]}>
                                            خروج از این دستگاه
                                        </ThemedText>
                                        <MaterialCommunityIcons name="logout" size={20} color={theme.onPrimary} />
                                    </Pressable>
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={authBusy}
                                        onPress={() => void handleSignOut(true)}
                                        style={styles.secondaryAction}
                                    >
                                        <ThemedText type="smallBold" style={{ color: theme.error }}>
                                            خروج از همهٔ دستگاه‌ها
                                        </ThemedText>
                                    </Pressable>
                                </>
                            ) : (
                                <>
                                    <ThemedText type="largeTitle" style={styles.guestTitle}>پروفایل مهمان</ThemedText>
                                    <ThemedText type="body" style={[styles.guestDescription, { color: theme.textSecondary }]}>
                                        برای ورود یا ساخت حساب، شمارهٔ موبایل خود را تأیید کنید.
                                    </ThemedText>
                                    {sessionError ? (
                                        <>
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
                                                <ThemedText type="smallBold" style={{ color: theme.primaryText }}>
                                                    تلاش دوباره
                                                </ThemedText>
                                            </Pressable>
                                        </>
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
                                </>
                            )}
                        </View>
                    </View>
                </View>

                <View style={styles.sectionWrap}>
                    <ThemedText type="smallBold" style={[styles.sectionTitle, { color: theme.text }]}>اطلاعات برنامه</ThemedText>

                    <Pressable
                        onPress={() => runDebouncedAction(lastPressRef, () => router.push('/(tabs)/account/app-info' as any))}
                        style={({ pressed }) => [
                            styles.appInfoListItem,
                            {
                                backgroundColor: theme.surface,
                                borderColor: theme.border,
                                opacity: pressed ? 0.88 : 1,
                            },
                        ]}
                    >
                        <View style={[styles.actionIcon, { backgroundColor: theme.primaryContainer }]}>
                            <MaterialCommunityIcons name="information-outline" size={20} color={theme.primaryText} />
                        </View>

                        <View style={styles.actionTextWrap}>
                            <ThemedText type="smallBold" style={[styles.actionLabel, { color: theme.text }]}>
                                اطلاعات برنامه
                            </ThemedText>
                            <ThemedText type="small" style={[styles.actionSubtitle, { color: theme.textSecondary }]}>
                                نام، نسخه و وضعیت برنامه
                            </ThemedText>
                        </View>

                        <View style={[styles.valuePill, { backgroundColor: theme.primaryContainer, borderColor: theme.border }]}>
                            <ThemedText type="smallBold" style={[styles.valueText, { color: theme.primaryText }]}>
                                {appVersion}
                            </ThemedText>
                        </View>

                        <MaterialCommunityIcons name="chevron-left" size={18} color={theme.textSecondary} />
                    </Pressable>
                </View>

                <View style={styles.sectionWrap}>
                    <ThemedText type="smallBold" style={[styles.sectionTitle, { color: theme.text }]}>فعالیت‌ها</ThemedText>

                    <View style={[styles.actionsCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        {profileActions.map((action, index) => (
                            <Pressable
                                key={action.key}
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

                                <MaterialCommunityIcons name="chevron-left" size={18} color={theme.textSecondary} />
                            </Pressable>
                        ))}
                    </View>
                </View>

            </ScrollView>

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
    profileCard: {
        borderRadius: Radius.md,
        borderWidth: 1,
        overflow: 'hidden',
    },
    guestCard: {
        alignItems: 'center',
        padding: Spacing.four,
        gap: Spacing.two,
    },
    guestIcon: {
        width: 64,
        height: 64,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
    guestTitle: {
        textAlign: 'center',
    },
    guestDescription: {
        textAlign: 'center',
    },
    deviceList: {
        width: '100%',
        gap: Spacing.one,
        marginTop: Spacing.two,
    },
    deviceItem: {
        minHeight: 54,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
        paddingTop: Spacing.two,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    secondaryAction: {
        paddingVertical: Spacing.two,
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
    appInfoCard: {
        borderRadius: Radius.md,
        borderWidth: 1,
        padding: Spacing.three,
        gap: Spacing.two,
    },
    appInfoListItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.three,
        borderRadius: 20,
        borderWidth: 1,
    },
    sectionWrap: {
        gap: Spacing.one,
    },
    actionsCard: {
        borderRadius: Radius.md,
        borderWidth: 1,
        overflow: 'hidden',
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.one,
    },
    sectionTitle: {
        marginBottom: Spacing.one,
    },
    appInfoRows: {
        gap: Spacing.one,
    },
    appInfoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        paddingTop: Spacing.three,
        paddingBottom: Spacing.one,
    },
    actionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.three,
        borderTopWidth: 1,
    },
    actionItemSeparated: {
        borderTopWidth: 1,
    },
    firstActionItem: {
        borderTopWidth: 0,
    },
    actionIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionTextWrap: {
        flex: 1,
        gap: Spacing.one,
    },
    actionLabel: {
        flex: 1,
    },
    actionSubtitle: {
        fontSize: 14,
        lineHeight: 20,
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
