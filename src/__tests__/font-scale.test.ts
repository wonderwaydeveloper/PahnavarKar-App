import { describe, expect, it, jest } from '@jest/globals';

import { FONT_SIZE_SCALE, getScaledTextStyle } from '@/constants/font-scale';
import { Typography } from '@/constants/typography';
import { getAppFontStyle, getAppPaperTheme } from '@/services/font-service';

jest.mock('@/global.css', () => ({}));

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
        const standard = getAppPaperTheme('light', 'system', 'default', 'standard');
        const enlarged = getAppPaperTheme('light', 'system', 'default', 'extraLarge');

        expect(enlarged.fonts.bodyMedium.fontSize).toBe(standard.fonts.bodyMedium.fontSize * FONT_SIZE_SCALE.extraLarge);
        expect(enlarged.fonts.bodyMedium.lineHeight).toBe(standard.fonts.bodyMedium.lineHeight * FONT_SIZE_SCALE.extraLarge);
    });
});
