import type { TextStyle } from 'react-native';

/**
 * IBM Plex Sans Arabic — the web app's UI font (frontend/src/app/layout.tsx).
 * Custom fonts on Android do not synthesize weights, so each weight is its
 * own family; pick it through `fontFor(weight)` instead of `fontWeight`.
 */
export const fontFamilies = {
  regular: 'IBMPlexSansArabic_400Regular',
  medium: 'IBMPlexSansArabic_500Medium',
  semibold: 'IBMPlexSansArabic_600SemiBold',
  bold: 'IBMPlexSansArabic_700Bold',
} as const;

export type FontWeightName = keyof typeof fontFamilies;

export const fontFor = (weight: FontWeightName): TextStyle => ({
  fontFamily: fontFamilies[weight],
});

/** Type scale (px), close to the web's Tailwind text-* sizes. */
export const textVariants = {
  title: { fontSize: 24, lineHeight: 36, ...fontFor('bold') },
  heading: { fontSize: 18, lineHeight: 28, ...fontFor('semibold') },
  body: { fontSize: 15, lineHeight: 24, ...fontFor('regular') },
  bodyStrong: { fontSize: 15, lineHeight: 24, ...fontFor('semibold') },
  label: { fontSize: 14, lineHeight: 20, ...fontFor('medium') },
  caption: { fontSize: 13, lineHeight: 20, ...fontFor('regular') },
} satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof textVariants;
