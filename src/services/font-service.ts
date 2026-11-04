import { loadAsync } from 'expo-font';
import { type StyleProp, type TextStyle } from 'react-native';

import { ColorPalettes, type ThemePalette } from '@/constants/theme';
import { getScaledTextStyle, type FontSizePreference } from '@/constants/font-scale';
import type { FontPreference, ThemeType } from '@/context/app.context';
import { darkTheme, lightTheme } from '@/constants/themes';

export type AppFontWeight = 'Light' | 'Regular' | 'Medium' | 'SemiBold' | 'Bold';
type CustomFontPreference = Exclude<FontPreference, 'system'>;

const FONT_WEIGHTS: AppFontWeight[] = ['Light', 'Regular', 'Medium', 'SemiBold', 'Bold'];
const SYSTEM_FONT_WEIGHTS: Record<AppFontWeight, TextStyle['fontWeight']> = {
    Light: '300',
    Regular: '400',
    Medium: '500',
    SemiBold: '600',
    Bold: '700',
};

const FONT_ASSETS = {
    iransans: {
        Light: require('../../assets/fonts/iransans/IRANSansX-Light.ttf'),
        Regular: require('../../assets/fonts/iransans/IRANSansX-Regular.ttf'),
        Medium: require('../../assets/fonts/iransans/IRANSansX-Medium.ttf'),
        SemiBold: require('../../assets/fonts/iransans/IRANSansX-DemiBold.ttf'),
        Bold: require('../../assets/fonts/iransans/IRANSansX-Bold.ttf'),
    },
    vazir: {
        Light: require('../../assets/fonts/vazir/Vazirmatn-Light.ttf'),
        Regular: require('../../assets/fonts/vazir/Vazirmatn-Regular.ttf'),
        Medium: require('../../assets/fonts/vazir/Vazirmatn-Medium.ttf'),
        SemiBold: require('../../assets/fonts/vazir/Vazirmatn-SemiBold.ttf'),
        Bold: require('../../assets/fonts/vazir/Vazirmatn-Bold.ttf'),
    },
    shabnam: {
        Light: require('../../assets/fonts/shabnam/Shabnam-Light-FD.ttf'),
        Regular: require('../../assets/fonts/shabnam/Shabnam-FD.ttf'),
        Medium: require('../../assets/fonts/shabnam/Shabnam-Medium-FD.ttf'),
        // Shabnam has no Semibold file; use Medium for this app weight.
        SemiBold: require('../../assets/fonts/shabnam/Shabnam-Medium-FD.ttf'),
        Bold: require('../../assets/fonts/shabnam/Shabnam-Bold-FD.ttf'),
    },
} satisfies Record<CustomFontPreference, Record<AppFontWeight, number>>;

const loadedFonts = new Set<CustomFontPreference>();
const loadingFonts = new Map<CustomFontPreference, Promise<void>>();

export function getAppFontFamily(preference: CustomFontPreference, weight: AppFontWeight): string {
    const family = {
        iransans: 'IRANSansX',
        vazir: 'Vazirmatn',
        shabnam: 'Shabnam',
    }[preference];
    return `Pahnavar-${family}-${weight}`;
}

export function getAppFontWeight(fontFamily?: string): AppFontWeight | undefined {
    if (!fontFamily) return undefined;

    const match = /AppFont-(Light|Regular|Medium|SemiBold|Bold)$/.exec(fontFamily);
    return FONT_WEIGHTS.find((weight) => weight === match?.[1]);
}

export async function loadAppFonts(preference: FontPreference): Promise<void> {
    if (preference === 'system') return;

    if (loadedFonts.has(preference)) return;

    const pendingLoad = loadingFonts.get(preference);
    if (pendingLoad) {
        await pendingLoad;
        return;
    }

    const fontMap = Object.fromEntries(
        FONT_WEIGHTS.map((weight) => [getAppFontFamily(preference, weight), FONT_ASSETS[preference][weight]])
    );
    const load = loadAsync(fontMap).then(() => {
        loadedFonts.add(preference);
    }).finally(() => {
        loadingFonts.delete(preference);
    });

    loadingFonts.set(preference, load);
    await load;
}

