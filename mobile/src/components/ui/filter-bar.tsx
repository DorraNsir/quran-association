import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { radius, spacing, useAppTheme } from '@/theme';

import { AppText } from './app-text';
import { Icon } from './icon';

export interface ActiveFilter {
  key: string;
  label: string;
  clear: () => void;
}

/**
 * One compact line: a «تصفية» button (opens the screen's filter sheet; shows
 * how many filters are on), each active filter as a removable chip, a reset
 * link and the result count — instead of several rows of clipped chips.
 */
export function FilterBar({
  label,
  activeLabel,
  removeLabel,
  resetLabel,
  total,
  active,
  onOpen,
  onReset,
}: {
  label: string;
  activeLabel: (n: number) => string;
  removeLabel: (filter: string) => string;
  resetLabel: string;
  total: string | null;
  active: ActiveFilter[];
  onOpen: () => void;
  onReset: () => void;
}) {
  const { colors } = useAppTheme();
  const on = active.length > 0;
  return (
    <View style={styles.bar}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={on ? `${label}، ${activeLabel(active.length)}` : label}
        style={({ pressed }) => [
          styles.button,
          { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.brandSoft : colors.card },
          pressed && { opacity: 0.8 },
        ]}>
        <Icon name="filter" size={16} color={on ? colors.primary : colors.foreground} />
        <AppText variant="small" style={{ color: on ? colors.brandSoftForeground : colors.foreground }}>
          {label}
          {on ? ` (${active.length})` : ''}
        </AppText>
      </Pressable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.flex}>
        {active.map((f) => (
          <Pressable
            key={f.key}
            onPress={f.clear}
            accessibilityRole="button"
            accessibilityLabel={removeLabel(f.label)}
            hitSlop={{ top: 6, bottom: 6 }}
            style={[styles.chip, { backgroundColor: colors.brandSoft }]}>
            <AppText variant="small" numberOfLines={1} style={[styles.chipText, { color: colors.brandSoftForeground }]}>
              {f.label}
            </AppText>
            <Icon name="close" size={12} color={colors.brandSoftForeground} />
          </Pressable>
        ))}
        {on ? (
          <Pressable onPress={onReset} accessibilityRole="button" accessibilityLabel={resetLabel} hitSlop={8}>
            <AppText variant="small" tone="primary">
              {resetLabel}
            </AppText>
          </Pressable>
        ) : null}
      </ScrollView>
      {total !== null ? (
        <AppText variant="small" tone="muted" accessibilityLiveRegion="polite">
          {total}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  button: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
  },
  chips: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  chip: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
  },
  chipText: { maxWidth: 140 },
  flex: { flex: 1 },
});
