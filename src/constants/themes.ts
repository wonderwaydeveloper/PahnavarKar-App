import { Typography } from './typography';
import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

import { Colors, type AppColorPalette } from './theme';

const lightPalette = Colors.light;
const darkPalette = Colors.dark;

function withAlpha(hex: string, alpha: number): string {
    const red = Number.parseInt(hex.slice(1, 3), 16);
    const green = Number.parseInt(hex.slice(3, 5), 16);
    const blue = Number.parseInt(hex.slice(5, 7), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function getPaperColorRoles(
    colors: AppColorPalette,
    baseColors: typeof MD3LightTheme.colors,
) {
    return {
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
        surfaceDisabled: withAlpha(colors.text, 0.12),
        onSurfaceDisabled: withAlpha(colors.text, 0.38),
        surfaceDim: colors.surfaceDim,
        surfaceBright: colors.surfaceBright,
        surfaceContainerLowest: colors.surfaceContainerLowest,
        surfaceContainerLow: colors.surfaceContainerLow,
        surfaceContainer: colors.surfaceContainer,
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
        elevation: {
            ...baseColors.elevation,
            level1: colors.surfaceContainerLow,
            level2: colors.surfaceContainer,
            level3: colors.surfaceContainerHigh,
            level4: colors.surfaceContainerHighest,
            level5: colors.surfaceContainerHighest,
        },
    };
}

/**
 * Light Theme - Material Design 3
 * با فارسی (IRANSansX) و رنگ‌های custom
 */
export const lightTheme = {
    ...MD3LightTheme,
    colors: {
        ...MD3LightTheme.colors,
        ...getPaperColorRoles(lightPalette, MD3LightTheme.colors),
    },
    fonts: {
        ...MD3LightTheme.fonts,
        displayLarge: {
            ...MD3LightTheme.fonts.displayLarge,
            fontFamily: 'AppFont-Bold',
            fontSize: Typography.fontSize.displayHero,
        },
        displayMedium: {
            ...MD3LightTheme.fonts.displayMedium,
            fontFamily: 'AppFont-Bold',
            fontSize: Typography.fontSize.displayLarge,
        },
        displaySmall: {
            ...MD3LightTheme.fonts.displaySmall,
            fontFamily: 'AppFont-Bold',
            fontSize: Typography.fontSize.displayMedium,
        },
        headlineLarge: {
            ...MD3LightTheme.fonts.headlineLarge,
            fontFamily: 'AppFont-SemiBold',
            fontSize: Typography.fontSize.displaySmall,
        },
        headlineMedium: {
            ...MD3LightTheme.fonts.headlineMedium,
            fontFamily: 'AppFont-SemiBold',
            fontSize: Typography.fontSize.headline,
        },
        headlineSmall: {
            ...MD3LightTheme.fonts.headlineSmall,
            fontFamily: 'AppFont-SemiBold',
            fontSize: Typography.fontSize.titleLarge,
        },
        titleLarge: {
            ...MD3LightTheme.fonts.titleLarge,
            fontFamily: 'AppFont-Bold',
            fontSize: Typography.fontSize.titleMedium,
        },
        titleMedium: {
            ...MD3LightTheme.fonts.titleMedium,
            fontFamily: 'AppFont-SemiBold',
            fontSize: Typography.fontSize.bodyLarge,
        },
        titleSmall: {
            ...MD3LightTheme.fonts.titleSmall,
            fontFamily: 'AppFont-Medium',
            fontSize: Typography.fontSize.bodySmall,
        },
        bodyLarge: {
            ...MD3LightTheme.fonts.bodyLarge,
            fontFamily: 'AppFont-Regular',
            fontSize: Typography.fontSize.bodyLarge,
        },
        bodyMedium: {
            ...MD3LightTheme.fonts.bodyMedium,
            fontFamily: 'AppFont-Regular',
            fontSize: Typography.fontSize.bodySmall,
        },
        bodySmall: {
            ...MD3LightTheme.fonts.bodySmall,
            fontFamily: 'AppFont-Regular',
            fontSize: Typography.fontSize.footnote,
        },
        labelLarge: {
            ...MD3LightTheme.fonts.labelLarge,
            fontFamily: 'AppFont-Medium',
            fontSize: Typography.fontSize.bodySmall,
        },
        labelMedium: {
            ...MD3LightTheme.fonts.labelMedium,
            fontFamily: 'AppFont-Medium',
            fontSize: Typography.fontSize.footnote,
        },
        labelSmall: {
            ...MD3LightTheme.fonts.labelSmall,
            fontFamily: 'AppFont-Medium',
            fontSize: Typography.fontSize.caption,
        },
    },
};

/**
 * Dark Theme - Material Design 3
 * با فارسی (IRANSansX) و رنگ‌های custom
 */
export const darkTheme = {
    ...MD3DarkTheme,
    colors: {
        ...MD3DarkTheme.colors,
        ...getPaperColorRoles(darkPalette, MD3DarkTheme.colors),
    },
    fonts: {
        ...MD3DarkTheme.fonts,
        displayLarge: {
            ...MD3DarkTheme.fonts.displayLarge,
            fontFamily: 'AppFont-Bold',
            fontSize: Typography.fontSize.displayHero,
        },
        displayMedium: {
            ...MD3DarkTheme.fonts.displayMedium,
            fontFamily: 'AppFont-Bold',
            fontSize: Typography.fontSize.displayLarge,
        },
        displaySmall: {
            ...MD3DarkTheme.fonts.displaySmall,
            fontFamily: 'AppFont-Bold',
            fontSize: Typography.fontSize.displayMedium,
        },
        headlineLarge: {
            ...MD3DarkTheme.fonts.headlineLarge,
            fontFamily: 'AppFont-SemiBold',
            fontSize: Typography.fontSize.displaySmall,
        },
        headlineMedium: {
            ...MD3DarkTheme.fonts.headlineMedium,
            fontFamily: 'AppFont-SemiBold',
            fontSize: Typography.fontSize.headline,
        },
        headlineSmall: {
            ...MD3DarkTheme.fonts.headlineSmall,
            fontFamily: 'AppFont-SemiBold',
            fontSize: Typography.fontSize.titleLarge,
        },
        titleLarge: {
            ...MD3DarkTheme.fonts.titleLarge,
            fontFamily: 'AppFont-Bold',
            fontSize: Typography.fontSize.titleMedium,
        },
        titleMedium: {
            ...MD3DarkTheme.fonts.titleMedium,
            fontFamily: 'AppFont-SemiBold',
            fontSize: Typography.fontSize.bodyLarge,
        },
        titleSmall: {
            ...MD3DarkTheme.fonts.titleSmall,
            fontFamily: 'AppFont-Medium',
            fontSize: Typography.fontSize.bodySmall,
        },
        bodyLarge: {
            ...MD3DarkTheme.fonts.bodyLarge,
            fontFamily: 'AppFont-Regular',
            fontSize: Typography.fontSize.bodyLarge,
        },
        bodyMedium: {
            ...MD3DarkTheme.fonts.bodyMedium,
            fontFamily: 'AppFont-Regular',
            fontSize: Typography.fontSize.bodySmall,
        },
        bodySmall: {
            ...MD3DarkTheme.fonts.bodySmall,
            fontFamily: 'AppFont-Regular',
            fontSize: Typography.fontSize.footnote,
        },
        labelLarge: {
            ...MD3DarkTheme.fonts.labelLarge,
            fontFamily: 'AppFont-Medium',
            fontSize: Typography.fontSize.bodySmall,
        },
        labelMedium: {
            ...MD3DarkTheme.fonts.labelMedium,
            fontFamily: 'AppFont-Medium',
            fontSize: Typography.fontSize.footnote,
        },
        labelSmall: {
            ...MD3DarkTheme.fonts.labelSmall,
            fontFamily: 'AppFont-Medium',
            fontSize: Typography.fontSize.caption,
        },
    },
};