export function getAppFontStyle(
    style: StyleProp<TextStyle>,
    preference: FontPreference,
    fallbackWeight?: AppFontWeight,
    fontSizePreference: FontSizePreference = 'standard',
): StyleProp<TextStyle> {
    const flattenedStyle = getScaledTextStyle(style, fontSizePreference);
    const currentWeight = getAppFontWeight(flattenedStyle?.fontFamily);
    const declaredWeight = Number(flattenedStyle?.fontWeight);
    const weightFromFontWeight = declaredWeight >= 700
        ? 'Bold'
        : declaredWeight >= 600
            ? 'SemiBold'
            : declaredWeight >= 500
                ? 'Medium'
                : declaredWeight > 0 && declaredWeight <= 300
                    ? 'Light'
                    : undefined;
    const fontWeight = currentWeight ?? weightFromFontWeight ?? fallbackWeight;

    if (preference === 'system') {
        return {
            ...flattenedStyle,
            fontFamily: undefined,
            fontWeight: fontWeight
                ? SYSTEM_FONT_WEIGHTS[fontWeight]
                : flattenedStyle?.fontWeight,
        };
    }

    if (!fontWeight) return flattenedStyle ?? style;

    return {
        ...flattenedStyle,
        fontFamily: getAppFontFamily(preference, fontWeight),
        fontWeight: 'normal',
    };
}

export function getAppPaperTheme(
    theme: ThemeType,
    preference: FontPreference,
    palette: ThemePalette = 'default',
    fontSizePreference: FontSizePreference = 'standard',
) {
    const baseTheme = theme === 'dark' ? darkTheme : lightTheme;
    const colors = ColorPalettes[palette][theme];
    const paperColors = {
        ...baseTheme.colors,
        primary: colors.primary,
        onPrimary: colors.onPrimary,
        primaryContainer: colors.primaryContainer,
        onPrimaryContainer: colors.onPrimaryContainer,
        secondary: colors.secondary,
        onSecondary: colors.onSecondary,
        secondaryContainer: colors.secondaryContainer,
        onSecondaryContainer: colors.onSecondaryContainer,
        tertiary: colors.tertiary,
        onTertiary: colors.onTertiary,
        tertiaryContainer: colors.tertiaryContainer,
        onTertiaryContainer: colors.onTertiaryContainer,
        background: colors.background,
        onBackground: colors.text,
        surface: colors.surface,
        onSurface: colors.text,
        surfaceVariant: colors.surfaceVariant,
        onSurfaceVariant: colors.textSecondary,
        surfaceDim: colors.surfaceDim,
        surfaceBright: colors.surfaceBright,
        surfaceContainerLowest: colors.surfaceContainerLowest,
        surfaceContainerLow: colors.surfaceContainerLow,
        surfaceContainer: colors.surfaceElevated,
        surfaceContainerHigh: colors.surfaceContainerHigh,
        surfaceContainerHighest: colors.surfaceContainerHighest,
        outline: colors.borderStrong,
        outlineVariant: colors.border,
        error: colors.error,
        onError: colors.onError,
        errorContainer: colors.errorFill,
        onErrorContainer: colors.onErrorFill,
        inverseSurface: colors.inverseSurface,
        inverseOnSurface: colors.inverseOnSurface,
        inversePrimary: colors.inversePrimary,
        surfaceTint: colors.surfaceTint,
        shadow: colors.shadow,
        scrim: colors.scrim,
        backdrop: colors.overlay,
    };
    const fonts = Object.fromEntries(
        Object.entries(baseTheme.fonts).map(([variant, baseFont]) => {
            const font = getScaledTextStyle(baseFont, fontSizePreference) ?? baseFont;
            const weight = getAppFontWeight(font.fontFamily);
            return [
                variant,
                preference === 'system'
                    ? { ...font, fontFamily: undefined }
                    : weight
                        ? { ...font, fontFamily: getAppFontFamily(preference, weight) }
                        : font,
            ];
        })
    ) as typeof baseTheme.fonts;

    return { ...baseTheme, colors: paperColors, fonts };
}
