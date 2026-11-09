/**
 * Figma Colors examples provide the hue seeds; Material 3 generates app roles and tonal palettes.
 */

import {
  argbFromHex,
  hexFromArgb,
  themeFromSourceColor,
} from '@material/material-color-utilities';
import '@/global.css';
import colorTokens from './theme-color-tokens.json';

import { Platform } from 'react-native';

export { PRODUCT_COLOR_TOKENS } from './product-color-tokens';
export const MATERIAL_COLOR_SEEDS = colorTokens.materialSeeds;

export type ThemePalette = keyof typeof MATERIAL_COLOR_SEEDS;
type ColorMode = 'light' | 'dark';

export interface AppColorPalette {
  text: string;
  textSecondary: string;
  textMuted: string;
  background: string;
  surface: string;
  surfaceVariant: string;
  surfaceElevated: string;
  surfaceDim: string;
  surfaceBright: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  border: string;
  borderStrong: string;
  primary: string;
  primaryText: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;
  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;
  error: string;
  onError: string;
  errorFill: string;
  onErrorFill: string;
  success: string;
  onSuccess: string;
  successFill: string;
  warning: string;
  onWarning: string;
  warningFill: string;
  info: string;
  onInfo: string;
  infoFill: string;
  onStatus: string;
  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;
  surfaceTint: string;
  shadow: string;
  scrim: string;
  overlay: string;
  backgroundElement: string;
  backgroundSelected: string;
}

export type ThemeColor = keyof AppColorPalette;

export const MATERIAL_TONES = Object.freeze(Array.from({ length: 101 }, (_, tone) => tone));
export const PALETTE_VARIANT_TONES = [25, 50, 75] as const;
export type ThemePaletteTone = (typeof PALETTE_VARIANT_TONES)[number];

const DARK_MODE_PALETTE_TONES: Record<ThemePaletteTone, number> = {
  25: 65,
  50: 75,
  75: 85,
};

const generatedThemes = Object.fromEntries(
  Object.entries(MATERIAL_COLOR_SEEDS).map(([palette, seed]) => [
    palette,
    themeFromSourceColor(argbFromHex(seed)),
  ]),
) as Record<ThemePalette, ReturnType<typeof themeFromSourceColor>>;
const whiteAccessibleTones = new Map<ThemePalette, number>();

const STATUS_THEMES = {
  success: themeFromSourceColor(argbFromHex(colorTokens.semanticSeeds.success)),
  warning: themeFromSourceColor(argbFromHex(colorTokens.semanticSeeds.warning)),
  info: themeFromSourceColor(argbFromHex(colorTokens.semanticSeeds.info)),
};

function toHex(color: number): string {
  return hexFromArgb(color).toUpperCase();
}

export function getColorPaletteTone(palette: ThemePalette, tone: number): string {
  if (!Number.isInteger(tone) || tone < 0 || tone > 100) {
    throw new RangeError('Material 3 color tone must be an integer from 0 to 100.');
  }
  return toHex(generatedThemes[palette].palettes.primary.tone(tone));
}

