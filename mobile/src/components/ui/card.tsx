import { StyleSheet, View, type ViewProps } from 'react-native';

import { radius, spacing, useAppTheme } from '@/theme';

/** Web Card: white surface, 1px border, --radius-xl corners. */
export function Card({ style, ...rest }: ViewProps) {
  const { colors } = useAppTheme();
  return (
    <View
      {...rest}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style]}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
});
