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

const generatedThemes = Object.fromEntries(
  Object.entries(MATERIAL_COLOR_SEEDS).map(([palette, seed]) => [
    palette,
    themeFromSourceColor(argbFromHex(seed)),
  ]),
) as Record<ThemePalette, ReturnType<typeof themeFromSourceColor>>;

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

function createPalette(seed: ThemePalette, mode: ColorMode): AppColorPalette {
  const generated = generatedThemes[seed];
  const scheme = generated.schemes[mode];
  const neutral = generated.palettes.neutral;
  const tone = (value: number) => toHex(neutral.tone(value));
  const successScheme = STATUS_THEMES.success.schemes[mode];
  const warningScheme = STATUS_THEMES.warning.schemes[mode];
  const infoScheme = STATUS_THEMES.info.schemes[mode];

  return {
    text: toHex(scheme.onSurface),
    textSecondary: toHex(scheme.onSurfaceVariant),
    textMuted: toHex(scheme.outline),
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
    primary: toHex(scheme.primary),
    primaryText: toHex(scheme.primary),
    onPrimary: toHex(scheme.onPrimary),
    primaryContainer: toHex(scheme.primaryContainer),
    onPrimaryContainer: toHex(scheme.onPrimaryContainer),
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
    surfaceTint: toHex(scheme.primary),
    shadow: toHex(scheme.shadow),
    scrim: toHex(scheme.scrim),
    overlay: `rgba(0, 0, 0, ${colorTokens.overlayOpacity[mode]})`,
    backgroundElement: tone(mode === 'light' ? 96 : 12),
    backgroundSelected: toHex(scheme.primaryContainer),
  };
}

export const Colors = {
  light: createPalette('default', 'light'),
  dark: createPalette('default', 'dark'),
};

export const ColorPalettes: Record<ThemePalette, Record<ColorMode, AppColorPalette>> = {
  default: Colors,
  skyBlue: { light: createPalette('skyBlue', 'light'), dark: createPalette('skyBlue', 'dark') },
  emerald: { light: createPalette('emerald', 'light'), dark: createPalette('emerald', 'dark') },
  amber: { light: createPalette('amber', 'light'), dark: createPalette('amber', 'dark') },
  ruby: { light: createPalette('ruby', 'light'), dark: createPalette('ruby', 'dark') },
  softPurple: { light: createPalette('softPurple', 'light'), dark: createPalette('softPurple', 'dark') },
  purple: { light: createPalette('purple', 'light'), dark: createPalette('purple', 'dark') },
  indigo: { light: createPalette('indigo', 'light'), dark: createPalette('indigo', 'dark') },
  deepTeal: { light: createPalette('deepTeal', 'light'), dark: createPalette('deepTeal', 'dark') },
  burntOrange: { light: createPalette('burntOrange', 'light'), dark: createPalette('burntOrange', 'dark') },
  dustyRose: { light: createPalette('dustyRose', 'light'), dark: createPalette('dustyRose', 'dark') },
  brown: { light: createPalette('brown', 'light'), dark: createPalette('brown', 'dark') },
  slateBlue: { light: createPalette('slateBlue', 'light'), dark: createPalette('slateBlue', 'dark') },
  lightPurple: { light: createPalette('lightPurple', 'light'), dark: createPalette('lightPurple', 'dark') },
  olive: { light: createPalette('olive', 'light'), dark: createPalette('olive', 'dark') },
  tealBlue: { light: createPalette('tealBlue', 'light'), dark: createPalette('tealBlue', 'dark') },
};

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
