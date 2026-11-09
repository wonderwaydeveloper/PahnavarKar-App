import { ColorPalettes, getAppColorPalette, type ThemePalette, type ThemePaletteTone } from '@/constants/theme';
import { FONT_SIZE_PREFERENCES, type FontSizePreference } from '@/constants/font-scale';
import { CalculationFeedbackHost } from '@/components/calculation-feedback-host';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { I18nManager, useColorScheme } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { getAppPaperTheme, loadAppFonts } from '@/services/font-service';
import {
    AppContext,
    type AppContextType,
    type CurrencyPreference,
    type CalculationSound,
    type FontPreference,
    type ThemePreference,
    type ThemeType,
} from './app.context';

interface AppProviderProps {
    children: React.ReactNode;
}

const THEME_PREFERENCE_STORAGE_KEY = '@pahnavarkar/theme-preference';
const COLOR_PALETTE_STORAGE_KEY = '@pahnavarkar/color-palette';
const COLOR_PALETTE_TONE_STORAGE_KEY = '@pahnavarkar/color-palette-tone';
const FONT_PREFERENCE_STORAGE_KEY = '@pahnavarkar/font-preference';
const FONT_SIZE_PREFERENCE_STORAGE_KEY = '@pahnavarkar/font-size-preference';
const CURRENCY_PREFERENCE_STORAGE_KEY = '@pahnavarkar/currency-preference';
const CALCULATION_SOUND_STORAGE_KEY = '@pahnavarkar/calculation-sound';

function isThemePreference(value: string | null): value is ThemePreference {
    return value === 'light' || value === 'dark' || value === 'system';
}

function isThemePalette(value: string | null): value is ThemePalette {
    if (value === null) return false;
    return Object.prototype.hasOwnProperty.call(ColorPalettes, value);
}

function parseThemePaletteTone(value: string | null): ThemePaletteTone | null {
    switch (value) {
        case '25':
            return 25;
        case '50':
            return 50;
        case '75':
            return 75;
        case '35':
            return 25;
        case '65':
            return 75;
        default:
            return 50;
    }
}

function isFontPreference(value: string | null): value is FontPreference {
    return value === 'iransans' || value === 'vazir' || value === 'shabnam' || value === 'system';
}

function isFontSizePreference(value: string | null): value is FontSizePreference {
    return FONT_SIZE_PREFERENCES.some((preference) => preference === value);
}

function isCurrencyPreference(value: string | null): value is CurrencyPreference {
    return value === 'rial' || value === 'toman';
}

function migrateCalculationSound(value: string | null): CalculationSound | null {
    switch (value) {
        case 'off':
        case 'pianoModernBright':
        case 'pianoModernSoft':
        case 'piano':
        case 'pianoMelody':
        case 'pianoSoulful':
            return value;
        case 'pianoChord':
        case 'waterDrop':
            return 'pianoSoulful';
        case 'message':
            return 'pianoModernBright';
        case 'messageSoft':
            return 'pianoModernSoft';
        case 'notesBright':
        case 'violin':
            return 'pianoMelody';
        case 'notesSoft':
            return 'pianoSoulful';
        case 'alert':
            return 'pianoModernBright';
        case 'gentle':
            return 'piano';
        case 'bright':
            return 'pianoModernSoft';
        case 'system':
            return 'pianoModernBright';
        default:
            return null;
    }
}

