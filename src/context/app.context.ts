import { Colors, type AppColorPalette, type ThemePalette } from '@/constants/theme';
import { createContext } from 'react';

export type ThemeType = keyof typeof Colors;
export type ThemePreference = ThemeType | 'system';
export type FontPreference = 'iransans' | 'vazir' | 'shabnam' | 'system';
export type CurrencyPreference = 'rial' | 'toman';
export type CalculationSound = 'off' | 'message' | 'messageSoft' | 'piano';

export interface AppContextType {
    theme: ThemeType;
    themePreference: ThemePreference;
    colorPalette: ThemePalette;
    fontPreference: FontPreference;
    fontError: string | null;
    currencyPreference: CurrencyPreference;
    currencyError: string | null;
    calculationSound: CalculationSound;
    calculationSoundError: string | null;
    calculationFeedbackSequence: number;
    calculationSoundPreviewSequence: number;
    calculationSoundPreview: Exclude<CalculationSound, 'off'> | null;
    themeReady: boolean;
    colors: AppColorPalette;
    isRTL: boolean;
    setTheme: (theme: ThemePreference) => void;
    setColorPalette: (palette: ThemePalette) => Promise<void>;
    setFontPreference: (font: FontPreference) => Promise<void>;
    setCurrencyPreference: (currency: CurrencyPreference) => Promise<void>;
    setCalculationSound: (sound: CalculationSound) => Promise<void>;
    notifyCalculationCompleted: () => void;
    previewCalculationSound: (sound: Exclude<CalculationSound, 'off'>) => void;
    clearFontError: () => void;
    clearCurrencyError: () => void;
    clearCalculationSoundError: () => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);
