import { ColorPalettes, type ThemePalette } from '@/constants/theme';
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
const FONT_PREFERENCE_STORAGE_KEY = '@pahnavarkar/font-preference';
const CURRENCY_PREFERENCE_STORAGE_KEY = '@pahnavarkar/currency-preference';
const CALCULATION_SOUND_STORAGE_KEY = '@pahnavarkar/calculation-sound';

function isThemePreference(value: string | null): value is ThemePreference {
    return value === 'light' || value === 'dark' || value === 'system';
}

function isThemePalette(value: string | null): value is ThemePalette {
    return value === 'default'
        || value === 'blue'
        || value === 'green'
        || value === 'yellow'
        || value === 'red'
        || value === 'pink';
}

function isFontPreference(value: string | null): value is FontPreference {
    return value === 'iransans' || value === 'vazir' || value === 'shabnam' || value === 'system';
}

function isCurrencyPreference(value: string | null): value is CurrencyPreference {
    return value === 'rial' || value === 'toman';
}

function migrateCalculationSound(value: string | null): CalculationSound | null {
    switch (value) {
        case 'off':
        case 'message':
        case 'messageSoft':
        case 'piano':
            return value;
        case 'alert':
            return 'message';
        case 'gentle':
            return 'piano';
        case 'bright':
            return 'messageSoft';
        case 'system':
            return 'message';
        default:
            return null;
    }
}

export function AppProvider({ children }: AppProviderProps) {
    const colorScheme = useColorScheme();
    const [themePreference, setThemePreference] = useState<ThemePreference>('system');
    const [colorPalette, setColorPaletteState] = useState<ThemePalette>('default');
    const [fontPreference, setFontPreference] = useState<FontPreference>('vazir');
    const [fontError, setFontError] = useState<string | null>(null);
    const [currencyPreference, setCurrencyPreference] = useState<CurrencyPreference>('rial');
    const [currencyError, setCurrencyError] = useState<string | null>(null);
    const [calculationSound, setCalculationSoundState] = useState<CalculationSound>('message');
    const [calculationSoundError, setCalculationSoundError] = useState<string | null>(null);
    const [calculationFeedbackSequence, setCalculationFeedbackSequence] = useState(0);
    const [calculationSoundPreviewSequence, setCalculationSoundPreviewSequence] = useState(0);
    const [calculationSoundPreview, setCalculationSoundPreview] = useState<Exclude<CalculationSound, 'off'> | null>(null);
    const [themeReady, setThemeReady] = useState(false);
    const [isRTL] = useState(() => I18nManager.isRTL);

    useEffect(() => {
        let isMounted = true;

        const loadAppPreferences = async () => {
            let storedFontPreference: FontPreference = 'vazir';

            try {
                const [storedTheme, storedPalette, storedFont, storedCurrency, storedCalculationSound] = await Promise.all([
                    AsyncStorage.getItem(THEME_PREFERENCE_STORAGE_KEY),
                    AsyncStorage.getItem(COLOR_PALETTE_STORAGE_KEY),
                    AsyncStorage.getItem(FONT_PREFERENCE_STORAGE_KEY),
                    AsyncStorage.getItem(CURRENCY_PREFERENCE_STORAGE_KEY),
                    AsyncStorage.getItem(CALCULATION_SOUND_STORAGE_KEY),
                ]);
                if (isMounted && isThemePreference(storedTheme)) {
                    setThemePreference(storedTheme);
                }
                if (isMounted && isThemePalette(storedPalette)) {
                    setColorPaletteState(storedPalette);
                }
                if (isMounted && isFontPreference(storedFont)) {
                    storedFontPreference = storedFont;
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
            } finally {
                if (isMounted) {
                    setFontPreference(resolvedFontPreference);
                    setThemeReady(true);
                }
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

    const handleSetTheme = useCallback((nextTheme: ThemePreference) => {
        setThemePreference(nextTheme);
        void AsyncStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, nextTheme).catch(() => undefined);
    }, []);

    const handleSetColorPalette = useCallback(async (nextPalette: ThemePalette) => {
        await AsyncStorage.setItem(COLOR_PALETTE_STORAGE_KEY, nextPalette);
        setColorPaletteState(nextPalette);
    }, []);

    const handleSetFontPreference = useCallback(async (nextFont: FontPreference) => {
        await loadAppFonts(nextFont);
        await AsyncStorage.setItem(FONT_PREFERENCE_STORAGE_KEY, nextFont);
        setFontPreference(nextFont);
        setFontError(null);
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
        () => ColorPalettes[colorPalette][resolvedTheme],
        [colorPalette, resolvedTheme],
    );
    const paperTheme = useMemo(
        () => getAppPaperTheme(resolvedTheme, fontPreference, colorPalette),
        [colorPalette, fontPreference, resolvedTheme]
    );
    const clearFontError = useCallback(() => setFontError(null), []);
    const clearCurrencyError = useCallback(() => setCurrencyError(null), []);
    const clearCalculationSoundError = useCallback(() => setCalculationSoundError(null), []);
    const notifyCalculationCompleted = useCallback(() => {
        setCalculationFeedbackSequence((sequence) => sequence + 1);
    }, []);
    const previewCalculationSound = useCallback((previewSound: Exclude<CalculationSound, 'off'>) => {
        setCalculationSoundPreview(previewSound);
        setCalculationSoundPreviewSequence((sequence) => sequence + 1);
    }, []);

    const value: AppContextType = {
        theme: resolvedTheme,
        themePreference,
        colorPalette,
        fontPreference,
        fontError,
        currencyPreference,
        currencyError,
        calculationSound,
        calculationSoundError,
        calculationFeedbackSequence,
        calculationSoundPreviewSequence,
        calculationSoundPreview,
        themeReady,
        colors,
        isRTL,
        setTheme: handleSetTheme,
        setColorPalette: handleSetColorPalette,
        setFontPreference: handleSetFontPreference,
        setCurrencyPreference: handleSetCurrencyPreference,
        setCalculationSound: handleSetCalculationSound,
        notifyCalculationCompleted,
        previewCalculationSound,
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
                    previewSound={calculationSoundPreview}
                    previewSequence={calculationSoundPreviewSequence}
                />
            </PaperProvider>
        </AppContext.Provider>
    );
}
