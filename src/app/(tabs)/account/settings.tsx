import { Typography } from '@/constants/typography';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Snackbar } from 'react-native-paper';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import type { CalculationSound, CurrencyPreference, FontPreference, FontSizePreference, ThemePalette } from '@/context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ColorPalettes, Radius, Spacing } from '@/constants/theme';
import { getScaledTextStyle } from '@/constants/font-scale';
import { useAppContext } from '@/hooks/use-app-context';
import { useAppFeedback } from '@/hooks/use-app-feedback';
import { useTheme } from '@/hooks/use-theme';
import { getAppFontFamily, loadAppFonts } from '@/services/font-service';
import { getUserFacingErrorMessage } from '@/services/user-facing-error';

type SettingRowProps = {
    icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    colorPreview?: string;
    title: string;
    selected: boolean;
    previewFont?: FontPreference;
    disabled?: boolean;
    showDivider?: boolean;
    onPress: () => void;
};

type SettingsSectionKey = 'currency' | 'palette' | 'appearance' | 'font' | 'font-size' | 'calculation-sound';

type SettingsSectionProps = {
    title: string;
    summary: string;
    icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
    expanded: boolean;
    cardStyle: StyleProp<ViewStyle>;
    children: React.ReactNode;
    onToggle: () => void;
};

function SettingsSection({
    title,
    summary,
    icon,
    expanded,
    cardStyle,
    children,
    onToggle,
}: SettingsSectionProps) {
    const theme = useTheme();

    return (
        <Animated.View layout={LinearTransition.duration(220)} style={cardStyle}>
            <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={onToggle}
                style={({ pressed }) => [
                    styles.sectionHeader,
                    pressed && { backgroundColor: theme.surfaceVariant },
                ]}
            >
                <View style={[styles.sectionIcon, { backgroundColor: theme.primary }]}>
                    <MaterialCommunityIcons name={icon} size={21} color={theme.onPrimary} />
                </View>
                <View style={styles.sectionHeadingText}>
                    <ThemedText type="smallBold">{title}</ThemedText>
                    <ThemedText type="small" style={{ color: theme.textSecondary }}>
                        {summary}
                    </ThemedText>
                </View>
                <MaterialCommunityIcons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={22}
                    color={theme.textSecondary}
                />
            </Pressable>
            {expanded ? (
                <Animated.View
                    entering={FadeIn.duration(180)}
                    exiting={FadeOut.duration(120)}
                    layout={LinearTransition.duration(220)}
                    style={[styles.sectionContent, { borderTopColor: theme.border }]}
                >
                    {children}
                </Animated.View>
            ) : null}
        </Animated.View>
    );
}

function SettingRow({
    icon,
    colorPreview,
    title,
    selected,
    previewFont,
    disabled = false,
    showDivider = true,
    onPress,
}: SettingRowProps) {
    const theme = useTheme();
    const { fontSizePreference } = useAppContext();

    return (
        <View
            style={[
                styles.optionRow,
                showDivider && {
                    borderBottomColor: theme.border,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                },
                disabled && styles.disabledRow,
            ]}
        >
            <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled }}
                disabled={disabled}
                onPress={onPress}
                style={({ pressed }) => [
                    styles.optionSelect,
                    pressed && !disabled && { backgroundColor: theme.surfaceVariant },
                ]}
            >
                <View style={styles.optionIcon}>
                    {colorPreview ? (
                        <View
                            style={[
                                styles.paletteSwatch,
                                { backgroundColor: colorPreview, borderColor: theme.borderStrong },
                            ]}
                        />
                    ) : icon ? (
                        <MaterialCommunityIcons
                            name={icon}
                            size={21}
                            color={theme.textSecondary}
                        />
                    ) : null}
                </View>
                <View style={styles.optionText}>
                    {previewFont ? (
                        <Text
                            style={[
                                getScaledTextStyle(styles.fontPreview, fontSizePreference),
                                {
                                    color: theme.text,
                                    fontFamily: previewFont === 'system' ? undefined : getAppFontFamily(previewFont, 'Bold'),
                                    fontWeight: previewFont === 'system' ? '700' : 'normal',
                                },
                            ]}
                        >
                            {title}
                        </Text>
                    ) : (
                        <ThemedText type="smallBold">{title}</ThemedText>
                    )}
                </View>
                <MaterialCommunityIcons
                    name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                    size={22}
                    color={selected ? theme.primaryText : theme.textMuted}
                />
            </Pressable>
        </View>
    );
}

