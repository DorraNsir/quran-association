import { StyleSheet, View } from 'react-native';

import { radius, spacing, useAppTheme } from '@/theme';

import { AppText } from './app-text';

/** Web Badge: a small rounded label. */
export function Pill({ label, tone = 'muted' }: { label: string; tone?: 'muted' | 'brand' | 'warning' }) {
  const { colors } = useAppTheme();
  const bg = tone === 'brand' ? colors.brandSoft : tone === 'warning' ? colors.warningSoft : colors.muted;
  const fg =
    tone === 'brand' ? colors.brandSoftForeground : tone === 'warning' ? colors.warning : colors.mutedForeground;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <AppText variant="caption" style={{ color: fg }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 1 },
});
