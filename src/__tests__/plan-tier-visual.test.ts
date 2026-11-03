import { describe, expect, it } from '@jest/globals';

import {
    getPlanTierColor,
    getPlanTierLogoBackground,
    getPlanTierLogoForeground,
} from '@/utils/plan-tier-visual';

function relativeLuminance(color: string): number {
    const [red, green, blue] = [1, 3, 5].map((offset) => {
        const channel = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

function contrastRatio(foreground: string, background: string): number {
    const luminances = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a);
    return (luminances[0]! + 0.05) / (luminances[1]! + 0.05);
}

describe('plan tier logo colors', () => {
    it('uses the yellow theme color for the gold plan background', () => {
        expect(getPlanTierLogoBackground('gold', 'light')).toBe('#FFE76A');
        expect(getPlanTierLogoBackground('gold', 'dark')).toBe('#665C00');
    });

    it('uses a distinct background for each plan in light and dark themes', () => {
        const tiers = ['free', 'bronze', 'silver', 'gold'];
        const lightBackgrounds = tiers.map((tier) => getPlanTierLogoBackground(tier, 'light'));
        const darkBackgrounds = tiers.map((tier) => getPlanTierLogoBackground(tier, 'dark'));

        expect(new Set(lightBackgrounds).size).toBe(tiers.length);
        expect(new Set(darkBackgrounds).size).toBe(tiers.length);
        expect(lightBackgrounds).not.toEqual(darkBackgrounds);
    });

    it('selects a foreground with WCAG AA contrast on every plan background', () => {
        for (const tier of ['free', 'bronze', 'silver', 'gold']) {
            for (const theme of ['light', 'dark'] as const) {
                const background = getPlanTierLogoBackground(tier, theme);
                const foreground = getPlanTierLogoForeground(tier, theme);

                expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
                expect(foreground).toBe(
                    contrastRatio('#102A39', background) >= contrastRatio('#FFFFFF', background)
                        ? '#102A39'
                        : '#FFFFFF',
                );
            }
        }
    });

    it('keeps tier-colored timeline markers and labels readable on light and dark surfaces', () => {
        const tierSurfaceColors = {
            light: '#FFFFFF',
            dark: '#082933',
        } as const;

        for (const tier of ['free', 'bronze', 'silver', 'gold']) {
            for (const theme of ['light', 'dark'] as const) {
                expect(contrastRatio(getPlanTierColor(tier, theme), tierSurfaceColors[theme]))
                    .toBeGreaterThanOrEqual(4.5);
            }
        }
    });

    it('automatically uses dark icons on light backgrounds and light icons on dark backgrounds', () => {
        expect(getPlanTierLogoForeground('gold', 'light')).toBe('#102A39');
        expect(getPlanTierLogoForeground('gold', 'dark')).toBe('#FFFFFF');
    });

    it('falls back to the free plan background for unknown tiers', () => {
        expect(getPlanTierLogoBackground('unknown', 'light'))
            .toBe(getPlanTierLogoBackground('free', 'light'));
        expect(getPlanTierLogoBackground('unknown', 'dark'))
            .toBe(getPlanTierLogoBackground('free', 'dark'));
    });
});
