import { StyleSheet, View } from 'react-native';

import { AppText, Icon, type IconName } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { radius, spacing, useAppTheme, type ColorTokens } from '@/theme';

import type { AttendanceState } from './attendance-model';
import type { AttendanceStatus } from './types';

const STATE_ICON: Record<AttendanceState, IconName> = {
  COMPLETE: 'success',
  PARTIAL: 'partial',
  NOT_RECORDED: 'notRecorded',
  UPCOMING: 'clock',
  CANCELLED: 'cancelledSession',
};

const stateColor = (colors: ColorTokens, state: AttendanceState) =>
  ({
    COMPLETE: colors.primary,
    PARTIAL: colors.warning,
    NOT_RECORDED: colors.destructive,
    UPCOMING: colors.mutedForeground,
    CANCELLED: colors.mutedForeground,
  })[state];

/** Web AttendanceStateLabel: icon + label (+ "n من m مسجَّل"), colour never the only signal. */
export function AttendanceStateLabel({
  state,
  recorded,
  expected,
}: {
  state: AttendanceState;
  recorded?: number;
  expected?: number;
}) {
  const { colors } = useAppTheme();
  const color = stateColor(colors, state);
  const counts =
    recorded !== undefined && expected !== undefined && (state === 'PARTIAL' || state === 'NOT_RECORDED')
      ? ` · ${ar.attendance.progress(recorded, expected)}`
      : '';
  return (
    <View style={styles.state} accessible accessibilityLabel={`${ar.attendance.state[state]}${counts}`}>
      <Icon name={STATE_ICON[state]} size={14} color={color} />
      <AppText variant="small" style={{ color }}>
        {ar.attendance.state[state]}
        {counts}
      </AppText>
    </View>
  );
}

const statusColors = (colors: ColorTokens, status: AttendanceStatus | null) => {
  switch (status) {
    case 'PRESENT':
      return { bg: colors.brandSoft, fg: colors.brandSoftForeground };
    case 'LATE':
      return { bg: colors.warningSoft, fg: colors.warning };
    case 'ABSENT':
      return { bg: colors.destructiveSoft, fg: colors.destructive };
    case 'EXCUSED':
      return { bg: colors.muted, fg: colors.foreground };
    default:
      return { bg: 'transparent', fg: colors.mutedForeground };
  }
};

/** A student's (or teacher's) status: a read-only badge — "لم يُسجَّل بعد" is never shown as absent. */
export function AttendanceStatusBadge({ status }: { status: AttendanceStatus | null }) {
  const { colors } = useAppTheme();
  const { bg, fg } = statusColors(colors, status);
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: bg },
        status === null && { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border },
      ]}>
      <AppText variant="small" style={{ color: fg }}>
        {status ? ar.attendance.status[status] : ar.attendance.notRecorded}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  state: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  badge: {
    minWidth: 76,
    alignItems: 'center',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
});
