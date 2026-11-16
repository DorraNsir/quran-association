import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { radius, spacing, useAppTheme } from '@/theme';

import { AppText } from './app-text';

/** One option of a single-choice filter (selected = solid green, like the web tabs). */
export function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, checked: selected }}
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? { backgroundColor: colors.primary, borderColor: colors.primary }
          : { backgroundColor: pressed ? colors.accent : colors.card, borderColor: colors.border },
      ]}>
      <AppText variant="small" style={{ color: selected ? colors.primaryForeground : colors.foreground }}>
        {label}
      </AppText>
    </Pressable>
  );
}

/** A horizontally scrollable row of chips (starts on the right in RTL). */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      contentContainerStyle={styles.row}>
      {options.map((o) => (
        <FilterChip key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs, paddingVertical: 2 },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
  },
});
