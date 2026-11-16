import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Icon, Pill, TimeRange } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { dayOfMonth, formatDateLong, formatMonth, sameYear, WEEKDAY_NAMES, weekdayOf } from '@/i18n/format';
import { radius, spacing, touchTarget, useAppTheme } from '@/theme';

import { AttendanceStateLabel } from './attendance-badges';
import type { SessionItem } from './sessions-model';

export function SessionStatusPill({ status }: { status: SessionItem['status'] }) {
  return (
    <Pill
      label={ar.sessions.status[status]}
      tone={status === 'COMPLETED' ? 'brand' : status === 'CANCELLED' ? 'warning' : 'muted'}
    />
  );
}

/**
 * A session at a glance: a date box on the right (weekday, day, month —
 * "today" in solid green; hidden when the list already groups by day), then
 * group(s), THIS session's room and branch, a time chip and its badges.
 * Pressable when `onPress` is given; cancelled sessions are dimmed, never hidden.
 */
export function SessionCard({
  session: s,
  today,
  onPress,
  showDate = true,
  bordered = true,
  showProgress = false,
}: {
  session: SessionItem;
  today: string;
  onPress?: () => void;
  showDate?: boolean;
  bordered?: boolean;
  /** Attendance progress line (sessions list); hidden for lessons not started or cancelled */
  showProgress?: boolean;
}) {
  const { colors } = useAppTheme();
  const weekday = WEEKDAY_NAMES[weekdayOf(s.date)];
  const onToday = s.isToday ? colors.primaryForeground : undefined;
  const cancelled = s.status === 'CANCELLED';
  const label = `${s.isToday ? `${ar.teacher.today}، ` : ''}${formatDateLong(s.date)}، من ${s.start} إلى ${s.end}، ${s.groupNames.join('، ')}، ${s.roomName} — ${s.branchName}، ${ar.sessions.status[s.status]}${s.isExtra ? `، ${ar.teacher.extra}` : ''}`;

  const body = (
    <>
      {showDate ? (
        <View style={[styles.dateBox, { backgroundColor: s.isToday ? colors.primary : colors.brandSoft }]}>
          <AppText variant="small" center numberOfLines={1} style={{ color: onToday ?? colors.primary }}>
            {s.isToday ? ar.teacher.today : weekday}
          </AppText>
          <AppText variant="heading" center style={[styles.number, { color: onToday ?? colors.foreground }]}>
            {dayOfMonth(s.date)}
          </AppText>
          <AppText variant="small" center numberOfLines={1} style={{ color: onToday ?? colors.mutedForeground }}>
            {formatMonth(s.date, !sameYear(s.date, today))}
          </AppText>
        </View>
      ) : null}
      <View style={styles.body}>
        <AppText
          variant="bodyStrong"
          numberOfLines={2}
          style={cancelled ? [styles.struck, { color: colors.mutedForeground }] : undefined}>
          {s.groupNames.join(' · ')}
        </AppText>
        <View style={styles.meta}>
          <Icon name="location" size={14} color={colors.mutedForeground} />
          <AppText variant="caption" tone="muted" numberOfLines={2} style={styles.shrink}>
            {s.roomName} — {s.branchName}
          </AppText>
        </View>
        <View style={styles.badges}>
          <View style={[styles.timeChip, { backgroundColor: cancelled ? colors.muted : colors.brandSoft }]}>
            <Icon name="clock" size={13} color={cancelled ? colors.mutedForeground : colors.primary} />
            <TimeRange start={s.start} end={s.end} variant="small" tone={cancelled ? 'muted' : 'primary'} />
          </View>
          {s.status !== 'SCHEDULED' ? <SessionStatusPill status={s.status} /> : null}
          {s.isExtra ? <Pill label={ar.teacher.extra} tone="warning" /> : null}
          {s.isShared ? <Pill label={ar.teacher.shared} /> : null}
        </View>
        {showProgress && (s.progress === 'COMPLETE' || s.progress === 'PARTIAL' || s.progress === 'NOT_RECORDED') ? (
          <AttendanceStateLabel state={s.progress} recorded={s.recorded} expected={s.expected} />
        ) : null}
        {s.cancellationReason ? (
          <AppText variant="small" tone="muted" numberOfLines={2}>
            {ar.sessions.cancellationReason}: {s.cancellationReason}
          </AppText>
        ) : null}
      </View>
      {onPress ? <Icon name="forward" size={18} color={colors.mutedForeground} /> : null}
    </>
  );

  const rowStyle = [styles.row, bordered && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }];
  if (!onPress)
    return (
      <View style={rowStyle} accessible accessibilityLabel={label}>
        {body}
      </View>
    );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [...rowStyle, pressed && { backgroundColor: colors.accent }]}>
      {body}
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
  dateBox: {
    width: 76,
    alignSelf: 'flex-start',
    alignItems: 'center',
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  number: { fontVariant: ['tabular-nums'] },
  body: { flex: 1, gap: spacing.xs },
  struck: { textDecorationLine: 'line-through' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  shrink: { flexShrink: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
});
