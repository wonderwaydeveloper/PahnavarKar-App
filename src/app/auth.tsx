import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    View,
} from 'react-native';
import { ActivityIndicator, Appbar } from 'react-native-paper';

import { AppTextInput } from '@/components/app-text';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useAppContext } from '@/hooks/use-app-context';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';
import { sendOtp } from '@/services/auth-api';

type AuthType = 'login' | 'register';
type AuthStep = 'phone' | 'code';
type AuthField = 'phone' | 'name' | 'email' | 'code';
type AuthError = { field: AuthField | null; message: string } | null;

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
    const { isLoading: authLoading, signInWithOtp, user } = useAuth();
    const router = useRouter();
    const isLightTheme = appTheme === 'light';
    const headerBackgroundColor = isLightTheme ? theme.primary : theme.surface;
    const headerTitleColor = isLightTheme ? theme.surface : theme.text;

    const [step, setStep] = useState<AuthStep>('phone');
    const [type, setType] = useState<AuthType>('login');
    const [phone, setPhone] = useState('');
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [resendSeconds, setResendSeconds] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<AuthError>(null);
    const [focusedField, setFocusedField] = useState<AuthField | null>(null);

    const nationalNumber = getIranianNationalNumber(phone);
    const normalizedPhone = `${IRAN_DIAL_CODE}${nationalNumber}`;

    useEffect(() => {
        if (!authLoading && user) {
            router.replace('/(tabs)/account');
        }
    }, [authLoading, router, user]);

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
    };

    const requestCode = async () => {
        Keyboard.dismiss();

        if (!/^9\d{9}$/.test(nationalNumber)) {
            setError({ field: 'phone', message: 'شماره تلفن معتبر وارد کنید.' });
            return;
        }
        if (type === 'register' && !name.trim()) {
            setError({ field: 'name', message: 'نام و نام خانوادگی را وارد کنید.' });
            return;
        }
        if (type === 'register' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
            setError({ field: 'email', message: 'نشانی ایمیل معتبر وارد کنید.' });
            return;
        }

        setBusy(true);
        setError(null);
        try {
            await sendOtp({
                phone: normalizedPhone,
                type,
                ...(type === 'register' ? { name: name.trim(), email: email.trim().toLowerCase() } : {}),
            });
            setCode('');
            setResendSeconds(30);
            setStep('code');
        } catch (requestError) {
            setError({ field: null, message: getErrorMessage(requestError) });
        } finally {
            setBusy(false);
        }
    };

    const verifyCode = async () => {
        if (!/^\d{6}$/.test(code)) {
            setError({ field: 'code', message: 'کد تأیید باید ۶ رقم باشد.' });
            return;
        }

        setBusy(true);
        setError(null);
        try {
            await signInWithOtp({
                phone: normalizedPhone,
                type,
                code,
                ...(type === 'register' ? { name: name.trim(), email: email.trim().toLowerCase() } : {}),
            });
            router.replace('/(tabs)/account');
        } catch (verificationError) {
            setError({ field: null, message: getErrorMessage(verificationError) });
        } finally {
            setBusy(false);
        }
    };

    const goBack = () => {
        if (step === 'code') {
            setStep('phone');
            setCode('');
            setError(null);
            return;
        }

        if (router.canGoBack()) {
            router.back();
        } else {
            router.replace('/(tabs)/account');
        }
    };

    const appBarTitle = step === 'phone'
        ? type === 'login' ? 'ورود به حساب' : 'ساخت حساب'
        : 'تأیید شماره';

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
                        {step === 'phone' ? (
                            <View style={styles.form}>
                                <ThemedText type="body" style={{ color: theme.textSecondary }}>
                                    {type === 'login'
                                        ? 'برای ورود، شمارهٔ موبایل خود را وارد کنید.'
                                        : 'برای ساخت حساب، اطلاعات خود را وارد کنید؛ سپس شمارهٔ موبایل تأیید می‌شود.'}
                                </ThemedText>

                                <View style={styles.modeSwitch}>
                                    {(['login', 'register'] as const).map((mode) => {
                                        const selected = type === mode;
                                        return (
                                            <Pressable
                                                key={mode}
                                                accessibilityRole="button"
                                                accessibilityState={{ selected }}
                                                disabled={busy}
                                                onPress={() => {
                                                    setType(mode);
                                                    setError(null);
                                                }}
                                                style={[
                                                    styles.modeButton,
                                                    {
                                                        backgroundColor: selected ? theme.primary : theme.surface,
                                                        borderColor: theme.border,
                                                    },
                                                ]}
                                            >
                                                <ThemedText
                                                    type="smallBold"
                                                    style={{ color: selected ? theme.surface : theme.text }}
                                                >
                                                    {mode === 'login' ? 'ورود' : 'ثبت‌نام'}
                                                </ThemedText>
                                            </Pressable>
                                        );
                                    })}
                                </View>

                                {type === 'register' ? (
                                    <>
                                        <ThemedText type="smallBold">نام و نام خانوادگی</ThemedText>
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
                                                    borderBottomColor: error?.field === 'name'
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

                                        <ThemedText type="smallBold">ایمیل</ThemedText>
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
                                                    borderBottomColor: error?.field === 'email'
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
                                    </>
                                ) : null}

                                <ThemedText type="smallBold">شماره تلفن</ThemedText>
                                <View
                                    style={[
                                        styles.phoneInputCard,
                                        {
                                            borderBottomColor: error?.field === 'phone'
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
                                        underlineColorAndroid="transparent"
                                        value={phone}
                                        style={[
                                            styles.phoneInput,
                                            { color: theme.text, writingDirection: 'ltr', textAlign: 'left' },
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

                                {error?.field === null ? (
                                    <View style={[styles.infoNote, { backgroundColor: theme.error + '1A' }]}>
                                        <MaterialCommunityIcons name="alert-circle-outline" size={18} color={theme.error} />
                                        <ThemedText type="small" style={[styles.infoNoteText, { color: theme.text }]}>
                                            {error.message}
                                        </ThemedText>
                                    </View>
                                ) : null}

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
                                        {busy ? 'در حال ارسال...' : 'دریافت کد تأیید'}
                                    </ThemedText>
                                    {!busy ? <MaterialCommunityIcons name="arrow-left" size={20} color={theme.onPrimary} /> : null}
                                </Pressable>
                            </View>
                        ) : (
                            <View style={styles.form}>
                                <View style={[styles.destinationCard, { borderBottomColor: theme.border }]}>
                                    <ThemedText type="smallBold" style={styles.destinationPhone}>
                                        {`\u2066${IRAN_DIAL_CODE} ${nationalNumber}\u2069`}
                                    </ThemedText>
                                    <Pressable
                                        accessibilityRole="button"
                                        disabled={busy}
                                        onPress={() => {
                                            setError(null);
                                            setStep('phone');
                                        }}
                                    >
                                        <ThemedText type="smallBold" style={{ color: theme.primaryText }}>ویرایش</ThemedText>
                                    </Pressable>
                                </View>

                                <ThemedText type="smallBold">کد ۶ رقمی پیامک‌شده</ThemedText>
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
                                    placeholder="• • • • • •"
                                    placeholderTextColor={theme.textMuted}
                                    textAlign="center"
                                    underlineColorAndroid="transparent"
                                    value={code}
                                    style={[
                                        styles.codeInput,
                                        {
                                            borderBottomColor: error?.field === 'code'
                                                ? theme.error
                                                : focusedField === 'code' ? theme.primary : theme.border,
                                            color: theme.text,
                                        },
                                    ]}
                                />
                                {error?.field === 'code' ? (
                                    <ThemedText type="small" accessibilityRole="alert" style={{ color: theme.error }}>
                                        {error.message}
                                    </ThemedText>
                                ) : null}
                                {error?.field === null ? (
                                    <View style={[styles.infoNote, { backgroundColor: theme.error + '1A' }]}>
                                        <MaterialCommunityIcons name="alert-circle-outline" size={18} color={theme.error} />
                                        <ThemedText type="small" style={[styles.infoNoteText, { color: theme.text }]}>
                                            {error.message}
                                        </ThemedText>
                                    </View>
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
        minHeight: 56,
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 0,
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
        minHeight: 56,
        fontSize: 17,
    },
    profileInput: {
        minHeight: 52,
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 0,
        fontSize: 16,
    },
    destinationCard: {
        minHeight: 52,
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
    },
    destinationPhone: { flex: 1, writingDirection: 'ltr', textAlign: 'left' },
    codeInput: {
        minHeight: 58,
        borderBottomWidth: StyleSheet.hairlineWidth,
        fontSize: 26,
        letterSpacing: 10,
        paddingHorizontal: 0,
    },
    infoNote: {
        borderRadius: Radius.md,
        padding: Spacing.two,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.two,
        marginTop: Spacing.one,
    },
    infoNoteText: { flex: 1 },
    resendButton: { alignItems: 'center', paddingVertical: Spacing.two },
    helperText: { textAlign: 'center' },
});
