import { StyleSheet, View } from 'react-native';

import { AppText, Icon, Pill, TimeRange } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { radius, spacing, useAppTheme } from '@/theme';

import { RESULT_LOOK, TYPE_LOOK } from './work-look';
import { sessionDay, WORK_STATUS_STYLE, type SessionPhase } from './work-model';
import type { WorkSession, WorkStatus, WorkType } from './work-types';

const w = ar.work;

/** «حفظ» / «عرضة 3» — the item's kind in its own soft colour + icon (never a result colour). */
export function WorkTypeBadge({ type, recitationNumber, large }: { type: WorkType; recitationNumber?: number | null; large?: boolean }) {
  const { colors } = useAppTheme();
  const look = TYPE_LOOK[type];
  const label = type === 'RECITATION' && recitationNumber ? `${w.type[type]} ${recitationNumber}` : w.type[type];
  return (
    <View
      style={[styles.type, large && styles.large, { backgroundColor: colors[look.bg] }]}
      accessible
      accessibilityLabel={label}
      testID={`type-${type}`}>
      <Icon name={look.icon} size={large ? 16 : 12} color={colors[look.fg]} />
      <AppText variant={large ? 'label' : 'caption'} style={{ color: colors[look.fg] }}>
        {label}
      </AppText>
    </View>
  );
}

/** The result: the web's colours, icon + label (colour is never the only signal). */
export function WorkStatusBadge({ status, large }: { status: WorkStatus; large?: boolean }) {
  const { colors } = useAppTheme();
  if (!large) {
    const style = WORK_STATUS_STYLE[status];
    return <Pill label={w.status[status]} tone={style.tone} icon={style.icon} />;
  }
  const look = RESULT_LOOK[status];
  return (
    <View style={[styles.type, styles.large, { backgroundColor: colors[look.bg] }]} testID={`status-${status}`}>
      <Icon name={look.icon} size={16} color={colors[look.fg]} />
      <AppText variant="label" style={{ color: colors[look.fg] }}>
        {w.status[status]}
      </AppText>
    </View>
  );
}

const PHASE_TONE = { UPCOMING: 'brand', ONGOING: 'warning', PAST: 'muted' } as const;

/** Day, time range and «قادمة / جارية / سابقة». */
export function WorkSessionLine({ session, phase }: { session: WorkSession; phase: SessionPhase }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.line}>
      <Icon name="calendar" size={13} color={colors.mutedForeground} />
      <AppText variant="small">{sessionDay(session)}</AppText>
      <TimeRange start={session.startTime} end={session.endTime} variant="small" tone="muted" />
      <Pill label={w.phase[phase]} tone={PHASE_TONE[phase]} />
    </View>
  );
}

const styles = StyleSheet.create({
  type: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  large: { gap: spacing.xs, paddingHorizontal: spacing.sm + 2, paddingVertical: 4 },
  line: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
});
