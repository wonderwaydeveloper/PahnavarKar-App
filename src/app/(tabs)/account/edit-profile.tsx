import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Snackbar } from 'react-native-paper';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppTextInput } from '@/components/app-text';
import { ProfilePhotoPreview } from '@/components/profile-photo-preview';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { getProfilePhotoUrl } from '@/services/auth-api';

function toLatinDigits(value: string) {
    return value.replace(/[۰-۹٠-٩]/g, (digit) =>
        String.fromCharCode(
            digit.charCodeAt(0) >= 0x06f0 && digit.charCodeAt(0) <= 0x06f9
                ? digit.charCodeAt(0) - 0x06f0 + 48
                : digit.charCodeAt(0) - 0x0660 + 48,
        ),
    );
}

export default function EditProfileScreen() {
    const theme = useTheme();
    const router = useRouter();
    const {
        user,
        updateProfile,
        uploadProfilePhoto,
        removeProfilePhoto,
        sendEmailVerificationCode,
        verifyEmail,
    } = useAuth();
    const [name, setName] = useState(user?.name ?? '');
    const [email, setEmail] = useState(user?.pending_email ?? user?.email ?? '');
    const [photoUri, setPhotoUri] = useState<string | null>(null);
    const [photoPreviewVisible, setPhotoPreviewVisible] = useState(false);
    const [photoRemoved, setPhotoRemoved] = useState(false);
    const [emailCode, setEmailCode] = useState('');
    const [emailCodeSent, setEmailCodeSent] = useState(false);
    const [emailCodeFocused, setEmailCodeFocused] = useState(false);
    const [emailResendSeconds, setEmailResendSeconds] = useState(0);
    const [saving, setSaving] = useState(false);
    const [emailAction, setEmailAction] = useState<'send' | 'verify' | null>(null);
    const [snackbar, setSnackbar] = useState('');
    const [snackbarKind, setSnackbarKind] = useState<'success' | 'error'>('success');
    const busy = saving || emailAction !== null;

    const showMessage = (message: string, kind: 'success' | 'error' = 'success') => {
        setSnackbarKind(kind);
        setSnackbar(message);
    };

    const normalizedEmail = email.trim().toLowerCase();
    const emailVerified = Boolean(
        user?.email_verified_at && user.email?.toLowerCase() === normalizedEmail,
    );
    const hasUnsavedChanges = Boolean(
        user && (
            name.trim() !== user.name ||
            normalizedEmail !== (user.pending_email?.trim().toLowerCase() ?? user.email?.trim().toLowerCase() ?? '') ||
            photoUri !== null ||
            photoRemoved
        ),
    );
    const pendingEmailMatchesInput = Boolean(
        user?.pending_email && user.pending_email.toLowerCase() === normalizedEmail,
    );

    useEffect(() => {
        if (emailResendSeconds <= 0) return;

        const timer = setTimeout(() => {
            setEmailResendSeconds((seconds) => Math.max(0, seconds - 1));
        }, 1000);

        return () => clearTimeout(timer);
    }, [emailResendSeconds]);

    const choosePhoto = async () => {
        setSnackbar('');
        try {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) {
                showMessage('برای انتخاب تصویر پروفایل، دسترسی به تصاویر را مجاز کنید.', 'error');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.85,
            });

            if (!result.canceled) {
                setPhotoUri(result.assets[0]?.uri ?? null);
                setPhotoRemoved(false);
            }
        } catch (pickerError) {
            showMessage(pickerError instanceof Error ? pickerError.message : 'انتخاب تصویر پروفایل ناموفق بود.', 'error');
        }
    };

    const save = async () => {
        if (!user || busy || !hasUnsavedChanges) {
            return;
        }
        if (!name.trim()) {
            showMessage('نام و نام خانوادگی را وارد کنید.', 'error');
            return;
        }
        if (!email.trim() && (user.email || user.pending_email)) {
            showMessage('پس از ثبت ایمیل، امکان حذف آن وجود ندارد؛ فقط می‌توانید آن را ویرایش کنید.', 'error');
            return;
        }
        if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            showMessage('نشانی ایمیل معتبر وارد کنید.', 'error');
            return;
        }

        setSaving(true);
        setSnackbar('');
        try {
            await updateProfile({
                name: name.trim(),
                email: email.trim() ? email.trim().toLowerCase() : null,
            });
            if (photoUri) {
                try {
                    await uploadProfilePhoto(photoUri);
                } catch (photoError) {
                    showMessage(
                        `اطلاعات متنی ذخیره شد، اما تصویر بارگذاری نشد: ${photoError instanceof Error ? photoError.message : 'خطای نامشخص'}`,
                        'error',
                    );
                    return;
                }
            } else if (photoRemoved) {
                await removeProfilePhoto();
            }
            router.back();
        } catch (saveError) {
            showMessage(saveError instanceof Error ? saveError.message : 'ذخیرهٔ اطلاعات پروفایل ناموفق بود.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const sendVerificationCode = async () => {
        if (!user || busy) return;
        if (!name.trim()) {
            showMessage('نام و نام خانوادگی را وارد کنید.', 'error');
            return;
        }
        if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            showMessage('برای تأیید، ابتدا نشانی ایمیل معتبر وارد کنید.', 'error');
            return;
        }

        setEmailAction('send');
        setSnackbar('');
        try {
            await updateProfile({ name: name.trim(), email: normalizedEmail });
            const response = await sendEmailVerificationCode();
            setEmailCode('');
            setEmailCodeSent(true);
            setEmailResendSeconds(response.resend_after);
            showMessage(`کد تأیید به ${normalizedEmail} ارسال شد. ${response.resend_after} ثانیه تا ارسال دوباره صبر کنید.`);
        } catch (requestError) {
            showMessage(requestError instanceof Error ? requestError.message : 'ارسال کد تأیید ایمیل ناموفق بود.', 'error');
        } finally {
            setEmailAction(null);
        }
    };

    const confirmEmail = async () => {
        const code = toLatinDigits(emailCode).replace(/\D/g, '');
        if (!/^\d{6}$/.test(code)) {
            showMessage('کد تأیید ایمیل باید شش رقم باشد.', 'error');
            return;
        }

        setEmailAction('verify');
        setSnackbar('');
        try {
            await verifyEmail(code);
            setEmailCodeSent(false);
            setEmailCode('');
            showMessage('نشانی ایمیل با موفقیت تأیید شد.');
        } catch (verificationError) {
            showMessage(verificationError instanceof Error ? verificationError.message : 'تأیید ایمیل ناموفق بود.', 'error');
        } finally {
            setEmailAction(null);
        }
    };

    if (!user) {
        return (
            <ThemedView style={styles.container}>
                <ThemedText type="body">برای ویرایش پروفایل ابتدا وارد حساب شوید.</ThemedText>
            </ThemedView>
        );
    }

    const photoPreviewUri = photoUri ?? (photoRemoved ? null : getProfilePhotoUrl(user.profile_photo_path));
    const photoSource = photoPreviewUri ? { uri: photoPreviewUri } : null;

    return (
        <ThemedView style={styles.container}>
            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
                <View style={[styles.profileHero, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <View style={[styles.avatar, { backgroundColor: theme.primaryContainer }]}>
                        {photoSource ? (
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="پیش‌نمایش تصویر پروفایل"
                                disabled={busy}
                                onPress={() => setPhotoPreviewVisible(true)}
                            >
                                <Image source={photoSource} contentFit="cover" style={styles.avatarImage} />
                            </Pressable>
                        ) : (
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="انتخاب تصویر پروفایل"
                                disabled={busy}
                                onPress={() => void choosePhoto()}
                                style={styles.avatarPlaceholder}
                            >
                                <MaterialCommunityIcons name="account-outline" size={36} color={theme.primaryText} />
                            </Pressable>
                        )}
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="تغییر تصویر پروفایل"
                            disabled={busy}
                            onPress={() => void choosePhoto()}
                            style={[styles.cameraBadge, { backgroundColor: theme.primary }]}
                        >
                            <MaterialCommunityIcons name="camera-outline" size={16} color={theme.onPrimary} />
                        </Pressable>
                        {(user.profile_photo_path || photoUri) && !photoRemoved ? (
                            <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="حذف تصویر پروفایل"
                                disabled={busy}
                                onPress={() => {
                                    setPhotoUri(null);
                                    setPhotoRemoved(true);
                                }}
                                style={[styles.removePhotoBadge, { backgroundColor: theme.primary }]}
                            >
                                <MaterialCommunityIcons name="trash-can-outline" size={17} color={theme.onPrimary} />
                            </Pressable>
                        ) : null}
                    </View>
                    <ThemedText type="largeTitle" style={styles.heroName}>{user.name}</ThemedText>
                    <View style={styles.heroContact}>
                        <MaterialCommunityIcons name="cellphone" size={17} color={theme.textSecondary} />
                        <ThemedText type="body" style={[styles.heroPhone, { color: theme.textSecondary }]}>
                            {user.phone}
                        </ThemedText>
                    </View>
                </View>

                <View style={styles.section}>
                    <View style={styles.sectionHeading}>
                        <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>اطلاعات حساب</ThemedText>
                        <ThemedText type="small" style={{ color: theme.textMuted }}>
                            نام و ایمیل قابل مشاهده در حساب شما
                        </ThemedText>
                    </View>
                    <View style={[styles.formCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <View style={styles.field}>
                            <ThemedText type="smallBold">نام و نام خانوادگی</ThemedText>
                            <AppTextInput
                                accessibilityLabel="نام و نام خانوادگی"
                                autoComplete="name"
                                onChangeText={setName}
                                placeholder="نام و نام خانوادگی"
                                placeholderTextColor={theme.textMuted}
                                value={name}
                                style={[
                                    styles.input,
                                    { backgroundColor: theme.surfaceVariant, borderColor: theme.border, color: theme.text },
                                ]}
                            />
                        </View>

                        <View style={[styles.field, styles.fieldSeparated, { borderColor: theme.border }]}>
                            <ThemedText type="smallBold">ایمیل (اختیاری)</ThemedText>
                            <AppTextInput
                                accessibilityLabel="ایمیل"
                                autoCapitalize="none"
                                autoComplete="email"
                                keyboardType="email-address"
                                onChangeText={(value) => {
                                    setEmail(value);
                                    setEmailCode('');
                                    setEmailCodeSent(false);
                                    setEmailResendSeconds(0);
                                }}
                                placeholder="name@example.com"
                                placeholderTextColor={theme.textMuted}
                                value={email}
                                style={[
                                    styles.input,
                                    {
                                        backgroundColor: theme.surfaceVariant,
                                        borderColor: theme.border,
                                        color: theme.text,
                                        writingDirection: 'ltr',
                                        textAlign: 'left',
                                    },
                                ]}
                            />
                            <View style={styles.emailStatus}>
                                <MaterialCommunityIcons
                                    name={emailVerified ? 'check-decagram-outline' : 'email-alert-outline'}
                                    size={18}
                                    color={emailVerified ? theme.success : theme.textSecondary}
                                />
                                <ThemedText type="small" style={{ color: emailVerified ? theme.success : theme.textSecondary }}>
                                    {emailVerified
                                        ? 'ایمیل تأیید شده است.'
                                        : pendingEmailMatchesInput
                                            ? 'ایمیل فعلی تا تأیید این نشانی حفظ می‌شود.'
                                        : normalizedEmail ? 'ایمیل هنوز تأیید نشده است.' : 'ایمیلی ثبت نشده است.'}
                                </ThemedText>
                            </View>
                            {normalizedEmail && !emailVerified ? (
                                <>
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={busy || emailResendSeconds > 0}
                                        onPress={() => void sendVerificationCode()}
                                        style={({ pressed }) => [
                                            styles.verifyEmailButton,
                                            {
                                                backgroundColor: theme.primaryContainer,
                                                borderColor: theme.border,
                                                opacity: pressed || emailAction === 'send' ? 0.72 : 1,
                                            },
                                        ]}
                                    >
                                        {emailAction === 'send' ? <ActivityIndicator size="small" color={theme.primaryText} /> : null}
                                        <ThemedText type="smallBold" style={{ color: theme.primaryText }}>
                                            {emailAction === 'send'
                                                ? 'در حال ارسال...'
                                                : emailResendSeconds > 0
                                                    ? `ارسال دوبارهٔ کد تا ${emailResendSeconds} ثانیه`
                                                    : emailCodeSent ? 'ارسال دوبارهٔ کد' : 'ارسال کد تأیید ایمیل'}
                                        </ThemedText>
                                    </Pressable>
                                    {emailCodeSent ? (
                                        <View style={styles.field}>
                                            <ThemedText type="smallBold" style={styles.emailCodeLabel}>
                                                کد ۶ رقمی ارسال‌شده به ایمیل
                                            </ThemedText>
                                            <AppTextInput
                                                accessibilityLabel="کد تأیید ایمیل"
                                                autoComplete="one-time-code"
                                                keyboardType="number-pad"
                                                maxLength={6}
                                                onBlur={() => setEmailCodeFocused(false)}
                                                onChangeText={(value) => setEmailCode(toLatinDigits(value).replace(/\D/g, '').slice(0, 6))}
                                                onFocus={() => setEmailCodeFocused(true)}
                                                placeholder="••••••"
                                                placeholderTextColor={theme.textMuted}
                                                textAlign="center"
                                                underlineColorAndroid="transparent"
                                                value={emailCode}
                                                style={[
                                                    styles.codeInput,
                                                    {
                                                        backgroundColor: theme.surface,
                                                        borderColor: emailCodeFocused ? theme.primary : theme.border,
                                                        color: theme.text,
                                                        direction: 'ltr',
                                                        writingDirection: 'ltr',
                                                        textAlign: 'center',
                                                    },
                                                ]}
                                            />
                                            <Pressable
                                                accessibilityRole="button"
                                                disabled={busy}
                                                onPress={() => void confirmEmail()}
                                                style={({ pressed }) => [
                                                    styles.verifyEmailButton,
                                                    {
                                                        backgroundColor: theme.primary,
                                                        borderColor: theme.primary,
                                                        opacity: pressed || emailAction === 'verify' ? 0.72 : 1,
                                                    },
                                                ]}
                                            >
                                                {emailAction === 'verify' ? <ActivityIndicator size="small" color={theme.onPrimary} /> : null}
                                                <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
                                                    {emailAction === 'verify' ? 'در حال بررسی...' : 'تأیید ایمیل'}
                                                </ThemedText>
                                            </Pressable>
                                        </View>
                                    ) : null}
                                </>
                            ) : null}
                        </View>

                        <View style={[styles.field, styles.fieldSeparated, { borderColor: theme.border }]}>
                            <ThemedText type="smallBold">شمارهٔ تأییدشده</ThemedText>
                            <View style={[styles.readOnlyField, { backgroundColor: theme.surfaceVariant }]}>
                                <ThemedText type="body" style={[styles.phoneValue, { color: theme.textSecondary }]}>
                                    {user.phone}
                                </ThemedText>
                                <MaterialCommunityIcons name="check-decagram-outline" size={20} color={theme.success} />
                            </View>
                            <ThemedText type="small" style={{ color: theme.textSecondary }}>
                                تغییر شماره از بخش «حریم خصوصی و امنیت» و پس از تأیید OTP انجام می‌شود.
                            </ThemedText>
                        </View>
                    </View>
                </View>

                <Pressable
                    accessibilityRole="button"
                    disabled={busy || !hasUnsavedChanges}
                    onPress={() => void save()}
                    style={({ pressed }) => [
                        styles.saveButton,
                        {
                            backgroundColor: hasUnsavedChanges ? theme.primary : theme.surfaceVariant,
                            opacity: pressed || busy ? 0.72 : 1,
                        },
                    ]}
                >
                    {saving ? (
                        <ActivityIndicator size="small" color={theme.onPrimary} />
                    ) : null}
                    <ThemedText
                        type="smallBold"
                        style={{ color: hasUnsavedChanges ? theme.onPrimary : theme.textMuted }}
                    >
                        {saving ? 'در حال ذخیره...' : 'ذخیرهٔ تغییرات'}
                    </ThemedText>
                </Pressable>
            </ScrollView>
            <ProfilePhotoPreview
                uri={photoPreviewUri}
                visible={photoPreviewVisible}
                onClose={() => setPhotoPreviewVisible(false)}
            />
            <Snackbar
                visible={Boolean(snackbar)}
                onDismiss={() => setSnackbar('')}
                duration={4500}
                style={{
                    backgroundColor: snackbarKind === 'error' ? theme.errorFill : theme.successFill,
                    borderRadius: Radius.md,
                }}
                action={{
                    label: 'بستن',
                    onPress: () => setSnackbar(''),
                    labelStyle: { color: theme.onStatus },
                }}
            >
                <ThemedText
                    type="small"
                    accessibilityRole={snackbarKind === 'error' ? 'alert' : undefined}
                    style={{ color: theme.onStatus }}
                >
                    {snackbar}
                </ThemedText>
            </Snackbar>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    content: { padding: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.four },
    profileHero: {
        borderWidth: 1,
        borderRadius: Radius.lg,
        paddingHorizontal: Spacing.four,
        paddingVertical: Spacing.five,
        alignItems: 'center',
        gap: Spacing.two,
    },
    avatar: {
        width: 96,
        height: 96,
        alignSelf: 'center',
        borderRadius: 48,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.one,
    },
    avatarImage: { width: 96, height: 96, borderRadius: 48 },
    avatarPlaceholder: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
    cameraBadge: { position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    removePhotoBadge: { position: 'absolute', bottom: 0, left: 0, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
    heroName: { textAlign: 'center' },
    heroContact: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
    heroPhone: { writingDirection: 'ltr', textAlign: 'left' },
    section: { gap: Spacing.one },
    sectionHeading: { marginHorizontal: Spacing.one, gap: 2 },
    formCard: { borderWidth: 1, borderRadius: Radius.lg, overflow: 'hidden' },
    field: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, gap: Spacing.one },
    emailCodeLabel: { paddingHorizontal: Spacing.one },
    fieldSeparated: { borderTopWidth: 1 },
    emailStatus: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
    verifyEmailButton: { minHeight: 44, borderWidth: 1, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, paddingHorizontal: Spacing.three },
    input: { minHeight: 48, borderWidth: 1, borderRadius: Radius.md, paddingHorizontal: Spacing.three, fontSize: 16 },
    readOnlyField: { minHeight: 48, borderRadius: Radius.md, paddingHorizontal: Spacing.three, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    phoneValue: { writingDirection: 'ltr', textAlign: 'left' },
    codeInput: {
        minHeight: 58,
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.three,
        fontSize: 24,
        letterSpacing: 8,
        direction: 'ltr',
        writingDirection: 'ltr',
        textAlign: 'center',
    },
    saveButton: { minHeight: 50, borderRadius: Radius.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
});
