import { useColorScheme } from 'react-native';

import { darkColors, lightColors, type ColorTokens } from './colors';
import { radius, spacing, touchTarget } from './metrics';
import { fontFamilies, fontFor, textVariants } from './typography';

export interface AppTheme {
  dark: boolean;
  colors: ColorTokens;
  spacing: typeof spacing;
  radius: typeof radius;
  touchTarget: number;
}

const build = (dark: boolean): AppTheme => ({
  dark,
  colors: dark ? darkColors : lightColors,
  spacing,
  radius,
  touchTarget,
});

export const lightTheme = build(false);
export const darkTheme = build(true);

/** The active theme, following the system light/dark setting. */
export function useAppTheme(): AppTheme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}

export { fontFamilies, fontFor, radius, spacing, textVariants, touchTarget };
export type { ColorTokens };
export type { TextVariant } from './typography';
