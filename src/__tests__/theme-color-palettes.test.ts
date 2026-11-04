import { describe, expect, it, jest } from '@jest/globals';

import {
    ColorPalettes,
    getColorPaletteTone,
    MATERIAL_COLOR_SEEDS,
    MATERIAL_TONES,
    type ThemePalette,
} from '@/constants/theme';

jest.mock('@/global.css', () => ({}));

function relativeLuminance(color: string): number {
    const [red, green, blue] = [1, 3, 5].map((offset) => {
        const channel = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

function contrastRatio(foreground: string, background: string): number {
    const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)]
        .sort((first, second) => second - first);
    return (lighter! + 0.05) / (darker! + 0.05);
}

const palettes: ThemePalette[] = [
    'default',
    'skyBlue',
    'emerald',
    'amber',
    'ruby',
    'softPurple',
    'purple',
    'indigo',
    'deepTeal',
    'burntOrange',
    'dustyRose',
    'brown',
    'slateBlue',
    'lightPurple',
    'olive',
    'tealBlue',
];

describe('Material 3 color palettes', () => {
    it('uses the configured hues as Material 3 palette seeds', () => {
        expect(MATERIAL_COLOR_SEEDS).toEqual({
            default: '#00FFFF',
            skyBlue: '#0061A4',
            emerald: '#006B54',
            amber: '#8A5A00',
            ruby: '#B3261E',
            softPurple: '#7D5260',
            purple: '#6750A4',
            indigo: '#3F51B5',
            deepTeal: '#006A60',
            burntOrange: '#B54708',
            dustyRose: '#AD1457',
            brown: '#795548',
            slateBlue: '#456179',
            lightPurple: '#7E57C2',
            olive: '#687F00',
            tealBlue: '#006874',
        });
    });

    it('provides a full 0–100 primary tonal scale for all sixteen palettes', () => {
        expect(palettes).toHaveLength(16);
        expect(MATERIAL_TONES).toHaveLength(101);
        for (const palette of palettes) {
            for (const tone of MATERIAL_TONES) {
                expect(getColorPaletteTone(palette, tone)).toMatch(/^#[0-9A-F]{6}$/);
            }
            expect(getColorPaletteTone(palette, 0)).toBe('#000000');
            expect(getColorPaletteTone(palette, 100)).toBe('#FFFFFF');
        }
    });

    it('rejects tones outside the Material 3 range', () => {
        expect(() => getColorPaletteTone('skyBlue', -1)).toThrow(RangeError);
        expect(() => getColorPaletteTone('skyBlue', 101)).toThrow(RangeError);
        expect(() => getColorPaletteTone('skyBlue', 40.5)).toThrow(RangeError);
    });

    it('maps primary roles to standard light and dark Material 3 tones', () => {
        for (const palette of palettes) {
            expect(ColorPalettes[palette].light.primary).toBe(getColorPaletteTone(palette, 40));
            expect(ColorPalettes[palette].light.primaryContainer).toBe(getColorPaletteTone(palette, 90));
            expect(ColorPalettes[palette].dark.primary).toBe(getColorPaletteTone(palette, 80));
            expect(ColorPalettes[palette].dark.primaryContainer).toBe(getColorPaletteTone(palette, 30));
        }
    });

    it('keeps content and semantic status colors accessible in both modes', () => {
        for (const palette of palettes) {
            for (const mode of ['light', 'dark'] as const) {
                const colors = ColorPalettes[palette][mode];
                expect(contrastRatio(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(4.5);
                expect(contrastRatio(colors.primaryText, colors.primaryContainer)).toBeGreaterThanOrEqual(4.5);
                expect(contrastRatio(colors.textSecondary, colors.primaryContainer)).toBeGreaterThanOrEqual(4.5);
                expect(contrastRatio(colors.text, colors.background)).toBeGreaterThanOrEqual(4.5);
                expect(contrastRatio(colors.textSecondary, colors.surfaceVariant)).toBeGreaterThanOrEqual(4.5);
                expect(contrastRatio(colors.onPrimaryContainer, colors.primaryContainer)).toBeGreaterThanOrEqual(4.5);
                expect(contrastRatio(colors.onErrorFill, colors.errorFill)).toBeGreaterThanOrEqual(4.5);
                expect(contrastRatio(colors.onSuccess, colors.successFill)).toBeGreaterThanOrEqual(4.5);
                expect(contrastRatio(colors.onWarning, colors.warningFill)).toBeGreaterThanOrEqual(4.5);
                expect(contrastRatio(colors.onInfo, colors.infoFill)).toBeGreaterThanOrEqual(4.5);
                expect(contrastRatio(colors.onStatus, colors.errorFill)).toBeGreaterThanOrEqual(4.5);
                expect(contrastRatio(colors.onStatus, colors.successFill)).toBeGreaterThanOrEqual(4.5);
                expect(contrastRatio(colors.onStatus, colors.warningFill)).toBeGreaterThanOrEqual(4.5);
                expect(contrastRatio(colors.onStatus, colors.infoFill)).toBeGreaterThanOrEqual(4.5);
            }
        }
    });
});
