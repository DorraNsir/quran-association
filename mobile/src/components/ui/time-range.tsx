import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { timeRangeLabel } from '@/i18n/format';
import { spacing } from '@/theme';

import { AppText, type AppTextProps } from './app-text';

/**
 * «09:00 – 11:00» without relying on bidi reordering: start, dash and end
 * are three separate texts in a row whose direction is FIXED to RTL — the
 * START time is always drawn on the RIGHT and read first, whatever the
 * device's layout direction (e.g. Expo Go before the RTL reload) or the
 * surrounding text. Same order as the web (frontend lib/format.ts
 * formatTimeRange in an RTL page). The times are shown exactly as given.
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
      accessibilityLabel={timeRangeLabel(start, end)}>
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
  row: { direction: 'rtl', flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  time: { writingDirection: 'ltr', fontVariant: ['tabular-nums'] },
});
