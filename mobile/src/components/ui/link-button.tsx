import { Pressable, StyleSheet } from 'react-native';

import { radius, spacing, useAppTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

/** «عرض الكل ‹» — a compact text link with the RTL forward chevron; 44pt touch height. */
export function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={label}
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => [
        styles.root,
        { backgroundColor: pressed ? colors.brandSoft : 'transparent', borderColor: colors.border },
      ]}>
      <AppText variant="small" tone="primary">
        {label}
      </AppText>
      <Icon name="forward" size={14} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
  },
});
