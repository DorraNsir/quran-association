import { StyleSheet, View } from 'react-native';

import { radius, useAppTheme } from '@/theme';

import { AppText } from './app-text';

/** Arabic harakat, Quranic marks, superscript alef and tatweel: never the "first letter". */
const NOT_A_LETTER = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/;
/** Letters: Arabic (incl. hamza forms and Persian/Urdu letters), Latin, digits as a last resort. */
const LETTER = /[ء-غف-يٱ-ۓۺ-ۿA-Za-zÀ-ɏ]/;

/**
 * The one letter shown in an avatar: the first meaningful letter of the
 * name, skipping spaces, diacritics, tatweel and punctuation
 * («  حمادي الشوك» → «ح», «أَحمد» → «أ»). Latin letters are upper-cased.
 * Empty or letter-less names give "" (the avatar then shows no letter).
 */
export function avatarLetter(name: string | null | undefined): string {
  for (const char of name ?? '') {
    if (NOT_A_LETTER.test(char)) continue;
    if (LETTER.test(char)) return char.toLocaleUpperCase();
  }
  return '';
}

/**
 * Round avatar with ONE letter of the name. Person photos are private
 * files (Bearer-only download), not loaded in this phase.
 */
export function InitialsAvatar({ name, size = 40 }: { name: string; size?: number }) {
  const { colors } = useAppTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.root, { width: size, height: size, backgroundColor: colors.brandSoft }]}>
      <AppText
        variant={size >= 48 ? 'heading' : 'bodyStrong'}
        style={{ color: colors.brandSoftForeground, fontSize: Math.round(size * 0.42), lineHeight: Math.round(size * 0.6) }}>
        {avatarLetter(name)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
});
