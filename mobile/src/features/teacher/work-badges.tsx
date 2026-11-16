import { StyleSheet, View } from 'react-native';

import { AppText, Icon, Pill, TimeRange } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { radius, spacing, useAppTheme } from '@/theme';

import { cancelledLabel, progressLabel, sessionDay, WORK_STATUS_STYLE, WORK_TYPE_ICON, type SessionPhase } from './work-model';
import type { WorkProgress, WorkSession, WorkStatus, WorkType } from './work-types';

const w = ar.work;

/** «حفظ» / «عرضة 3» — the item's kind, outlined (never confused with a result). */
export function WorkTypeBadge({ type, recitationNumber }: { type: WorkType; recitationNumber?: number | null }) {
  const { colors } = useAppTheme();
  const label = type === 'RECITATION' && recitationNumber ? `${w.type[type]} ${recitationNumber}` : w.type[type];
  return (
    <View style={[styles.type, { borderColor: colors.border, backgroundColor: colors.card }]} accessible accessibilityLabel={label}>
      <Icon name={WORK_TYPE_ICON[type]} size={12} color={colors.foreground} />
      <AppText variant="caption">{label}</AppText>
    </View>
  );
}

/** The result: the web's colours, icon + label (colour is never the only signal). */
export function WorkStatusBadge({ status }: { status: WorkStatus }) {
  const style = WORK_STATUS_STYLE[status];
  return <Pill label={w.status[status]} tone={style.tone} icon={style.icon} />;
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

/** The SERVER's progress: label + bar of completed over active items; cancelled ones counted apart. */
export function WorkProgressView({ progress: p }: { progress: WorkProgress }) {
  const { colors } = useAppTheme();
  const extra = [p.pending > 0 ? w.pendingCount(p.pending) : null, p.cancelled > 0 ? cancelledLabel(p.cancelled) : null].filter(Boolean);
  return (
    <View style={styles.progress}>
      <AppText variant="label">{progressLabel(p)}</AppText>
      {p.active > 0 ? (
        <View
          style={[styles.bar, { backgroundColor: colors.muted }]}
          accessibilityRole="progressbar"
          accessibilityLabel={progressLabel(p)}
          accessibilityValue={{ min: 0, max: p.active, now: p.completed }}>
          <View style={[styles.fill, { backgroundColor: colors.primary, width: `${Math.round((p.completed / p.active) * 100)}%` }]} />
        </View>
      ) : null}
      {extra.length ? (
        <AppText variant="small" tone="muted">
          {extra.join(' · ')}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  type: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  line: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  progress: { gap: 4 },
  bar: { height: 6, borderRadius: radius.full, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.full },
});
