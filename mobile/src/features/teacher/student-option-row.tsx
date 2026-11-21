import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Icon, InitialsAvatar } from '@/components/ui';
import { spacing, touchTarget, useAppTheme } from '@/theme';

/**
 * One student of a choice list, compact: round photo (private, with the token) or the first
 * letter of the name, the name, a check mark when selected. Radio semantics; a hairline divider
 * between rows instead of a border around each one.
 */
export function StudentOptionRow({
  name,
  photoUrl,
  selected,
  divider,
  onPress,
}: {
  name: string;
  photoUrl: string | null;
  selected: boolean;
  divider: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      testID="student-option"
      accessibilityRole="radio"
      accessibilityLabel={name}
      accessibilityState={{ selected, checked: selected }}
      style={({ pressed }) => [
        styles.row,
        divider && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
        selected && { backgroundColor: colors.brandSoft },
        pressed && !selected && { backgroundColor: colors.accent },
      ]}>
      <InitialsAvatar name={name} size={42} photoUrl={photoUrl} />
      <View style={styles.flex}>
        <AppText variant="body" numberOfLines={1} style={selected ? { color: colors.brandSoftForeground } : undefined}>
          {name}
        </AppText>
      </View>
      {selected ? <Icon name="success" size={18} color={colors.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: Math.max(touchTarget, 56),
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  flex: { flex: 1, minWidth: 0 },
});
