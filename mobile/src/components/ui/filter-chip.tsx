import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { radius, spacing, useAppTheme } from '@/theme';

import { AppText } from './app-text';

/**
 * One option of a single-choice filter (selected = solid green, like the web
 * tabs) — or, with role "checkbox", one toggle of a multiple choice.
 */
export function FilterChip({
  label,
  selected,
  onPress,
  role = 'radio',
  size = 'md',
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  role?: 'radio' | 'checkbox';
  /** 'lg': a 40 dp chip (a screen's main filter) */
  size?: 'md' | 'lg';
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityState={{ selected, checked: selected }}
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => [
        styles.chip,
        size === 'lg' && styles.large,
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

/**
 * A horizontally scrollable row of chips (starts on the right in RTL), always its own height. A
 * horizontal ScrollView GROWS by default (flexGrow 1): in a column with room to spare — a Screen's
 * content grows to the viewport, so whenever the content is shorter (loading, few or collapsed
 * cards) — it took the spare height, and its row stretched the chips into huge pills. Hence no
 * grow / shrink, and chips centred, never stretched.
 */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  label,
  size,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: 'md' | 'lg';
}) {
  return (
    <ScrollView
      horizontal
      style={styles.scroller}
      showsHorizontalScrollIndicator={false}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      contentContainerStyle={styles.row}>
      {options.map((o) => (
        <FilterChip key={o.value} label={o.label} size={size} selected={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroller: { flexGrow: 0, flexShrink: 0 },
  row: { gap: spacing.xs, paddingVertical: 2, alignItems: 'center' },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
  },
  large: { minHeight: 40, paddingHorizontal: spacing.lg },
});