export default function SettingsScreen() {
    const theme = useTheme();
    const {
        themePreference,
        theme: themeMode,
        setTheme,
        colorPalette,
        setColorPalette,
        fontPreference,
        setFontPreference,
        fontSizePreference,
        setFontSizePreference,
        fontError: fontLoadError,
        clearFontError,
        currencyPreference,
        currencyError,
        setCurrencyPreference,
        clearCurrencyError,
        calculationSound,
        calculationSoundError,
        setCalculationSound,
        clearCalculationSoundError,
    } = useAppContext();
    const [fontActionError, setFontActionError] = useState('');
    const [fontChangePending, setFontChangePending] = useState(false);
    const [fontSizeActionError, setFontSizeActionError] = useState('');
    const [fontSizeChangePending, setFontSizeChangePending] = useState(false);
    const [currencyActionError, setCurrencyActionError] = useState('');
    const [paletteActionError, setPaletteActionError] = useState('');
    const [calculationSoundActionError, setCalculationSoundActionError] = useState('');
    const [themeChangePending, setThemeChangePending] = useState(false);
    const [expandedSection, setExpandedSection] = useState<SettingsSectionKey | null>(null);
    const { showError } = useAppFeedback();

    useEffect(() => {
        let isMounted = true;

        void Promise.all([
            loadAppFonts('iransans'),
            loadAppFonts('vazir'),
            loadAppFonts('shabnam'),
        ]).catch((error: unknown) => {
            console.error('Unable to load font previews', error);
            if (isMounted) {
                const reason = ` (${getUserFacingErrorMessage(error, 'خطای نامشخص')})`;
                setFontActionError(`بارگذاری نمونهٔ فونت‌ها انجام نشد${reason}`);
            }
        });

        return () => {
            isMounted = false;
        };
    }, []);

    const handleFontChange = async (value: FontPreference) => {
        if (value === fontPreference || fontChangePending) return;

        setFontChangePending(true);
        setFontActionError('');
        try {
            await setFontPreference(value);
        } catch (error) {
            const reason = ` (${getUserFacingErrorMessage(error, 'خطای نامشخص')})`;
            setFontActionError(`بارگذاری یا ذخیرهٔ فونت انتخاب‌شده انجام نشد${reason}`);
        } finally {
            setFontChangePending(false);
        }
    };

    const handleFontSizeChange = async (value: FontSizePreference) => {
        if (value === fontSizePreference || fontSizeChangePending) return;

        setFontSizeChangePending(true);
        setFontSizeActionError('');
        try {
            await setFontSizePreference(value);
        } catch (error) {
            console.error('Unable to save font size preference', error);
            const reason = ` (${getUserFacingErrorMessage(error, 'خطای نامشخص')})`;
            setFontSizeActionError(`ذخیرهٔ اندازهٔ متن انجام نشد${reason}`);
        } finally {
            setFontSizeChangePending(false);
        }
    };

    const handleCalculationSoundChange = async (value: CalculationSound) => {
        if (value === calculationSound) return;

        setCalculationSoundActionError('');
        try {
            await setCalculationSound(value);
        } catch (error) {
            console.error('Unable to update calculation completion sound', error);
            const reason = ` (${getUserFacingErrorMessage(error, 'خطای نامشخص')})`;
            setCalculationSoundActionError(`ذخیره یا فعال‌سازی صدای پایان محاسبه انجام نشد${reason}`);
        }
    };

    const dismissFontError = () => {
        setFontActionError('');
        clearFontError();
    };

    const handleCurrencyChange = async (value: CurrencyPreference) => {
        if (value === currencyPreference) return;

        setCurrencyActionError('');
        try {
            await setCurrencyPreference(value);
        } catch (error) {
            console.error('Unable to save currency preference', error);
            const reason = ` (${getUserFacingErrorMessage(error, 'خطای نامشخص')})`;
            setCurrencyActionError(`ذخیرهٔ واحد پول انجام نشد${reason}`);
        }
    };

    const dismissCurrencyError = () => {
        setCurrencyActionError('');
        clearCurrencyError();
    };

    const handleColorPaletteChange = async (value: ThemePalette) => {
        if (value === colorPalette) return;

        setPaletteActionError('');
        try {
            await setColorPalette(value);
        } catch (error) {
            console.error('Unable to save color palette preference', error);
            const reason = ` (${getUserFacingErrorMessage(error, 'خطای نامشخص')})`;
            setPaletteActionError(`ذخیرهٔ طیف رنگ انتخاب‌شده انجام نشد${reason}`);
        }
    };

    const handleThemeChange = async (value: 'light' | 'dark' | 'system') => {
        if (themeChangePending) return;
        setThemeChangePending(true);
        try {
            await setTheme(value);
        } catch (error) {
            showError(error, 'ذخیرهٔ حالت نمایش برنامه ناموفق بود.');
        } finally {
            setThemeChangePending(false);
        }
    };

    const sectionCardStyle = [
        styles.section,
        {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            shadowColor: theme.text,
            shadowOpacity: themeMode === 'light' ? 0.12 : 0.24,
        },
    ];
    const toggleSection = (section: SettingsSectionKey) => {
        setExpandedSection((current) => current === section ? null : section);
    };
    const paletteLabels: Record<ThemePalette, string> = {
        default: 'فیروزه‌ای پیش‌فرض',
        skyBlue: 'آبی آسمانی',
        emerald: 'سبز زمردی',
        amber: 'کهربایی',
        ruby: 'قرمز یاقوتی',
        softPurple: 'ارغوانی ملایم',
        purple: 'بنفش',
        indigo: 'نیلی',
        deepTeal: 'فیروزه‌ای تیره',
        burntOrange: 'نارنجی سوخته',
        dustyRose: 'صورتی چرک',
        brown: 'قهوه‌ای',
        slateBlue: 'آبی نفتی',
        lightPurple: 'بنفش روشن',
        olive: 'سبز زیتونی',
        tealBlue: 'آبی فیروزه‌ای',
    };
    const fontLabels: Record<FontPreference, string> = {
        iransans: 'ایران سنس',
        vazir: 'وزیر',
        shabnam: 'شبنم',
        system: 'فونت پیش‌فرض سیستم',
    };
    const fontSizeLabels: Record<FontSizePreference, string> = {
        standard: 'استاندارد',
        large: 'بزرگ',
        extraLarge: 'خیلی بزرگ',
    };
    const themeLabels = {
        light: 'روشن',
        dark: 'تاریک',
        system: 'سیستم',
    } as const;
    const calculationSoundLabels: Record<CalculationSound, string> = {
        off: 'خاموش',
        message: 'پیام‌رسان کوتاه',
        messageSoft: 'پیام‌رسان ملایم',
        piano: 'پیانوی کوتاه و ملایم',
    };

    return (
        <ThemedView style={styles.container}>
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <SettingsSection
                    title="واحد نمایش مبالغ مزدی"
                    summary={currencyPreference === 'rial' ? 'ریال' : 'تومان'}
                    icon="cash-multiple"
                    expanded={expandedSection === 'currency'}
                    cardStyle={sectionCardStyle}
                    onToggle={() => toggleSection('currency')}
                >
                    <View accessibilityRole="radiogroup" style={styles.optionsCard}>
                        <SettingRow
                            icon="cash"
                            title="ریال"
                            selected={currencyPreference === 'rial'}
                            onPress={() => void handleCurrencyChange('rial')}
                        />
                        <SettingRow
                            icon="cash-multiple"
                            title="تومان"
                            selected={currencyPreference === 'toman'}
                            showDivider={false}
                            onPress={() => void handleCurrencyChange('toman')}
                        />
                    </View>
                </SettingsSection>

                <SettingsSection
                    title="طیف رنگ برنامه"
                    summary={paletteLabels[colorPalette]}
                    icon="palette-outline"
                    expanded={expandedSection === 'palette'}
                    cardStyle={sectionCardStyle}
                    onToggle={() => toggleSection('palette')}
                >
                    <View accessibilityRole="radiogroup" style={styles.optionsCard}>
                        <SettingRow
                            colorPreview={ColorPalettes.default[themeMode].primary}
                            title="فیروزه‌ای پیش‌فرض"
                            selected={colorPalette === 'default'}
                            onPress={() => void handleColorPaletteChange('default')}
                        />
                        <SettingRow
                            colorPreview={ColorPalettes.skyBlue[themeMode].primary}
                            title="آبی آسمانی"
                            selected={colorPalette === 'skyBlue'}
                            onPress={() => void handleColorPaletteChange('skyBlue')}
                        />
                        <SettingRow
                            colorPreview={ColorPalettes.emerald[themeMode].primary}
                            title="سبز زمردی"
                            selected={colorPalette === 'emerald'}
                            onPress={() => void handleColorPaletteChange('emerald')}
                        />
                        <SettingRow
                            colorPreview={ColorPalettes.amber[themeMode].primary}
                            title="کهربایی"
                            selected={colorPalette === 'amber'}
                            onPress={() => void handleColorPaletteChange('amber')}
                        />
                        <SettingRow
                            colorPreview={ColorPalettes.ruby[themeMode].primary}
                            title="قرمز یاقوتی"
                            selected={colorPalette === 'ruby'}
                            onPress={() => void handleColorPaletteChange('ruby')}
                        />
                        <SettingRow
                            colorPreview={ColorPalettes.softPurple[themeMode].primary}
                            title="ارغوانی ملایم"
                            selected={colorPalette === 'softPurple'}
                            onPress={() => void handleColorPaletteChange('softPurple')}
                        />
                        <SettingRow
                            colorPreview={ColorPalettes.purple[themeMode].primary}
                            title="بنفش"
                            selected={colorPalette === 'purple'}
                            onPress={() => void handleColorPaletteChange('purple')}
                        />
                        <SettingRow
                            colorPreview={ColorPalettes.indigo[themeMode].primary}
                            title="نیلی"
                            selected={colorPalette === 'indigo'}
                            onPress={() => void handleColorPaletteChange('indigo')}
                        />
                        <SettingRow
                            colorPreview={ColorPalettes.deepTeal[themeMode].primary}
                            title="فیروزه‌ای تیره"
                            selected={colorPalette === 'deepTeal'}
                            onPress={() => void handleColorPaletteChange('deepTeal')}
                        />
                        <SettingRow
                            colorPreview={ColorPalettes.burntOrange[themeMode].primary}
                            title="نارنجی سوخته"
                            selected={colorPalette === 'burntOrange'}
                            onPress={() => void handleColorPaletteChange('burntOrange')}
                        />
                        <SettingRow
                            colorPreview={ColorPalettes.dustyRose[themeMode].primary}
                            title="صورتی چرک"
                            selected={colorPalette === 'dustyRose'}
                            onPress={() => void handleColorPaletteChange('dustyRose')}
                        />
                        <SettingRow
                            colorPreview={ColorPalettes.brown[themeMode].primary}
                            title="قهوه‌ای"
                            selected={colorPalette === 'brown'}
                            onPress={() => void handleColorPaletteChange('brown')}
                        />
                        <SettingRow
                            colorPreview={ColorPalettes.slateBlue[themeMode].primary}
                            title="آبی نفتی"
                            selected={colorPalette === 'slateBlue'}
                            onPress={() => void handleColorPaletteChange('slateBlue')}
                        />
                        <SettingRow
                            colorPreview={ColorPalettes.lightPurple[themeMode].primary}
                            title="بنفش روشن"
                            selected={colorPalette === 'lightPurple'}
                            onPress={() => void handleColorPaletteChange('lightPurple')}
                        />
                        <SettingRow
                            colorPreview={ColorPalettes.olive[themeMode].primary}
                            title="سبز زیتونی"
                            selected={colorPalette === 'olive'}
                            onPress={() => void handleColorPaletteChange('olive')}
                        />
                        <SettingRow
                            colorPreview={ColorPalettes.tealBlue[themeMode].primary}
                            title="آبی فیروزه‌ای"
                            selected={colorPalette === 'tealBlue'}
                            showDivider={false}
                            onPress={() => void handleColorPaletteChange('tealBlue')}
                        />
                    </View>
                </SettingsSection>

                <SettingsSection
                    title="ظاهر برنامه"
                    summary={themeLabels[themePreference]}
                    icon="theme-light-dark"
                    expanded={expandedSection === 'appearance'}
                    cardStyle={sectionCardStyle}
                    onToggle={() => toggleSection('appearance')}
                >
                    <View style={styles.optionsCard}>
                        <SettingRow
                            icon="white-balance-sunny"
                            title="روشن"
                            selected={themePreference === 'light'}
                            disabled={themeChangePending}
                            onPress={() => void handleThemeChange('light')}
                        />
                        <SettingRow
                            icon="moon-waning-crescent"
                            title="تاریک"
                            selected={themePreference === 'dark'}
                            disabled={themeChangePending}
                            onPress={() => void handleThemeChange('dark')}
                        />
                        <SettingRow
                            icon="cellphone-cog"
                            title="سیستم"
                            selected={themePreference === 'system'}
                            disabled={themeChangePending}
                            showDivider={false}
                            onPress={() => void handleThemeChange('system')}
                        />
                    </View>
                </SettingsSection>

                <SettingsSection
                    title="صدای پایان محاسبه"
                    summary={calculationSoundLabels[calculationSound]}
                    icon="volume-high"
                    expanded={expandedSection === 'calculation-sound'}
                    cardStyle={sectionCardStyle}
                    onToggle={() => toggleSection('calculation-sound')}
                >
                    <View accessibilityRole="radiogroup" style={styles.optionsCard}>
                        <SettingRow
                            icon="volume-off"
                            title="خاموش"
                            selected={calculationSound === 'off'}
                            onPress={() => void handleCalculationSoundChange('off')}
                        />
                        <SettingRow
                            icon="message-outline"
                            title="پیام‌رسان کوتاه"
                            selected={calculationSound === 'message'}
                            onPress={() => void handleCalculationSoundChange('message')}
                        />
                        <SettingRow
                            icon="message-processing-outline"
                            title="پیام‌رسان ملایم"
                            selected={calculationSound === 'messageSoft'}
                            onPress={() => void handleCalculationSoundChange('messageSoft')}
                        />
                        <SettingRow
                            icon="music-note"
                            title="پیانوی کوتاه و ملایم"
                            selected={calculationSound === 'piano'}
                            showDivider={false}
                            onPress={() => void handleCalculationSoundChange('piano')}
                        />
                    </View>
                </SettingsSection>

                <SettingsSection
                    title="فونت برنامه"
                    summary={fontLabels[fontPreference]}
                    icon="format-font"
                    expanded={expandedSection === 'font'}
                    cardStyle={sectionCardStyle}
                    onToggle={() => toggleSection('font')}
                >
                    <View accessibilityRole="radiogroup" style={styles.optionsCard}>
                        <SettingRow
                            icon="format-font"
                            title="ایران سنس"
                            selected={fontPreference === 'iransans'}
                            previewFont="iransans"
                            disabled={fontChangePending}
                            onPress={() => void handleFontChange('iransans')}
                        />
                        <SettingRow
                            icon="format-font"
                            title="وزیر"
                            selected={fontPreference === 'vazir'}
                            previewFont="vazir"
                            disabled={fontChangePending}
                            onPress={() => void handleFontChange('vazir')}
                        />
                        <SettingRow
                            icon="format-font"
                            title="شبنم"
                            selected={fontPreference === 'shabnam'}
                            previewFont="shabnam"
                            disabled={fontChangePending}
                            onPress={() => void handleFontChange('shabnam')}
                        />
                        <SettingRow
                            icon="format-font"
                            title="فونت پیش‌فرض سیستم"
                            selected={fontPreference === 'system'}
                            previewFont="system"
                            disabled={fontChangePending}
                            showDivider={false}
                            onPress={() => void handleFontChange('system')}
                        />
                    </View>
                </SettingsSection>

                <SettingsSection
                    title="اندازهٔ نوشته‌ها"
                    summary={fontSizeLabels[fontSizePreference]}
                    icon="format-size"
                    expanded={expandedSection === 'font-size'}
                    cardStyle={sectionCardStyle}
                    onToggle={() => toggleSection('font-size')}
                >
                    <View accessibilityRole="radiogroup" style={styles.optionsCard}>
                        <SettingRow
                            icon="format-size"
                            title="استاندارد"
                            selected={fontSizePreference === 'standard'}
                            disabled={fontSizeChangePending}
                            onPress={() => void handleFontSizeChange('standard')}
                        />
                        <SettingRow
                            icon="format-size"
                            title="بزرگ"
                            selected={fontSizePreference === 'large'}
                            disabled={fontSizeChangePending}
                            onPress={() => void handleFontSizeChange('large')}
                        />
                        <SettingRow
                            icon="format-size"
                            title="خیلی بزرگ"
                            selected={fontSizePreference === 'extraLarge'}
                            disabled={fontSizeChangePending}
                            showDivider={false}
                            onPress={() => void handleFontSizeChange('extraLarge')}
                        />
                    </View>
                </SettingsSection>
            </ScrollView>

            <Snackbar
                visible={fontSizeActionError.length > 0 || fontActionError.length > 0 || !!fontLoadError || currencyActionError.length > 0 || !!currencyError || paletteActionError.length > 0 || calculationSoundActionError.length > 0 || !!calculationSoundError}
                onDismiss={fontSizeActionError ? () => setFontSizeActionError('') : calculationSoundActionError || calculationSoundError ? () => {
                    setCalculationSoundActionError('');
                    clearCalculationSoundError();
                } : paletteActionError ? () => setPaletteActionError('') : currencyActionError || currencyError ? dismissCurrencyError : dismissFontError}
                duration={5000}
            >
                {fontSizeActionError || calculationSoundActionError || calculationSoundError || paletteActionError || currencyActionError || currencyError || fontActionError || fontLoadError}
            </Snackbar>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    scrollContent: {
        width: '100%',
        maxWidth: 680,
        alignSelf: 'center',
        paddingHorizontal: Spacing.four,
        paddingTop: Spacing.four,
        paddingBottom: Spacing.five,
        gap: Spacing.three,
    },
    section: {
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: Radius.lg,
        elevation: 2,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 5,
    },
    sectionHeader: {
        minHeight: 72,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.two,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
    },
    sectionIcon: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: Radius.md,
    },
    sectionHeadingText: {
        flex: 1,
        gap: Spacing.half,
    },
    sectionContent: {
        borderTopWidth: StyleSheet.hairlineWidth,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
    },
    optionsCard: {
        overflow: 'hidden',
        borderRadius: Radius.md,
    },
    optionRow: {
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
    },
    optionSelect: {
        minHeight: 56,
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.three,
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.two,
    },
    optionIcon: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    paletteSwatch: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
    },
    optionText: { flex: 1 },
    fontPreview: { fontSize: Typography.fontSize.bodySmall, lineHeight: Typography.lineHeight.body },
    disabledRow: { opacity: 0.55 },
});
