import { StyleSheet, Text, type TextProps } from 'react-native';

import { textVariants, useAppTheme, type ColorTokens, type TextVariant } from '@/theme';

type Tone = 'default' | 'muted' | 'primary' | 'destructive' | 'warning' | 'onPrimary';

const toneColor = (colors: ColorTokens, tone: Tone) =>
  ({
    default: colors.foreground,
    muted: colors.mutedForeground,
    primary: colors.primary,
    destructive: colors.destructive,
    warning: colors.warning,
    onPrimary: colors.primaryForeground,
  })[tone];

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  tone?: Tone;
  center?: boolean;
}

/** Themed Arabic text: IBM Plex Sans Arabic, RTL writing direction. */
export function AppText({
  variant = 'body',
  tone = 'default',
  center,
  style,
  ...rest
}: AppTextProps) {
  const { colors } = useAppTheme();
  return (
    <Text
      {...rest}
      style={[
        styles.base,
        textVariants[variant],
        { color: toneColor(colors, tone) },
        center && styles.center,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: { writingDirection: 'rtl' },
  center: { textAlign: 'center' },
});
