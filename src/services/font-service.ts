import { loadAsync } from 'expo-font';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';

import { ColorPalettes, type ThemePalette } from '@/constants/theme';
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
    fallbackWeight?: AppFontWeight
): StyleProp<TextStyle> {
    const flattenedStyle = StyleSheet.flatten(style);
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

    if (!fontWeight) return style;

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
) {
    const baseTheme = theme === 'dark' ? darkTheme : lightTheme;
    const colors = ColorPalettes[palette][theme];
    const paperColors = {
        ...baseTheme.colors,
        primary: colors.primary,
        onPrimary: colors.onPrimary,
        primaryContainer: colors.primaryContainer,
        onPrimaryContainer: palette === 'default'
            ? theme === 'dark' ? '#E0F7FA' : '#002528'
            : colors.text,
        secondary: colors.secondary,
        onSecondary: colors.onSecondary,
        secondaryContainer: palette === 'default'
            ? baseTheme.colors.secondaryContainer
            : colors.primaryContainer,
        onSecondaryContainer: palette === 'default'
            ? baseTheme.colors.onSecondaryContainer
            : colors.text,
        background: colors.background,
        surface: colors.surface,
        surfaceVariant: colors.surfaceVariant,
        surfaceContainer: colors.surfaceElevated,
        outline: colors.borderStrong,
        outlineVariant: colors.border,
        error: colors.error,
        ...(palette !== 'default' && {
            onBackground: colors.text,
            onSurface: colors.text,
            onSurfaceVariant: colors.textSecondary,
            surfaceTint: colors.primary,
            inversePrimary: colors.primary,
            surfaceContainerLowest: colors.surface,
            surfaceContainerLow: colors.surface,
            surfaceContainerHigh: colors.surfaceElevated,
            surfaceContainerHighest: colors.surfaceVariant,
            backdrop: colors.overlay,
        }),
    };
    const fonts = Object.fromEntries(
        Object.entries(baseTheme.fonts).map(([variant, font]) => {
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
