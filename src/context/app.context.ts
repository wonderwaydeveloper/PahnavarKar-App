import { Colors, type AppColorPalette, type ThemePalette, type ThemePaletteTone } from '@/constants/theme';
import type { FontSizePreference } from '@/constants/font-scale';
import { createContext } from 'react';

export type { FontSizePreference } from '@/constants/font-scale';

export type ThemeType = keyof typeof Colors;
export type ThemePreference = ThemeType | 'system';
export type FontPreference = 'iransans' | 'vazir' | 'shabnam' | 'system';
export type CurrencyPreference = 'rial' | 'toman';
export type CalculationSound =
    | 'off'
    | 'pianoModernBright'
    | 'pianoModernSoft'
    | 'piano'
    | 'pianoMelody'
    | 'pianoSoulful';

export interface AppContextType {
    theme: ThemeType;
    themePreference: ThemePreference;
    colorPalette: ThemePalette;
    colorPaletteTone: ThemePaletteTone | null;
    fontPreference: FontPreference;
    fontSizePreference: FontSizePreference;
    fontError: string | null;
    currencyPreference: CurrencyPreference;
    currencyError: string | null;
    calculationSound: CalculationSound;
    calculationSoundError: string | null;
    calculationFeedbackSequence: number;
    themeReady: boolean;
    colors: AppColorPalette;
    isRTL: boolean;
    setTheme: (theme: ThemePreference) => Promise<void>;
    setColorPalette: (palette: ThemePalette, tone?: ThemePaletteTone | null) => Promise<void>;
    setFontPreference: (font: FontPreference) => Promise<void>;
    setFontSizePreference: (size: FontSizePreference) => Promise<void>;
    setCurrencyPreference: (currency: CurrencyPreference) => Promise<void>;
    setCalculationSound: (sound: CalculationSound) => Promise<void>;
    notifyCalculationCompleted: () => void;
    clearFontError: () => void;
    clearCurrencyError: () => void;
    clearCalculationSoundError: () => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);
