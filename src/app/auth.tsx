import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    Alert,
    BackHandler,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';
import { ActivityIndicator, Appbar, Snackbar } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppTextInput } from '@/components/app-text';
import { ProfilePhotoPreview } from '@/components/profile-photo-preview';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAppContext } from '@/hooks/use-app-context';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { sendOtp } from '@/services/auth-api';

type AuthStep = 'phone' | 'editPhone' | 'code' | 'profile';
type AuthField = 'phone' | 'name' | 'email' | 'code';
type AuthError = { field: AuthField; message: string } | null;
type AuthMessageKind = 'success' | 'error';

const IRAN_DIAL_CODE = '+98';

function toLatinDigits(value: string) {
    return value.replace(/[۰-۹٠-٩]/g, (digit) =>
        String.fromCharCode(
            digit.charCodeAt(0) >= 0x06f0 && digit.charCodeAt(0) <= 0x06f9
                ? digit.charCodeAt(0) - 0x06f0 + 48
                : digit.charCodeAt(0) - 0x0660 + 48,
        ),
    );
}

function getIranianNationalNumber(value: string) {
    let digits = toLatinDigits(value).replace(/\D/g, '');

    if (digits.startsWith('0098')) {
        digits = digits.slice(4);
    } else if (digits.startsWith('98')) {
        digits = digits.slice(2);
    }
    if (digits.startsWith('0') && digits.length > 1) {
        digits = digits.slice(1);
    }

    return digits;
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'خطای نامشخص در ارتباط با سرور رخ داد.';
}