export function AppProvider({ children }: AppProviderProps) {
    const colorScheme = useColorScheme();
    const [themePreference, setThemePreference] = useState<ThemePreference>('system');
    const [colorPalette, setColorPaletteState] = useState<ThemePalette>('default');
    const [colorPaletteTone, setColorPaletteToneState] = useState<ThemePaletteTone | null>(50);
    const [fontPreference, setFontPreference] = useState<FontPreference>('vazir');
    const [fontSizePreference, setFontSizePreferenceState] = useState<FontSizePreference>('standard');
    const [fontError, setFontError] = useState<string | null>(null);
    const [currencyPreference, setCurrencyPreference] = useState<CurrencyPreference>('rial');
    const [currencyError, setCurrencyError] = useState<string | null>(null);
    const [calculationSound, setCalculationSoundState] = useState<CalculationSound>('pianoModernBright');
    const [calculationSoundError, setCalculationSoundError] = useState<string | null>(null);
    const [calculationFeedbackSequence, setCalculationFeedbackSequence] = useState(0);
    const [themeReady, setThemeReady] = useState(false);
    const [isRTL] = useState(() => I18nManager.isRTL);

    useEffect(() => {
        let isMounted = true;

        const loadAppPreferences = async () => {
            let storedFontPreference: FontPreference = 'vazir';

            try {
                const [storedTheme, storedPalette, storedPaletteTone, storedFont, storedFontSize, storedCurrency, storedCalculationSound] = await Promise.all([
                    AsyncStorage.getItem(THEME_PREFERENCE_STORAGE_KEY),
                    AsyncStorage.getItem(COLOR_PALETTE_STORAGE_KEY),
                    AsyncStorage.getItem(COLOR_PALETTE_TONE_STORAGE_KEY),
                    AsyncStorage.getItem(FONT_PREFERENCE_STORAGE_KEY),
                    AsyncStorage.getItem(FONT_SIZE_PREFERENCE_STORAGE_KEY),
                    AsyncStorage.getItem(CURRENCY_PREFERENCE_STORAGE_KEY),
                    AsyncStorage.getItem(CALCULATION_SOUND_STORAGE_KEY),
                ]);
                if (isMounted && isThemePreference(storedTheme)) {
                    setThemePreference(storedTheme);
                }
                if (isMounted && isThemePalette(storedPalette)) {
                    setColorPaletteState(storedPalette);
                    const parsedPaletteTone = parseThemePaletteTone(storedPaletteTone);
                    setColorPaletteToneState(parsedPaletteTone);
                    if (storedPaletteTone !== String(parsedPaletteTone)) {
                        await AsyncStorage.setItem(COLOR_PALETTE_TONE_STORAGE_KEY, String(parsedPaletteTone));
                    }
                }
                if (isMounted && isFontPreference(storedFont)) {
                    storedFontPreference = storedFont;
                }
                if (isMounted && isFontSizePreference(storedFontSize)) {
                    setFontSizePreferenceState(storedFontSize);
                }
                if (isMounted && isCurrencyPreference(storedCurrency)) {
                    setCurrencyPreference(storedCurrency);
                }
                const migratedCalculationSound = migrateCalculationSound(storedCalculationSound);
                if (isMounted && migratedCalculationSound) {
                    setCalculationSoundState(migratedCalculationSound);
                    if (storedCalculationSound !== migratedCalculationSound) {
                        await AsyncStorage.setItem(CALCULATION_SOUND_STORAGE_KEY, migratedCalculationSound);
                    }
                }
            } catch (error) {
                console.error('Unable to load saved app preferences', error);
                if (isMounted) {
                    setFontError('ذخیرهٔ تنظیمات برنامه خوانده نشد؛ فونت پیش‌فرض بارگذاری می‌شود.');
                    setCurrencyError('تنظیم واحد پول خوانده نشد؛ ریال به‌عنوان پیش‌فرض استفاده می‌شود.');
                    setCalculationSoundError('تنظیم صدای پایان محاسبه خوانده نشد؛ صدا غیرفعال می‌ماند.');
                }
            }

            let resolvedFontPreference = storedFontPreference;
            try {
                await loadAppFonts(storedFontPreference);
            } catch (error) {
                console.error('Unable to load the selected app font', error);
                resolvedFontPreference = 'iransans';

                if (storedFontPreference !== 'iransans') {
                    try {
                        await loadAppFonts('iransans');
                        if (isMounted) {
                            setFontError('فونت ذخیره‌شده بارگذاری نشد؛ فونت پیش‌فرض جایگزین شد.');
                        }
                    } catch (fallbackError) {
                        console.error('Unable to load the default app font', fallbackError);
                        if (isMounted) {
                            setFontError('بارگذاری فونت‌ها انجام نشد؛ لطفاً برنامه را دوباره اجرا کنید.');
                        }
                    }
                } else if (isMounted) {
                    setFontError('بارگذاری فونت‌ها انجام نشد؛ لطفاً برنامه را دوباره اجرا کنید.');
                }
            }

            if (isMounted) {
                setFontPreference(resolvedFontPreference);
                setThemeReady(true);
            }
        };

        void loadAppPreferences();

        return () => {
            isMounted = false;
        };
    }, []);

    const resolvedTheme = useMemo<ThemeType>(() => {
        if (themePreference !== 'system') {
            return themePreference;
        }

        return colorScheme === 'dark' ? 'dark' : 'light';
    }, [colorScheme, themePreference]);

    const handleSetTheme = useCallback(async (nextTheme: ThemePreference) => {
        await AsyncStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, nextTheme);
        setThemePreference(nextTheme);
    }, []);

    const handleSetColorPalette = useCallback(async (
        nextPalette: ThemePalette,
        nextTone: ThemePaletteTone | null = null,
    ) => {
        await AsyncStorage.multiSet([
            [COLOR_PALETTE_STORAGE_KEY, nextPalette],
            [COLOR_PALETTE_TONE_STORAGE_KEY, nextTone === null ? '' : String(nextTone)],
        ]);
        setColorPaletteState(nextPalette);
        setColorPaletteToneState(nextTone);
    }, []);

    const handleSetFontPreference = useCallback(async (nextFont: FontPreference) => {
        await loadAppFonts(nextFont);
        await AsyncStorage.setItem(FONT_PREFERENCE_STORAGE_KEY, nextFont);
        setFontPreference(nextFont);
        setFontError(null);
    }, []);

    const handleSetFontSizePreference = useCallback(async (nextSize: FontSizePreference) => {
        await AsyncStorage.setItem(FONT_SIZE_PREFERENCE_STORAGE_KEY, nextSize);
        setFontSizePreferenceState(nextSize);
    }, []);

    const handleSetCurrencyPreference = useCallback(async (nextCurrency: CurrencyPreference) => {
        await AsyncStorage.setItem(CURRENCY_PREFERENCE_STORAGE_KEY, nextCurrency);
        setCurrencyPreference(nextCurrency);
        setCurrencyError(null);
    }, []);
    const handleSetCalculationSound = useCallback(async (nextSound: CalculationSound) => {
        await AsyncStorage.setItem(CALCULATION_SOUND_STORAGE_KEY, nextSound);
        setCalculationSoundState(nextSound);
        setCalculationSoundError(null);
    }, []);

    const colors = useMemo(
        () => getAppColorPalette(colorPalette, resolvedTheme, colorPaletteTone),
        [colorPalette, colorPaletteTone, resolvedTheme],
    );
    const paperTheme = useMemo(
        () => getAppPaperTheme(resolvedTheme, fontPreference, colors, fontSizePreference),
        [colors, fontPreference, fontSizePreference, resolvedTheme]
    );
    const clearFontError = useCallback(() => setFontError(null), []);
    const clearCurrencyError = useCallback(() => setCurrencyError(null), []);
    const clearCalculationSoundError = useCallback(() => setCalculationSoundError(null), []);
    const notifyCalculationCompleted = useCallback(() => {
        setCalculationFeedbackSequence((sequence) => sequence + 1);
    }, []);

    const value: AppContextType = {
        theme: resolvedTheme,
        themePreference,
        colorPalette,
        colorPaletteTone,
        fontPreference,
        fontSizePreference,
        fontError,
        currencyPreference,
        currencyError,
        calculationSound,
        calculationSoundError,
        calculationFeedbackSequence,
        themeReady,
        colors,
        isRTL,
        setTheme: handleSetTheme,
        setColorPalette: handleSetColorPalette,
        setFontPreference: handleSetFontPreference,
        setFontSizePreference: handleSetFontSizePreference,
        setCurrencyPreference: handleSetCurrencyPreference,
        setCalculationSound: handleSetCalculationSound,
        notifyCalculationCompleted,
        clearFontError,
        clearCurrencyError,
        clearCalculationSoundError,
    };

    return (
        <AppContext.Provider value={value}>
            <PaperProvider theme={paperTheme}>
                {children}
                <CalculationFeedbackHost
                    sound={calculationSound}
                    sequence={calculationFeedbackSequence}
                />
            </PaperProvider>
        </AppContext.Provider>
    );
}