function getRelativeLuminance(color: string): number {
  const [red, green, blue] = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

function getContrastingTextColor(background: string): string {
  const luminance = getRelativeLuminance(background);
  const blackContrast = (luminance + 0.05) / 0.05;
  const whiteContrast = 1.05 / (luminance + 0.05);
  return blackContrast >= whiteContrast ? '#000000' : '#FFFFFF';
}

function getWhiteAccessibleTone(palette: ThemePalette): number {
  const cachedTone = whiteAccessibleTones.get(palette);
  if (cachedTone !== undefined) return cachedTone;

  for (let tone = 100; tone >= 0; tone -= 1) {
    const color = toHex(generatedThemes[palette].palettes.primary.tone(tone));
    const whiteContrast = 1.05 / (getRelativeLuminance(color) + 0.05);
    if (whiteContrast >= 4.5) {
      whiteAccessibleTones.set(palette, tone);
      return tone;
    }
  }
  throw new Error(`Palette ${palette} has no Material 3 tone accessible with white text.`);
}

function getLightModeSelectedTone(palette: ThemePalette, selectedTone: ThemePaletteTone): number {
  const maxWhiteAccessibleTone = getWhiteAccessibleTone(palette);
  const darkTone = Math.min(25, maxWhiteAccessibleTone - 2);
  const mediumTone = Math.round((darkTone + maxWhiteAccessibleTone) / 2);
  return {
    25: darkTone,
    50: mediumTone,
    75: maxWhiteAccessibleTone,
  }[selectedTone];
}

function createPalette(seed: ThemePalette, mode: ColorMode, selectedTone?: ThemePaletteTone): AppColorPalette {
  const generated = generatedThemes[seed];
  const scheme = generated.schemes[mode];
  const neutral = generated.palettes.neutral;
  const tone = (value: number) => toHex(neutral.tone(value));
  const primaryTone = selectedTone === undefined
    ? undefined
    : mode === 'light'
      ? getLightModeSelectedTone(seed, selectedTone)
      : DARK_MODE_PALETTE_TONES[selectedTone];
  const primary = primaryTone === undefined
    ? toHex(scheme.primary)
    : toHex(generated.palettes.primary.tone(primaryTone));
  const primaryContainer = toHex(scheme.primaryContainer);
  const onPrimary = mode === 'light' ? '#FFFFFF' : getContrastingTextColor(primary);
  const onPrimaryContainer = toHex(scheme.onPrimaryContainer);
  const successScheme = STATUS_THEMES.success.schemes[mode];
  const warningScheme = STATUS_THEMES.warning.schemes[mode];
  const infoScheme = STATUS_THEMES.info.schemes[mode];

  return {
    text: toHex(scheme.onSurface),
    textSecondary: toHex(scheme.onSurfaceVariant),
    textMuted: tone(mode === 'light' ? 40 : 80),
    background: toHex(scheme.background),
    surface: toHex(scheme.surface),
    surfaceVariant: toHex(scheme.surfaceVariant),
    surfaceElevated: tone(mode === 'light' ? 94 : 12),
    surfaceDim: tone(mode === 'light' ? 87 : 6),
    surfaceBright: tone(mode === 'light' ? 98 : 24),
    surfaceContainerLowest: tone(mode === 'light' ? 100 : 4),
    surfaceContainerLow: tone(mode === 'light' ? 96 : 10),
    surfaceContainer: tone(mode === 'light' ? 94 : 12),
    surfaceContainerHigh: tone(mode === 'light' ? 92 : 17),
    surfaceContainerHighest: tone(mode === 'light' ? 90 : 22),
    border: toHex(scheme.outlineVariant),
    borderStrong: toHex(scheme.outline),
    primary,
    primaryText: toHex(scheme.primary),
    onPrimary,
    primaryContainer,
    onPrimaryContainer,
    secondary: toHex(scheme.secondary),
    onSecondary: toHex(scheme.onSecondary),
    secondaryContainer: toHex(scheme.secondaryContainer),
    onSecondaryContainer: toHex(scheme.onSecondaryContainer),
    tertiary: toHex(scheme.tertiary),
    onTertiary: toHex(scheme.onTertiary),
    tertiaryContainer: toHex(scheme.tertiaryContainer),
    onTertiaryContainer: toHex(scheme.onTertiaryContainer),
    error: toHex(scheme.error),
    onError: toHex(scheme.onError),
    errorFill: toHex(scheme.errorContainer),
    onErrorFill: toHex(scheme.onErrorContainer),
    success: toHex(successScheme.primary),
    onSuccess: toHex(successScheme.onPrimaryContainer),
    successFill: toHex(successScheme.primaryContainer),
    warning: toHex(warningScheme.primary),
    onWarning: toHex(warningScheme.onPrimaryContainer),
    warningFill: toHex(warningScheme.primaryContainer),
    info: toHex(infoScheme.primary),
    onInfo: toHex(infoScheme.onPrimaryContainer),
    infoFill: toHex(infoScheme.primaryContainer),
    onStatus: tone(mode === 'light' ? 10 : 90),
    inverseSurface: toHex(scheme.inverseSurface),
    inverseOnSurface: toHex(scheme.inverseOnSurface),
    inversePrimary: toHex(scheme.inversePrimary),
    surfaceTint: primary,
    shadow: toHex(scheme.shadow),
    scrim: toHex(scheme.scrim),
    overlay: `rgba(0, 0, 0, ${colorTokens.overlayOpacity[mode]})`,
    backgroundElement: tone(mode === 'light' ? 96 : 12),
    backgroundSelected: primaryContainer,
  };
}

export const Colors = {
  light: createPalette('default', 'light'),
  dark: createPalette('default', 'dark'),
};

export const ColorPalettes: Record<ThemePalette, Record<ColorMode, AppColorPalette>> = {
  default: Colors,
  red: { light: createPalette('red', 'light'), dark: createPalette('red', 'dark') },
  redOrange: { light: createPalette('redOrange', 'light'), dark: createPalette('redOrange', 'dark') },
  orange: { light: createPalette('orange', 'light'), dark: createPalette('orange', 'dark') },
  yellowOrange: { light: createPalette('yellowOrange', 'light'), dark: createPalette('yellowOrange', 'dark') },
  yellow: { light: createPalette('yellow', 'light'), dark: createPalette('yellow', 'dark') },
  yellowGreen: { light: createPalette('yellowGreen', 'light'), dark: createPalette('yellowGreen', 'dark') },
  green: { light: createPalette('green', 'light'), dark: createPalette('green', 'dark') },
  blue: { light: createPalette('blue', 'light'), dark: createPalette('blue', 'dark') },
  blueViolet: { light: createPalette('blueViolet', 'light'), dark: createPalette('blueViolet', 'dark') },
  violet: { light: createPalette('violet', 'light'), dark: createPalette('violet', 'dark') },
  redViolet: { light: createPalette('redViolet', 'light'), dark: createPalette('redViolet', 'dark') },
};

export function getAppColorPalette(
  palette: ThemePalette,
  mode: ColorMode,
  selectedTone?: ThemePaletteTone | null,
): AppColorPalette {
  return selectedTone === undefined || selectedTone === null
    ? ColorPalettes[palette][mode]
    : createPalette(palette, mode, selectedTone);
}

export function getAppHeaderColors(colors: AppColorPalette, mode: ColorMode) {
  const isLightMode = mode === 'light';
  return {
    background: isLightMode ? colors.primary : colors.surface,
    foreground: isLightMode ? colors.onPrimary : colors.text,
    toolIconBackground: isLightMode ? colors.surface : colors.primary,
    toolIconForeground: isLightMode ? colors.primaryText : colors.onPrimary,
    statusBarStyle: isLightMode && colors.onPrimary === '#000000'
      ? 'dark-content' as const
      : 'light-content' as const,
  };
}

export const Fonts = Platform.select({
  ios: {
    sans: 'AppFont-Regular',
    serif: 'AppFont-Light',
    rounded: 'AppFont-Medium',
    mono: 'AppFont-SemiBold',
  },
  android: {
    sans: 'AppFont-Regular',
    serif: 'AppFont-Light',
    rounded: 'AppFont-Medium',
    mono: 'AppFont-SemiBold',
  },
  web: {
    sans: 'AppFont-Regular',
    serif: 'AppFont-Light',
    rounded: 'AppFont-Medium',
    mono: 'AppFont-SemiBold',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