export default function AuthScreen() {
    const theme = useTheme();
    const { theme: appTheme } = useAppContext();
    const { isLoading: authLoading, signInWithOtp, uploadProfilePhoto, user } = useAuth();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const isLightTheme = appTheme === 'light';
    const headerBackgroundColor = isLightTheme ? theme.primary : theme.surface;
    const headerTitleColor = isLightTheme ? theme.surface : theme.text;

    const [step, setStep] = useState<AuthStep>('phone');
    const [returnStep, setReturnStep] = useState<'code' | 'profile'>('code');
    const [phone, setPhone] = useState('');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [profilePhoto, setProfilePhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
    const [photoPreviewVisible, setPhotoPreviewVisible] = useState(false);
    const [code, setCode] = useState('');
    const [resendSeconds, setResendSeconds] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<AuthError>(null);
    const [message, setMessage] = useState('');
    const [messageKind, setMessageKind] = useState<AuthMessageKind>('error');
    const [focusedField, setFocusedField] = useState<AuthField | null>(null);
    const nationalNumber = getIranianNationalNumber(phone);
    const normalizedPhone = `${IRAN_DIAL_CODE}${nationalNumber}`;

    useEffect(() => {
        if (!authLoading && !busy && user) {
            router.replace('/(tabs)/account');
        }
    }, [authLoading, busy, router, user]);

    useEffect(() => {
        if (resendSeconds <= 0) {
            return;
        }

        const timer = setTimeout(() => {
            setResendSeconds((seconds) => Math.max(0, seconds - 1));
        }, 1000);

        return () => clearTimeout(timer);
    }, [resendSeconds]);

    const clearFieldError = (field: AuthField) => {
        setError((currentError) => currentError?.field === field ? null : currentError);
        setMessage('');
    };

    const showMessage = (text: string, kind: AuthMessageKind = 'error') => {
        setMessageKind(kind);
        setMessage(text);
    };

    const chooseProfilePhoto = async () => {
        try {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) {
                showMessage('برای انتخاب تصویر پروفایل، دسترسی به تصاویر را مجاز کنید.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.85,
            });

            if (!result.canceled) {
                setProfilePhoto(result.assets[0] ?? null);
                setError(null);
                setMessage('');
            }
        } catch (pickerError) {
            showMessage(getErrorMessage(pickerError));
        }
    };

    const requestCode = async () => {
        Keyboard.dismiss();

        if (!/^9\d{9}$/.test(nationalNumber)) {
            setMessage('');
            setError({ field: 'phone', message: 'شماره تلفن معتبر وارد کنید.' });
            return;
        }
        setBusy(true);
        setError(null);
        setMessage('');
        try {
            await sendOtp({
                phone: normalizedPhone,
                type: 'login',
            });
            setCode('');
            setResendSeconds(30);
            setStep('code');
            showMessage('اگر امکان استفاده از این درخواست وجود داشته باشد، کد تأیید ارسال می‌شود.', 'success');
        } catch (requestError) {
            showMessage(getErrorMessage(requestError));
        } finally {
            setBusy(false);
        }
    };

    const verifyCode = async () => {
        if (!/^\d{6}$/.test(code)) {
            setMessage('');
            setError({ field: 'code', message: 'کد تأیید باید ۶ رقم باشد.' });
            return;
        }

        setBusy(true);
        setError(null);
        setMessage('');
        try {
            const result = await signInWithOtp({
                phone: normalizedPhone,
                type: 'login',
                code,
            });
            if (result === 'profile_required') {
                setStep('profile');
                return;
            }

            router.replace('/(tabs)/account');
        } catch (verificationError) {
            showMessage(getErrorMessage(verificationError));
        } finally {
            setBusy(false);
        }
    };

    const completeRegistration = async () => {
        Keyboard.dismiss();

        if (!name.trim()) {
            setMessage('');
            setError({ field: 'name', message: 'نام و نام خانوادگی را وارد کنید.' });
            return;
        }
        if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            setMessage('');
            setError({ field: 'email', message: 'نشانی ایمیل معتبر وارد کنید.' });
            return;
        }
        if (!/^\d{6}$/.test(code)) {
            setMessage('');
            setError({ field: 'code', message: 'کد تأیید باید ۶ رقم باشد. دوباره شماره را تأیید کنید.' });
            setStep('code');
            return;
        }

        setBusy(true);
        setError(null);
        setMessage('');
        try {
            const result = await signInWithOtp({
                phone: normalizedPhone,
                type: 'login',
                code,
                name: name.trim(),
                ...(email.trim() ? { email: email.trim().toLowerCase() } : {}),
            });
            if (result !== 'authenticated') {
                throw new Error('تکمیل حساب انجام نشد. دوباره تلاش کنید.');
            }

            if (profilePhoto) {
                try {
                    await uploadProfilePhoto(profilePhoto.uri);
                } catch (photoError) {
                    Alert.alert(
                        'ثبت‌نام انجام شد',
                        `حساب شما ساخته شد، اما تصویر پروفایل بارگذاری نشد؛ حساب بدون تصویر ذخیره شده است.\n${getErrorMessage(photoError)}`,
                    );
                }
            }
            router.replace('/(tabs)/account');
        } catch (registrationError) {
            if (registrationError instanceof Error && registrationError.message.includes('ایمیل')) {
                setError({ field: 'email', message: getErrorMessage(registrationError) });
            } else {
                showMessage(getErrorMessage(registrationError));
            }
        } finally {
            setBusy(false);
        }
    };

    const goBack = () => {
        if (step === 'code' || step === 'profile') {
            setReturnStep(step);
            setStep('editPhone');
            setError(null);
            setMessage('');
            return;
        }
        if (step === 'editPhone') {
            setStep(returnStep);
            setError(null);
            setMessage('');
            return;
        }

        if (router.canGoBack()) {
            router.back();
        } else {
            router.replace('/(tabs)/account');
        }
    };

    useEffect(() => {
        if (step === 'phone') {
            return;
        }

        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            if (busy) {
                return true;
            }

            setStep((currentStep) => {
                if (currentStep === 'code' || currentStep === 'profile') {
                    setReturnStep(currentStep);
                    return 'editPhone';
                }

                return returnStep;
            });
            setError(null);
            setMessage('');
            return true;
        });

        return () => subscription.remove();
    }, [busy, returnStep, step]);

    const appBarTitle = step === 'phone'
        ? 'ورود یا ثبت‌نام'
        : step === 'editPhone' ? 'ویرایش شماره تلفن'
            : step === 'profile' ? 'تکمیل حساب' : 'تأیید شماره';

    return (
        <ThemedView style={styles.container}>
            <KeyboardAvoidingView
                style={styles.flex}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <Appbar.Header
                    style={[
                        styles.appBar,
                        {
                            backgroundColor: headerBackgroundColor,
                            shadowColor: theme.text,
                            shadowOpacity: isLightTheme ? 0.16 : 0.08,
                        },
                    ]}
                >
                    <Appbar.Action
                        accessibilityLabel="بازگشت"
                        icon="chevron-right"
                        color={headerTitleColor}
                        onPress={goBack}
                        size={24}
                        style={styles.appBarAction}
                    />
                    <View style={styles.appBarTitleWrap}>
                        <ThemedText type="title" style={[styles.appBarTitle, { color: headerTitleColor }]}>
                            {appBarTitle}
                        </ThemedText>
                    </View>
                </Appbar.Header>

                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <View style={styles.content}>
                        {step === 'phone' || step === 'profile' ? (
                            <View style={styles.form}>
                                <ThemedText type="body" style={{ color: theme.textSecondary }}>
                                    {step === 'phone'
                                        ? 'شمارهٔ موبایل خود را وارد کنید؛ حساب شما پس از تأیید شماره به‌صورت خودکار شناسایی می‌شود.'
                                        : 'شمارهٔ شما تأیید شد. برای ساخت حساب، نام خود را وارد کنید.'}
                                </ThemedText>

                                {step === 'profile' ? (
                                    <>
                                        <View style={[styles.destinationCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                            <ThemedText type="smallBold" style={styles.destinationPhone}>
                                                {`\u2066${IRAN_DIAL_CODE} ${nationalNumber}\u2069`}
                                            </ThemedText>
                                            <Pressable
                                                accessibilityRole="button"
                                                disabled={busy}
                                                onPress={() => {
                                                    setReturnStep('profile');
                                                    setError(null);
                                                    setMessage('');
                                                    setStep('editPhone');
                                                }}
                                            >
                                                <ThemedText type="smallBold" style={{ color: theme.primaryText }}>ویرایش شماره</ThemedText>
                                            </Pressable>
                                        </View>

                                        <View style={styles.fieldGroup}>
                                            <ThemedText type="smallBold" style={styles.fieldLabel}>تصویر پروفایل (اختیاری)</ThemedText>
                                            <View style={[styles.photoCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                                <View style={styles.photoPickerColumn}>
                                                    {profilePhoto ? (
                                                        <Pressable
                                                            accessibilityRole="button"
                                                            accessibilityLabel="پیش‌نمایش تصویر پروفایل"
                                                            disabled={busy}
                                                            onPress={() => setPhotoPreviewVisible(true)}
                                                        >
                                                            <Image
                                                                source={{ uri: profilePhoto.uri }}
                                                                contentFit="cover"
                                                                style={styles.photoPreview}
                                                            />
                                                        </Pressable>
                                                    ) : (
                                                        <Pressable
                                                            accessibilityRole="button"
                                                            accessibilityLabel="انتخاب تصویر پروفایل"
                                                            disabled={busy}
                                                            onPress={() => void chooseProfilePhoto()}
                                                            style={[styles.photoPlaceholder, { backgroundColor: theme.primaryContainer }]}
                                                        >
                                                            <MaterialCommunityIcons
                                                                name="account-outline"
                                                                size={32}
                                                                color={theme.primaryText}
                                                            />
                                                        </Pressable>
                                                    )}
                                                    <Pressable
                                                        accessibilityRole="button"
                                                        accessibilityLabel={profilePhoto ? 'تغییر تصویر پروفایل' : 'انتخاب تصویر پروفایل'}
                                                        disabled={busy}
                                                        onPress={() => void chooseProfilePhoto()}
                                                        style={[styles.photoActionBadge, styles.photoEditBadge, { backgroundColor: theme.primary }]}
                                                    >
                                                        <MaterialCommunityIcons name="camera-outline" size={16} color={theme.onPrimary} />
                                                    </Pressable>
                                                    {profilePhoto ? (
                                                        <Pressable
                                                            accessibilityRole="button"
                                                            accessibilityLabel="حذف تصویر انتخاب‌شده"
                                                            disabled={busy}
                                                            onPress={() => setProfilePhoto(null)}
                                                            style={[styles.photoActionBadge, styles.photoRemoveBadge, { backgroundColor: theme.primary }]}
                                                        >
                                                            <MaterialCommunityIcons name="trash-can-outline" size={17} color={theme.onPrimary} />
                                                        </Pressable>
                                                    ) : null}
                                                </View>
                                            </View>
                                        </View>

                                        <View style={styles.fieldGroup}>
                                            <ThemedText type="smallBold" style={styles.fieldLabel}>نام و نام خانوادگی</ThemedText>
                                            <AppTextInput
                                                accessibilityLabel="نام و نام خانوادگی"
                                                autoComplete="name"
                                                onBlur={() => setFocusedField(null)}
                                                onChangeText={(value) => {
                                                    setName(value);
                                                    clearFieldError('name');
                                                }}
                                                onFocus={() => setFocusedField('name')}
                                                placeholder="نام و نام خانوادگی"
                                                placeholderTextColor={theme.textMuted}
                                                returnKeyType="next"
                                                underlineColorAndroid="transparent"
                                                value={name}
                                                style={[
                                                    styles.profileInput,
                                                    {
                                                        backgroundColor: theme.surface,
                                                        borderColor: error?.field === 'name'
                                                            ? theme.error
                                                            : focusedField === 'name' ? theme.primary : theme.border,
                                                        color: theme.text,
                                                    },
                                                ]}
                                            />
                                            {error?.field === 'name' ? (
                                                <ThemedText type="small" accessibilityRole="alert" style={{ color: theme.error }}>
                                                    {error.message}
                                                </ThemedText>
                                            ) : null}
                                        </View>

                                        <View style={styles.fieldGroup}>
                                            <ThemedText type="smallBold" style={styles.fieldLabel}>ایمیل (اختیاری)</ThemedText>
                                            <AppTextInput
                                                accessibilityLabel="ایمیل"
                                                autoCapitalize="none"
                                                autoComplete="email"
                                                keyboardType="email-address"
                                                onBlur={() => setFocusedField(null)}
                                                onChangeText={(value) => {
                                                    setEmail(value);
                                                    clearFieldError('email');
                                                }}
                                                onFocus={() => setFocusedField('email')}
                                                placeholder="name@example.com"
                                                placeholderTextColor={theme.textMuted}
                                                underlineColorAndroid="transparent"
                                                value={email}
                                                style={[
                                                    styles.profileInput,
                                                    {
                                                        backgroundColor: theme.surface,
                                                        borderColor: error?.field === 'email'
                                                            ? theme.error
                                                            : focusedField === 'email' ? theme.primary : theme.border,
                                                        color: theme.text,
                                                        writingDirection: 'ltr',
                                                        textAlign: 'left',
                                                    },
                                                ]}
                                            />
                                            {error?.field === 'email' ? (
                                                <ThemedText type="small" accessibilityRole="alert" style={{ color: theme.error }}>
                                                    {error.message}
                                                </ThemedText>
                                            ) : null}
                                        </View>

                                    </>
                                ) : null}

                                {step === 'phone' ? (
                                    <View style={styles.fieldGroup}>
                                        <ThemedText type="smallBold" style={styles.fieldLabel}>شماره تلفن</ThemedText>
                                <View
                                    style={[
                                        styles.phoneInputCard,
                                        {
                                            backgroundColor: theme.surface,
                                            borderColor: error?.field === 'phone'
                                                ? theme.error
                                                : focusedField === 'phone' ? theme.primary : theme.border,
                                        },
                                    ]}
                                >
                                    <AppTextInput
                                        accessibilityLabel="شماره تلفن"
                                        autoComplete="tel-national"
                                        autoCorrect={false}
                                        keyboardType="phone-pad"
                                        maxLength={15}
                                        onBlur={() => setFocusedField(null)}
                                        onChangeText={(value) => {
                                            setPhone(value);
                                            clearFieldError('phone');
                                        }}
                                        onFocus={() => setFocusedField('phone')}
                                        placeholder="9123456789"
                                        placeholderTextColor={theme.textMuted}
                                        returnKeyType="done"
                                        selection={phone.length === 0 ? { start: 0, end: 0 } : undefined}
                                        underlineColorAndroid="transparent"
                                        value={phone}
                                        style={[
                                            styles.phoneInput,
                                            {
                                                color: theme.text,
                                                direction: 'ltr',
                                                writingDirection: 'ltr',
                                                textAlign: 'left',
                                            },
                                        ]}
                                    />
                                    <View style={[styles.phoneDialCode, { borderColor: theme.border }]}>
                                        <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>
                                            {IRAN_DIAL_CODE}
                                        </ThemedText>
                                    </View>
                                </View>
                                {error?.field === 'phone' ? (
                                    <ThemedText type="small" accessibilityRole="alert" style={{ color: theme.error }}>
                                        {error.message}
                                    </ThemedText>
                                ) : null}
                                    </View>
                                ) : null}

                                <Pressable
                                    accessibilityRole="button"
                                    disabled={busy}
                                    onPress={() => void (step === 'profile' ? completeRegistration() : requestCode())}
                                    style={({ pressed }) => [
                                        styles.primaryButton,
                                        {
                                            backgroundColor: theme.primary,
                                            opacity: pressed || busy ? 0.72 : 1,
                                        },
                                    ]}
                                >
                                    {busy ? <ActivityIndicator color={theme.onPrimary} size="small" /> : null}
                                    <ThemedText type="smallBold" style={[styles.primaryButtonText, { color: theme.onPrimary }]}>
                                        {busy
                                            ? step === 'profile' ? 'در حال ایجاد حساب...' : 'در حال ارسال...'
                                            : step === 'profile' ? 'تکمیل ثبت‌نام' : 'دریافت کد تأیید'}
                                    </ThemedText>
                                    {!busy ? <MaterialCommunityIcons name="arrow-left" size={20} color={theme.onPrimary} /> : null}
                                </Pressable>
                            </View>
                        ) : step === 'editPhone' ? (
                            <View style={styles.form}>
                                <ThemedText type="body" style={{ color: theme.textSecondary }}>
                                    شمارهٔ جدید را وارد کنید تا کد تأیید تازه‌ای برای آن ارسال شود.
                                </ThemedText>
                                <View style={styles.fieldGroup}>
                                    <ThemedText type="smallBold" style={styles.fieldLabel}>شماره تلفن</ThemedText>
                                    <View
                                        style={[
                                            styles.phoneInputCard,
                                            {
                                                backgroundColor: theme.surface,
                                                borderColor: error?.field === 'phone'
                                                    ? theme.error
                                                    : focusedField === 'phone' ? theme.primary : theme.border,
                                            },
                                        ]}
                                    >
                                        <AppTextInput
                                            accessibilityLabel="ویرایش شماره تلفن"
                                            autoComplete="tel-national"
                                            autoCorrect={false}
                                            keyboardType="phone-pad"
                                            maxLength={15}
                                            onBlur={() => setFocusedField(null)}
                                            onChangeText={(value) => {
                                                setPhone(value);
                                                clearFieldError('phone');
                                            }}
                                            onFocus={() => setFocusedField('phone')}
                                            placeholder="9123456789"
                                            placeholderTextColor={theme.textMuted}
                                            returnKeyType="done"
                                            selection={phone.length === 0 ? { start: 0, end: 0 } : undefined}
                                            underlineColorAndroid="transparent"
                                            value={phone}
                                            style={[
                                                styles.phoneInput,
                                                {
                                                    color: theme.text,
                                                    direction: 'ltr',
                                                    writingDirection: 'ltr',
                                                    textAlign: 'left',
                                                },
                                            ]}
                                        />
                                        <View style={[styles.phoneDialCode, { borderColor: theme.border }]}>
                                            <ThemedText type="smallBold" style={{ color: theme.textSecondary }}>
                                                {IRAN_DIAL_CODE}
                                            </ThemedText>
                                        </View>
                                    </View>
                                    {error?.field === 'phone' ? (
                                        <ThemedText type="small" accessibilityRole="alert" style={{ color: theme.error }}>
                                            {error.message}
                                        </ThemedText>
                                    ) : null}
                                </View>
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={busy}
                                    onPress={() => void requestCode()}
                                    style={({ pressed }) => [
                                        styles.primaryButton,
                                        {
                                            backgroundColor: theme.primary,
                                            opacity: pressed || busy ? 0.72 : 1,
                                        },
                                    ]}
                                >
                                    {busy ? <ActivityIndicator color={theme.onPrimary} size="small" /> : null}
                                    <ThemedText type="smallBold" style={[styles.primaryButtonText, { color: theme.onPrimary }]}>
                                        {busy ? 'در حال ارسال...' : 'ارسال کد به این شماره'}
                                    </ThemedText>
                                    {!busy ? <MaterialCommunityIcons name="arrow-left" size={20} color={theme.onPrimary} /> : null}
                                </Pressable>
                            </View>
                        ) : (
                            <View style={styles.form}>
                                <View style={[styles.destinationCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                                    <ThemedText type="smallBold" style={styles.destinationPhone}>
                                        {`\u2066${IRAN_DIAL_CODE} ${nationalNumber}\u2069`}
                                    </ThemedText>
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={busy}
                                        onPress={() => {
                                            setError(null);
                                            setMessage('');
                                            setStep('editPhone');
                                        }}
                                    >
                                        <ThemedText type="smallBold" style={{ color: theme.primaryText }}>ویرایش</ThemedText>
                                    </Pressable>
                                </View>

                                <View style={styles.fieldGroup}>
                                    <ThemedText type="smallBold" style={styles.fieldLabel}>کد ۶ رقمی پیامک‌شده</ThemedText>
                                    <AppTextInput
                                        accessibilityLabel="کد شش رقمی تأیید"
                                        autoComplete="one-time-code"
                                        keyboardType="number-pad"
                                        maxLength={6}
                                        onBlur={() => setFocusedField(null)}
                                        onChangeText={(value) => {
                                            setCode(toLatinDigits(value).replace(/\D/g, '').slice(0, 6));
                                            clearFieldError('code');
                                        }}
                                        onFocus={() => setFocusedField('code')}
                                        placeholder="••••••"
                                        placeholderTextColor={theme.textMuted}
                                        textAlign="center"
                                        underlineColorAndroid="transparent"
                                        value={code}
                                        style={[
                                            styles.codeInput,
                                            {
                                                backgroundColor: theme.surface,
                                                borderColor: error?.field === 'code'
                                                    ? theme.error
                                                    : focusedField === 'code' ? theme.primary : theme.border,
                                                color: theme.text,
                                                direction: 'ltr',
                                                writingDirection: 'ltr',
                                            },
                                        ]}
                                    />
                                </View>
                                {error?.field === 'code' ? (
                                    <ThemedText type="small" accessibilityRole="alert" style={{ color: theme.error }}>
                                        {error.message}
                                    </ThemedText>
                                ) : null}
                                <Pressable
                                    accessibilityRole="button"
                                    disabled={busy}
                                    onPress={() => void verifyCode()}
                                    style={({ pressed }) => [
                                        styles.primaryButton,
                                        { backgroundColor: theme.primary, opacity: pressed || busy ? 0.72 : 1 },
                                    ]}
                                >
                                    {busy ? <ActivityIndicator color={theme.onPrimary} size="small" /> : null}
                                    <ThemedText type="smallBold" style={[styles.primaryButtonText, { color: theme.onPrimary }]}>
                                        {busy ? 'در حال بررسی...' : 'تأیید و ورود'}
                                    </ThemedText>
                                    {!busy ? <MaterialCommunityIcons name="arrow-left" size={20} color={theme.onPrimary} /> : null}
                                </Pressable>

                                <Pressable
                                    accessibilityRole="button"
                                    disabled={resendSeconds > 0 || busy}
                                    onPress={() => void requestCode()}
                                    style={styles.resendButton}
                                >
                                    <ThemedText
                                        type="smallBold"
                                        style={{ color: resendSeconds > 0 || busy ? theme.textMuted : theme.primaryText }}
                                    >
                                        {resendSeconds > 0
                                            ? `ارسال دوبارهٔ کد تا ${resendSeconds} ثانیه`
                                            : 'ارسال دوبارهٔ کد'}
                                    </ThemedText>
                                </Pressable>
                                <ThemedText type="small" style={[styles.helperText, { color: theme.textMuted }]}>
                                    کد برای مدت محدود معتبر است. هرگز آن را با دیگران به اشتراک نگذارید.
                                </ThemedText>
                            </View>
                        )}
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
            <ProfilePhotoPreview
                uri={profilePhoto?.uri ?? null}
                visible={photoPreviewVisible}
                onClose={() => setPhotoPreviewVisible(false)}
            />
            <Snackbar
                visible={Boolean(message)}
                onDismiss={() => setMessage('')}
                duration={4500}
                style={{
                    backgroundColor: messageKind === 'error' ? theme.errorFill : theme.successFill,
                    borderRadius: Radius.md,
                    marginBottom: insets.bottom,
                }}
                action={{
                    label: 'بستن',
                    onPress: () => setMessage(''),
                    labelStyle: { color: theme.onStatus },
                }}
            >
                <ThemedText
                    type="small"
                    accessibilityRole={messageKind === 'error' ? 'alert' : undefined}
                    style={{ color: theme.onStatus }}
                >
                    {message}
                </ThemedText>
            </Snackbar>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    flex: { flex: 1 },
    appBar: {
        elevation: 4,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
    },
    appBarAction: { width: 40, marginHorizontal: 0 },
    appBarTitleWrap: {
        flexShrink: 1,
        maxWidth: '75%',
        justifyContent: 'center',
    },
    appBarTitle: {
        fontSize: 16,
        fontFamily: 'AppFont-Bold',
        textAlign: 'right',
    },
    scrollContent: {
        flexGrow: 1,
        width: '100%',
        maxWidth: 560,
        alignSelf: 'center',
        paddingHorizontal: Spacing.four,
        paddingTop: Spacing.three,
        paddingBottom: Spacing.two,
    },
    content: {
        flexGrow: 1,
        justifyContent: 'flex-start',
        gap: Spacing.three,
        paddingVertical: Spacing.three,
    },
    form: { gap: Spacing.two },
    fieldGroup: {
        gap: Spacing.one,
    },
    fieldLabel: {
        paddingHorizontal: Spacing.one,
    },
    modeSwitch: {
        flexDirection: 'row',
        gap: Spacing.two,
        marginVertical: Spacing.one,
    },
    modeButton: {
        flex: 1,
        minHeight: 44,
        borderWidth: 1,
        borderRadius: Radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryButton: {
        minHeight: 52,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.three,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Spacing.two,
        marginTop: Spacing.one,
    },
    primaryButtonText: { textAlign: 'center' },
    phoneInputCard: {
        minHeight: 64,
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.three,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
    },
    phoneDialCode: {
        minHeight: 32,
        borderStartWidth: 1,
        paddingStart: Spacing.two,
        alignItems: 'center',
        justifyContent: 'center',
    },
    phoneInput: {
        flex: 1,
        minHeight: 52,
        paddingVertical: 0,
        fontSize: 17,
    },
    profileInput: {
        minHeight: 54,
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.three,
        fontSize: 16,
    },
    photoCard: {
        borderWidth: 1,
        borderRadius: Radius.md,
        padding: Spacing.three,
        gap: Spacing.two,
        alignItems: 'center',
    },
    photoPickerColumn: {
        width: 96,
        height: 96,
        alignItems: 'center',
        justifyContent: 'center',
    },
    photoPreview: {
        width: 96,
        height: 96,
        borderRadius: 48,
    },
    photoPlaceholder: {
        width: 96,
        height: 96,
        borderRadius: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    photoActionBadge: {
        position: 'absolute',
        bottom: 0,
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
    },
    photoEditBadge: { right: 0 },
    photoRemoveBadge: { left: 0 },
    destinationCard: {
        minHeight: 52,
        borderWidth: 1,
        borderRadius: Radius.md,
        paddingHorizontal: Spacing.three,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
    },
    destinationPhone: { flex: 1, writingDirection: 'ltr', textAlign: 'left' },
    codeInput: {
        minHeight: 58,
        borderWidth: 1,
        borderRadius: Radius.md,
        fontSize: 24,
        letterSpacing: 8,
        paddingHorizontal: Spacing.three,
        writingDirection: 'ltr',
    },
    resendButton: { alignItems: 'center', paddingVertical: Spacing.two },
    helperText: { textAlign: 'center' },
});
