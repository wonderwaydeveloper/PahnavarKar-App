import { describe, expect, it, jest } from '@jest/globals';

import { FONT_SIZE_SCALE, getScaledTextStyle } from '@/constants/font-scale';
import { getAppColorPalette } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { getAppFontStyle, getAppPaperTheme } from '@/services/font-service';

jest.mock('@/global.css', () => ({}));

function withAlpha(hex: string, alpha: number): string {
    const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
    return `rgba(${channels.join(', ')}, ${alpha})`;
}

describe('app font size preference', () => {
    it('centralizes the approved existing font-size and line-height baselines unchanged', () => {
        expect(Object.values(Typography.fontSize)).toEqual([
            9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 24, 28, 32, 36, 45, 48, 57,
        ]);
        expect(Object.values(Typography.lineHeight)).toEqual([
            13, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 30, 32, 44, 52,
        ]);
    });

    it('scales font size and line height while preserving other text styles', () => {
        expect(getScaledTextStyle(
            { fontSize: 16, lineHeight: 24, fontWeight: '700', marginTop: 4 },
            'large',
        )).toEqual({
            fontSize: 16 * FONT_SIZE_SCALE.large,
            lineHeight: 24 * FONT_SIZE_SCALE.large,
            fontWeight: '700',
            marginTop: 4,
        });
    });

    it('keeps standard typography unchanged', () => {
        expect(getScaledTextStyle({ fontSize: 14, lineHeight: 20 }, 'standard')).toEqual({
            fontSize: 14,
            lineHeight: 20,
        });
    });

    it('scales font styles without changing their selected font family', () => {
        expect(getAppFontStyle(
            { fontSize: 12, lineHeight: 18, fontFamily: 'CustomPreviewFont' },
            'iransans',
            undefined,
            'large',
        )).toEqual({
            fontSize: 12 * FONT_SIZE_SCALE.large,
            lineHeight: 18 * FONT_SIZE_SCALE.large,
            fontFamily: 'CustomPreviewFont',
        });
    });

    it('uses the standard body size as the scalable fallback for unstyled app text', () => {
        const style = getAppFontStyle(
            [{ fontSize: Typography.fontSize.bodySmall }, undefined],
            'system',
            'Regular',
            'large',
        );

        expect(style).toMatchObject({
            fontSize: Typography.fontSize.bodySmall * FONT_SIZE_SCALE.large,
            fontWeight: '400',
        });
    });

    it('applies the selected scale to React Native Paper typography', () => {
        const colors = getAppColorPalette('default', 'light');
        const standard = getAppPaperTheme('light', 'system', colors, 'standard');
        const enlarged = getAppPaperTheme('light', 'system', colors, 'extraLarge');

        expect(enlarged.fonts.bodyMedium.fontSize).toBe(standard.fonts.bodyMedium.fontSize * FONT_SIZE_SCALE.extraLarge);
        expect(enlarged.fonts.bodyMedium.lineHeight).toBe(standard.fonts.bodyMedium.lineHeight * FONT_SIZE_SCALE.extraLarge);
    });

    it('synchronizes Paper surface, elevation, and disabled roles with the selected palette', () => {
        const colors = getAppColorPalette('yellow', 'light', 75);
        const paperTheme = getAppPaperTheme('light', 'system', colors);

        expect(paperTheme.colors.primary).toBe(colors.primary);
        expect(paperTheme.colors.onPrimary).toBe(colors.onPrimary);
        expect(paperTheme.colors.surfaceContainer).toBe(colors.surfaceContainer);
        expect(paperTheme.colors.surfaceDisabled).toBe(withAlpha(colors.text, 0.12));
        expect(paperTheme.colors.onSurfaceDisabled).toBe(withAlpha(colors.text, 0.38));
        expect(paperTheme.colors.elevation.level1).toBe(colors.surfaceContainerLow);
        expect(paperTheme.colors.elevation.level2).toBe(colors.surfaceContainer);
        expect(paperTheme.colors.elevation.level3).toBe(colors.surfaceContainerHigh);
        expect(paperTheme.colors.elevation.level4).toBe(colors.surfaceContainerHighest);
        expect(paperTheme.colors.elevation.level5).toBe(colors.surfaceContainerHighest);
    });

    it('reuses the selected color roles for dark Paper surfaces and disabled states', () => {
        const colors = getAppColorPalette('red', 'dark', 25);
        const paperTheme = getAppPaperTheme('dark', 'system', colors);

        expect(paperTheme.colors.surface).toBe(colors.surface);
        expect(paperTheme.colors.onSurface).toBe(colors.text);
        expect(paperTheme.colors.surfaceDisabled).toBe(withAlpha(colors.text, 0.12));
        expect(paperTheme.colors.onSurfaceDisabled).toBe(withAlpha(colors.text, 0.38));
        expect(paperTheme.colors.elevation.level1).toBe(colors.surfaceContainerLow);
        expect(paperTheme.colors.elevation.level3).toBe(colors.surfaceContainerHigh);
    });
});
