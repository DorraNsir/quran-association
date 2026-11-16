import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { spacing } from '@/theme';

import { AppText, type AppTextProps } from './app-text';

/**
 * «09:00 – 11:00» without relying on bidi reordering: start, dash and end
 * are three separate texts in a row. In the RTL layout the first child is
 * drawn on the RIGHT, so the START time is read first — the web's
 * convention (frontend lib/format.ts formatTimeRange).
 */
export function TimeRange({
  start,
  end,
  variant = 'small',
  tone,
  style,
}: {
  start: string;
  end: string;
  variant?: AppTextProps['variant'];
  tone?: AppTextProps['tone'];
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[styles.row, style]}
      accessible
      accessibilityLabel={`من ${start} إلى ${end}`}>
      <AppText variant={variant} tone={tone} style={styles.time}>
        {start}
      </AppText>
      <AppText variant={variant} tone={tone}>
        –
      </AppText>
      <AppText variant={variant} tone={tone} style={styles.time}>
        {end}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  time: { writingDirection: 'ltr', fontVariant: ['tabular-nums'] },
});
