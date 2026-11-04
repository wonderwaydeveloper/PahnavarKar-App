import { Typography } from '@/constants/typography';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { getUserFacingErrorMessage } from '@/services/user-facing-error';
import { formatPersianDate } from '@/utils/persian-date';

const CAPABILITY_LABELS: Record<string, string> = {
    financial: 'امور مالی',
    profile: 'ویرایش پروفایل',
    security: 'امنیت حساب',
};

function formatDate(value: string | null | undefined): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return formatPersianDate(date, { dateStyle: 'medium', timeStyle: 'short' });
}

export function AccountAccessBanner() {
    const theme = useTheme();
    const { user, accountSuspension } = useAuth();
    const capabilities = user?.restricted_capabilities ?? [];
    if (accountSuspension || capabilities.length === 0) return null;

    const expiry = formatDate(user?.restricted_until);
    const labels = capabilities.map((key) => CAPABILITY_LABELS[key] ?? key);
    return (
        <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={[styles.banner, { backgroundColor: theme.warningFill }]}
        >
            <MaterialCommunityIcons name="account-lock-outline" size={22} color={theme.onWarning} />
            <View style={styles.bannerContent}>
                <ThemedText type="smallBold" style={{ color: theme.onWarning }}>
                    برخی دسترسی‌های حساب شما محدود شده است
                </ThemedText>
                <ThemedText type="small" style={{ color: theme.onWarning }}>
                    {labels.join('، ')}{expiry ? ` · پایان: ${expiry}` : ' · تا رفع دستی'}
                </ThemedText>
                {user?.restriction_reason ? (
                    <ThemedText type="small" style={{ color: theme.onWarning }}>
                        دلیل: {user.restriction_reason}
                    </ThemedText>
                ) : null}
            </View>
        </View>
    );
}

export function AccountSuspensionOverlay() {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const { accountSuspension, refreshUser, signOut } = useAuth();
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);

    if (!accountSuspension) return null;

    const expiry = formatDate(accountSuspension.until);
    const checkStatus = async () => {
        if (busy) return;
        setBusy(true);
        setActionError(null);
        try {
            await refreshUser();
        } catch (error) {
            const message = getUserFacingErrorMessage(error, 'بررسی وضعیت حساب انجام نشد.');
            if (!message.startsWith('دسترسی حساب شما به‌طور کامل تعلیق شده')) setActionError(message);
        } finally {
            setBusy(false);
        }
    };

    const logOut = async () => {
        if (busy) return;
        setBusy(true);
        setActionError(null);
        try {
            await signOut();
        } catch (error) {
            setActionError(getUserFacingErrorMessage(error, 'خروج از حساب ناموفق بود.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <View
            accessibilityViewIsModal
            style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: theme.background, paddingTop: insets.top + Spacing.four, paddingBottom: insets.bottom + Spacing.four }]}
        >
            <View style={[styles.suspensionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.suspensionIcon, { backgroundColor: theme.errorFill }]}>
                    <MaterialCommunityIcons name="account-cancel-outline" size={34} color={theme.onErrorFill} />
                </View>
                <ThemedText accessibilityRole="header" type="largeTitle" style={[styles.title, { color: theme.text }]}>
                    حساب شما در حالت تعلیق است
                </ThemedText>
                <ThemedText type="body" style={[styles.description, { color: theme.textSecondary }]}>
                    در مدت تعلیق امکان استفاده از بخش‌های برنامه وجود ندارد. پس از پایان زمان تعیین‌شده یا فعال‌سازی توسط مدیر، دوباره وضعیت را بررسی کنید.
                </ThemedText>
                {accountSuspension.reason ? (
                    <View style={[styles.detail, { backgroundColor: theme.surfaceVariant }]}>
                        <ThemedText type="smallBold" style={{ color: theme.text }}>دلیل تعلیق</ThemedText>
                        <ThemedText type="small" style={[styles.detailText, { color: theme.textSecondary }]}>{accountSuspension.reason}</ThemedText>
                    </View>
                ) : null}
                <View style={[styles.detail, { backgroundColor: theme.surfaceVariant }]}>
                    <ThemedText type="smallBold" style={{ color: theme.text }}>زمان پایان</ThemedText>
                    <ThemedText type="small" style={[styles.detailText, { color: theme.textSecondary }]}>
                        {expiry ?? 'تا فعال‌سازی دستی'}
                    </ThemedText>
                </View>
                {actionError ? (
                    <ThemedText accessibilityRole="alert" type="small" style={[styles.actionError, { color: theme.error }]}>
                        {actionError}
                    </ThemedText>
                ) : null}
                <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void checkStatus()}
                    style={({ pressed }) => [styles.primaryButton, { backgroundColor: theme.primary, opacity: busy || pressed ? 0.75 : 1 }]}
                >
                    {busy ? <ActivityIndicator color={theme.onPrimary} /> : <MaterialCommunityIcons name="refresh" size={20} color={theme.onPrimary} />}
                    <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
                        {busy ? 'در حال بررسی…' : 'بررسی دوباره'}
                    </ThemedText>
                </Pressable>
                <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void logOut()}
                    style={({ pressed }) => [styles.secondaryButton, { borderColor: theme.border, opacity: busy || pressed ? 0.65 : 1 }]}
                >
                    <ThemedText type="smallBold" style={{ color: theme.text }}>خروج از حساب</ThemedText>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    banner: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.three,
        paddingHorizontal: Spacing.four,
        paddingVertical: Spacing.three,
    },
    bannerContent: { flex: 1, gap: 3 },
    overlay: {
        zIndex: 20,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.four,
    },
    suspensionCard: {
        width: '100%',
        maxWidth: 480,
        alignItems: 'center',
        gap: Spacing.three,
        borderWidth: 1,
        borderRadius: 24,
        padding: Spacing.five,
    },
    suspensionIcon: {
        width: 68,
        height: 68,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 22,
    },
    title: { textAlign: 'center' },
    description: { textAlign: 'center', lineHeight: Typography.lineHeight.spacious },
    detail: {
        width: '100%',
        gap: Spacing.one,
        borderRadius: 14,
        padding: Spacing.three,
    },
    detailText: { lineHeight: Typography.lineHeight.label },
    actionError: { width: '100%', lineHeight: Typography.lineHeight.label, textAlign: 'center' },
    primaryButton: {
        width: '100%',
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.two,
        borderRadius: 14,
        paddingHorizontal: Spacing.four,
    },
    secondaryButton: {
        width: '100%',
        minHeight: 46,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderRadius: 14,
        paddingHorizontal: Spacing.four,
    },
});
