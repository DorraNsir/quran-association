import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { radius, spacing, touchTarget, useAppTheme } from '@/theme';

import { Icon } from './icon';

/** A tappable list row with the RTL "forward" chevron (on the left). */
export function PressableRow({
  onPress,
  accessibilityLabel,
  children,
  bordered = true,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  children: ReactNode;
  bordered?: boolean;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.row,
        bordered && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        pressed && { backgroundColor: colors.accent },
      ]}>
      <View style={styles.content}>{children}</View>
      <Icon name="forward" size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  content: { flex: 1, gap: spacing.xs },
});
