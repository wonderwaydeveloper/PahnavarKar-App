import { Typography } from './typography';
import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

import { Colors } from './theme';

const lightPalette = Colors.light;
const darkPalette = Colors.dark;

/**
 * Light Theme - Material Design 3
 * با فارسی (IRANSansX) و رنگ‌های custom
 */
export const lightTheme = {
    ...MD3LightTheme,
    colors: {
        ...MD3LightTheme.colors,
        primary: lightPalette.primary,
        onPrimary: lightPalette.onPrimary,
        primaryContainer: lightPalette.primaryContainer,
        onPrimaryContainer: lightPalette.onPrimaryContainer,
        secondary: lightPalette.secondary,
        onSecondary: lightPalette.onSecondary,
        secondaryContainer: lightPalette.secondaryContainer,
        onSecondaryContainer: lightPalette.onSecondaryContainer,
        tertiary: lightPalette.tertiary,
        onTertiary: lightPalette.onTertiary,
        tertiaryContainer: lightPalette.tertiaryContainer,
        onTertiaryContainer: lightPalette.onTertiaryContainer,
        background: lightPalette.background,
        onBackground: lightPalette.text,
        surface: lightPalette.surface,
        onSurface: lightPalette.text,
        surfaceVariant: lightPalette.surfaceVariant,
        onSurfaceVariant: lightPalette.textSecondary,
        surfaceDim: lightPalette.surfaceDim,
        surfaceBright: lightPalette.surfaceBright,
        surfaceContainerLowest: lightPalette.surfaceContainerLowest,
        surfaceContainerLow: lightPalette.surfaceContainerLow,
        surfaceContainer: lightPalette.surfaceElevated,
        surfaceContainerHigh: lightPalette.surfaceContainerHigh,
        surfaceContainerHighest: lightPalette.surfaceContainerHighest,
        outline: lightPalette.borderStrong,
        outlineVariant: lightPalette.border,
        error: lightPalette.error,
        onError: lightPalette.onError,
        errorContainer: lightPalette.errorFill,
        onErrorContainer: lightPalette.onErrorFill,
        inverseSurface: lightPalette.inverseSurface,
        inverseOnSurface: lightPalette.inverseOnSurface,
        inversePrimary: lightPalette.inversePrimary,
        surfaceTint: lightPalette.surfaceTint,
        scrim: lightPalette.scrim,
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
        primary: darkPalette.primary,
        onPrimary: darkPalette.onPrimary,
        primaryContainer: darkPalette.primaryContainer,
        onPrimaryContainer: darkPalette.onPrimaryContainer,
        secondary: darkPalette.secondary,
        onSecondary: darkPalette.onSecondary,
        secondaryContainer: darkPalette.secondaryContainer,
        onSecondaryContainer: darkPalette.onSecondaryContainer,
        tertiary: darkPalette.tertiary,
        onTertiary: darkPalette.onTertiary,
        tertiaryContainer: darkPalette.tertiaryContainer,
        onTertiaryContainer: darkPalette.onTertiaryContainer,
        background: darkPalette.background,
        onBackground: darkPalette.text,
        surface: darkPalette.surface,
        onSurface: darkPalette.text,
        surfaceVariant: darkPalette.surfaceVariant,
        onSurfaceVariant: darkPalette.textSecondary,
        surfaceDim: darkPalette.surfaceDim,
        surfaceBright: darkPalette.surfaceBright,
        surfaceContainerLowest: darkPalette.surfaceContainerLowest,
        surfaceContainerLow: darkPalette.surfaceContainerLow,
        surfaceContainer: darkPalette.surfaceElevated,
        surfaceContainerHigh: darkPalette.surfaceContainerHigh,
        surfaceContainerHighest: darkPalette.surfaceContainerHighest,
        outline: darkPalette.borderStrong,
        outlineVariant: darkPalette.border,
        error: darkPalette.error,
        onError: darkPalette.onError,
        errorContainer: darkPalette.errorFill,
        onErrorContainer: darkPalette.onErrorFill,
        inverseSurface: darkPalette.inverseSurface,
        inverseOnSurface: darkPalette.inverseOnSurface,
        inversePrimary: darkPalette.inversePrimary,
        surfaceTint: darkPalette.surfaceTint,
        scrim: darkPalette.scrim,
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
