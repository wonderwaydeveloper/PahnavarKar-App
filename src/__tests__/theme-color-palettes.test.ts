import { describe, expect, it, jest } from '@jest/globals';
import { Hct, argbFromHex } from '@material/material-color-utilities';

import {
    ColorPalettes,
    getAppColorPalette,
    getAppHeaderColors,
    getColorPaletteTone,
    MATERIAL_COLOR_SEEDS,
    MATERIAL_TONES,
    PALETTE_VARIANT_TONES,
    type AppColorPalette,
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
    'red',
    'redOrange',
    'orange',
    'yellowOrange',
    'yellow',
    'yellowGreen',
    'green',
    'blue',
    'blueViolet',
    'violet',
    'redViolet',
];

describe('Material 3 color palettes', () => {
    const neutralSurfaceRoles = [
        'background',
        'surface',
        'surfaceVariant',
        'surfaceElevated',
        'surfaceDim',
        'surfaceBright',
        'surfaceContainerLowest',
        'surfaceContainerLow',
        'surfaceContainer',
        'surfaceContainerHigh',
        'surfaceContainerHighest',
    ] as const satisfies readonly (keyof AppColorPalette)[];
    const neutralTextRoles = [
        'text',
        'textSecondary',
        'textMuted',
    ] as const satisfies readonly (keyof AppColorPalette)[];
    const lightModeTextPairs = [
        ['text', 'background'],
        ['text', 'surface'],
        ['textSecondary', 'background'],
        ['textSecondary', 'surface'],
        ['textSecondary', 'surfaceVariant'],
        ['textMuted', 'background'],
        ['textMuted', 'surface'],
        ['textMuted', 'surfaceVariant'],
        ['primaryText', 'background'],
        ['primaryText', 'surface'],
        ['primaryText', 'primaryContainer'],
        ['onPrimary', 'primary'],
        ['onPrimaryContainer', 'primaryContainer'],
        ['onSecondary', 'secondary'],
        ['onSecondaryContainer', 'secondaryContainer'],
        ['onTertiary', 'tertiary'],
        ['onTertiaryContainer', 'tertiaryContainer'],
        ['onError', 'error'],
        ['onErrorFill', 'errorFill'],
        ['onSuccess', 'successFill'],
        ['onWarning', 'warningFill'],
        ['onInfo', 'infoFill'],
        ['onStatus', 'errorFill'],
        ['onStatus', 'successFill'],
        ['onStatus', 'warningFill'],
        ['onStatus', 'infoFill'],
    ] as const satisfies readonly (readonly [keyof AppColorPalette, keyof AppColorPalette])[];
    const darkModeTextPairs = [
        ['text', 'background'],
        ['text', 'surface'],
        ['text', 'surfaceVariant'],
        ['textSecondary', 'background'],
        ['textSecondary', 'surface'],
        ['textSecondary', 'surfaceVariant'],
        ['textSecondary', 'primaryContainer'],
        ['primaryText', 'background'],
        ['primaryText', 'surface'],
        ['primaryText', 'surfaceVariant'],
        ['primaryText', 'primaryContainer'],
        ['onPrimary', 'primary'],
        ['onPrimaryContainer', 'primaryContainer'],
        ['onSecondary', 'secondary'],
        ['onSecondaryContainer', 'secondaryContainer'],
        ['onTertiary', 'tertiary'],
        ['onTertiaryContainer', 'tertiaryContainer'],
        ['onError', 'error'],
        ['onErrorFill', 'errorFill'],
        ['onSuccess', 'successFill'],
        ['onWarning', 'warningFill'],
        ['onInfo', 'infoFill'],
        ['onStatus', 'errorFill'],
        ['onStatus', 'successFill'],
        ['onStatus', 'warningFill'],
        ['onStatus', 'infoFill'],
    ] as const satisfies readonly (readonly [keyof AppColorPalette, keyof AppColorPalette])[];

    it('offers dark, medium, and light selectable tones in order', () => {
        expect(PALETTE_VARIANT_TONES).toEqual([25, 50, 75]);
    });

    it('meets WCAG AA text contrast for light-mode semantic color roles', () => {
        for (const palette of palettes) {
            const colors = ColorPalettes[palette].light;
            for (const [foreground, background] of lightModeTextPairs) {
                expect(contrastRatio(colors[foreground], colors[background]))
                    .toBeGreaterThanOrEqual(4.5);
            }
        }
    });

    it('keeps standard text readable on every neutral surface in both modes', () => {
        for (const palette of palettes) {
            for (const mode of ['light', 'dark'] as const) {
                const colors = ColorPalettes[palette][mode];
                for (const foreground of neutralTextRoles) {
                    for (const background of neutralSurfaceRoles) {
                        const ratio = contrastRatio(colors[foreground], colors[background]);
                        if (ratio < 4.5) {
                            throw new Error(`${palette}/${mode}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1`);
                        }
                    }
                }
            }
        }
    });

    it('keeps primary action icons readable on neutral surfaces in both modes', () => {
        for (const palette of palettes) {
            for (const mode of ['light', 'dark'] as const) {
                const colors = ColorPalettes[palette][mode];
                for (const background of neutralSurfaceRoles) {
                    expect(contrastRatio(colors.primaryText, colors[background]))
                        .toBeGreaterThanOrEqual(3);
                }
            }
        }
    });

    it('keeps status labels readable on neutral surfaces in both modes', () => {
        const statusTextRoles = ['success', 'warning', 'error', 'info'] as const;
        const statusSurfaces = ['background', 'surface', 'surfaceVariant'] as const;

        for (const palette of palettes) {
            for (const mode of ['light', 'dark'] as const) {
                const colors = ColorPalettes[palette][mode];
                for (const foreground of statusTextRoles) {
                    for (const background of statusSurfaces) {
                        expect(contrastRatio(colors[foreground], colors[background]))
                            .toBeGreaterThanOrEqual(4.5);
                    }
                }
            }
        }
    });

    it('meets WCAG AA text contrast for dark-mode semantic color roles', () => {
        for (const palette of palettes) {
            const colors = ColorPalettes[palette].dark;
            for (const [foreground, background] of darkModeTextPairs) {
                expect(contrastRatio(colors[foreground], colors[background]))
                    .toBeGreaterThanOrEqual(4.5);
            }
        }
    });

    it('keeps selected dark-mode tones distinct and ordered', () => {
        for (const palette of palettes) {
            const darkColors = PALETTE_VARIANT_TONES.map((selectedTone) =>
                getAppColorPalette(palette, 'dark', selectedTone),
            );
            expect(darkColors.map((colors) => colors.primary)).toEqual([
                getColorPaletteTone(palette, 65),
                getColorPaletteTone(palette, 75),
                getColorPaletteTone(palette, 85),
            ]);
            expect(new Set(darkColors.map((colors) => colors.primary)).size).toBe(3);
        }
    });

    it('keeps all selected light-mode primary colors white-on-color accessible and distinct', () => {
        for (const palette of palettes) {
            const lightColors = PALETTE_VARIANT_TONES.map((selectedTone) =>
                getAppColorPalette(palette, 'light', selectedTone),
            );
            const luminances = lightColors.map((colors) => relativeLuminance(colors.primary));

            expect(lightColors.every((colors) => colors.onPrimary === '#FFFFFF')).toBe(true);
            expect(new Set(lightColors.map((colors) => colors.primary)).size).toBe(3);
            expect(luminances[0]).toBeLessThan(luminances[1]!);
            expect(luminances[1]).toBeLessThan(luminances[2]!);

            for (const colors of lightColors) {
                expect(contrastRatio(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(4.5);
            }
        }
    });

    it('uses the configured hues as Material 3 palette seeds', () => {
        expect(MATERIAL_COLOR_SEEDS).toEqual({
            default: '#006A7A',
            red: '#B3261E',
            redOrange: '#C64F1B',
            orange: '#B85C00',
            yellowOrange: '#9C7400',
            yellow: '#827A00',
            yellowGreen: '#7CB342',
            green: '#006B54',
            blue: '#355C7D',
            blueViolet: '#3F51B5',
            violet: '#6750A4',
            redViolet: '#AD1F8A',
        });
    });

    it('provides a full 0–100 primary tonal scale for all twelve color-wheel palettes', () => {
        expect(palettes).toHaveLength(12);
        expect(MATERIAL_TONES).toHaveLength(101);
        for (const palette of palettes) {
            for (const tone of MATERIAL_TONES) {
                expect(getColorPaletteTone(palette, tone)).toMatch(/^#[0-9A-F]{6}$/);
            }
            expect(getColorPaletteTone(palette, 0)).toBe('#000000');
            expect(getColorPaletteTone(palette, 100)).toBe('#FFFFFF');
        }
    });

    it('covers the full color wheel in evenly spaced hue sectors', () => {
        const hues = Object.fromEntries(palettes.map((palette) => [
            palette,
            Hct.fromInt(argbFromHex(ColorPalettes[palette].light.primary)).hue,
        ])) as Record<ThemePalette, number>;
        const sortedHues = Object.values(hues).sort((first, second) => first - second);
        const gaps = sortedHues.map((hue, index) => {
            const nextHue = sortedHues[(index + 1) % sortedHues.length]! + (index === sortedHues.length - 1 ? 360 : 0);
            return nextHue - hue;
        });

        expect(Math.min(...gaps)).toBeGreaterThanOrEqual(10);
        expect(Math.max(...gaps)).toBeLessThanOrEqual(50);
    });

    it('rejects tones outside the Material 3 range', () => {
        expect(() => getColorPaletteTone('blue', -1)).toThrow(RangeError);
        expect(() => getColorPaletteTone('blue', 101)).toThrow(RangeError);
        expect(() => getColorPaletteTone('blue', 40.5)).toThrow(RangeError);
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

    it('keeps group calculation period detail text accessible on highlighted and warning surfaces', () => {
        for (const palette of palettes) {
            for (const selectedTone of PALETTE_VARIANT_TONES) {
                for (const mode of ['light', 'dark'] as const) {
                    const colors = getAppColorPalette(palette, mode, selectedTone);

                    expect(contrastRatio(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(4.5);
                    expect(contrastRatio(colors.textSecondary, colors.surfaceVariant)).toBeGreaterThanOrEqual(4.5);
                    expect(contrastRatio(colors.text, colors.surfaceVariant)).toBeGreaterThanOrEqual(4.5);
                    expect(contrastRatio(colors.error, colors.surfaceVariant)).toBeGreaterThanOrEqual(4.5);
                }
            }
        }
    });

    it('keeps selectable subtones readable in both modes', () => {
        for (const palette of palettes) {
            for (const selectedTone of PALETTE_VARIANT_TONES) {
                for (const mode of ['light', 'dark'] as const) {
                    const colors = getAppColorPalette(palette, mode, selectedTone);
                    expect(contrastRatio(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(4.5);
                    expect(contrastRatio(colors.onPrimaryContainer, colors.primaryContainer)).toBeGreaterThanOrEqual(4.5);
                    expect(contrastRatio(colors.primaryText, colors.primaryContainer)).toBeGreaterThanOrEqual(4.5);
                    expect(contrastRatio(colors.textSecondary, colors.primaryContainer)).toBeGreaterThanOrEqual(4.5);
                    if (mode === 'dark') {
                        expect(contrastRatio(colors.text, colors.background)).toBeGreaterThanOrEqual(4.5);
                        expect(contrastRatio(colors.textSecondary, colors.surfaceVariant)).toBeGreaterThanOrEqual(4.5);
                    }
                }
            }
        }
    });

    it('keeps selected-palette text and icon roles readable on their actual surfaces', () => {
        const textPairs = [
            ['text', 'background'],
            ['text', 'surface'],
            ['text', 'surfaceVariant'],
            ['text', 'surfaceElevated'],
            ['text', 'surfaceContainer'],
            ['textSecondary', 'background'],
            ['textSecondary', 'surface'],
            ['textSecondary', 'surfaceVariant'],
            ['textSecondary', 'surfaceElevated'],
            ['textSecondary', 'surfaceContainer'],
            ['textMuted', 'background'],
            ['textMuted', 'surface'],
            ['textMuted', 'surfaceVariant'],
            ['textMuted', 'surfaceElevated'],
            ['textMuted', 'surfaceContainer'],
            ['primaryText', 'background'],
            ['primaryText', 'surface'],
            ['primaryText', 'surfaceVariant'],
            ['primaryText', 'surfaceElevated'],
            ['primaryText', 'surfaceContainer'],
            ['primaryText', 'primaryContainer'],
            ['onPrimary', 'primary'],
            ['onPrimaryContainer', 'primaryContainer'],
        ] as const satisfies readonly (readonly [keyof AppColorPalette, keyof AppColorPalette])[];
        const iconPairs = [
            ['primaryText', 'background'],
            ['primaryText', 'surface'],
            ['primaryText', 'surfaceVariant'],
            ['primaryText', 'surfaceElevated'],
            ['primaryText', 'surfaceContainer'],
            ['onPrimary', 'primary'],
        ] as const satisfies readonly (readonly [keyof AppColorPalette, keyof AppColorPalette])[];

        for (const palette of palettes) {
            for (const selectedTone of PALETTE_VARIANT_TONES) {
                for (const mode of ['light', 'dark'] as const) {
                    const colors = getAppColorPalette(palette, mode, selectedTone);

                    for (const foreground of [...neutralTextRoles, 'primaryText'] as const) {
                        for (const background of neutralSurfaceRoles) {
                            const ratio = contrastRatio(colors[foreground], colors[background]);
                            if (ratio < 4.5) {
                                throw new Error(
                                    `${palette}/${selectedTone}/${mode}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1`,
                                );
                            }
                        }
                    }

                    for (const [foreground, background] of textPairs) {
                        const ratio = contrastRatio(colors[foreground], colors[background]);
                        if (ratio < 4.5) {
                            throw new Error(
                                `${palette}/${selectedTone}/${mode}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1`,
                            );
                        }
                    }

                    for (const [foreground, background] of iconPairs) {
                        const ratio = contrastRatio(colors[foreground], colors[background]);
                        if (ratio < 3) {
                            throw new Error(
                                `${palette}/${selectedTone}/${mode}: icon ${foreground} on ${background} is ${ratio.toFixed(2)}:1`,
                            );
                        }
                    }
                }
            }
        }
    });

    it('derives the primary foreground from the actual button background for every palette, tone, and mode', () => {
        for (const palette of palettes) {
            for (const selectedTone of PALETTE_VARIANT_TONES) {
                for (const mode of ['light', 'dark'] as const) {
                    const colors = getAppColorPalette(palette, mode, selectedTone);
                    const blackContrast = contrastRatio('#000000', colors.primary);
                    const whiteContrast = contrastRatio('#FFFFFF', colors.primary);
                    const expectedForeground = mode === 'light'
                        ? '#FFFFFF'
                        : blackContrast >= whiteContrast ? '#000000' : '#FFFFFF';

                    expect(colors.onPrimary).toBe(expectedForeground);
                    expect(contrastRatio(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(4.5);
                }
            }

            for (const mode of ['light', 'dark'] as const) {
                const colors = ColorPalettes[palette][mode];
                const blackContrast = contrastRatio('#000000', colors.primary);
                const whiteContrast = contrastRatio('#FFFFFF', colors.primary);
                const expectedForeground = mode === 'light'
                    ? '#FFFFFF'
                    : blackContrast >= whiteContrast ? '#000000' : '#FFFFFF';

                expect(colors.onPrimary).toBe(expectedForeground);
                expect(contrastRatio(colors.onPrimary, colors.primary)).toBeGreaterThanOrEqual(4.5);
            }
        }
    });

    it('keeps app header text and status bar indicators readable across selected palettes', () => {
        for (const palette of palettes) {
            for (const selectedTone of PALETTE_VARIANT_TONES) {
                for (const mode of ['light', 'dark'] as const) {
                    const colors = getAppColorPalette(palette, mode, selectedTone);
                    const header = getAppHeaderColors(colors, mode);
                    const statusBarForeground = header.statusBarStyle === 'light-content'
                        ? '#FFFFFF'
                        : '#000000';

                    expect(contrastRatio(header.foreground, header.background)).toBeGreaterThanOrEqual(4.5);
                    expect(contrastRatio(statusBarForeground, header.background)).toBeGreaterThanOrEqual(3);
                    expect(header.background).toBe(mode === 'light' ? colors.primary : colors.surface);
                    expect(header.foreground).toBe(mode === 'light' ? colors.onPrimary : colors.text);
                }
            }
        }
    });

    it('reverses the secondary-tool header icon colors in light mode with accessible contrast', () => {
        for (const palette of palettes) {
            for (const selectedTone of PALETTE_VARIANT_TONES) {
                for (const mode of ['light', 'dark'] as const) {
                    const colors = getAppColorPalette(palette, mode, selectedTone);
                    const header = getAppHeaderColors(colors, mode);

                    expect(contrastRatio(header.toolIconForeground, header.toolIconBackground))
                        .toBeGreaterThanOrEqual(3);
                    expect(contrastRatio(header.toolIconBackground, header.background))
                        .toBeGreaterThanOrEqual(3);
                    expect(header.toolIconBackground).toBe(mode === 'light' ? colors.surface : colors.primary);
                    expect(header.toolIconForeground).toBe(mode === 'light' ? colors.primaryText : colors.onPrimary);
                }
            }
        }
    });

    it('keeps home tool-list icons accessible against their primary icon container', () => {
        for (const palette of palettes) {
            for (const selectedTone of PALETTE_VARIANT_TONES) {
                for (const mode of ['light', 'dark'] as const) {
                    const colors = getAppColorPalette(palette, mode, selectedTone);
                    expect(contrastRatio(colors.onPrimary, colors.primary))
                        .toBeGreaterThanOrEqual(3);
                }
            }
        }
    });
});
