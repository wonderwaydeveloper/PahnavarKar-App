import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';

export const FONT_SIZE_PREFERENCES = ['standard', 'large', 'extraLarge'] as const;

export type FontSizePreference = typeof FONT_SIZE_PREFERENCES[number];

export const FONT_SIZE_SCALE: Record<FontSizePreference, number> = {
    standard: 1,
    large: 1.15,
    extraLarge: 1.3,
};

export function getScaledTextStyle(
    style: StyleProp<TextStyle>,
    preference: FontSizePreference,
): TextStyle | undefined {
    const flattenedStyle = StyleSheet.flatten(style);
    if (!flattenedStyle) return undefined;

    const scale = FONT_SIZE_SCALE[preference];
    return {
        ...flattenedStyle,
        ...(flattenedStyle.fontSize !== undefined
            ? { fontSize: flattenedStyle.fontSize * scale }
            : {}),
        ...(flattenedStyle.lineHeight !== undefined
            ? { lineHeight: flattenedStyle.lineHeight * scale }
            : {}),
    };
}
