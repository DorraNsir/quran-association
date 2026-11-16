import { StyleSheet, View } from 'react-native';

import { AppText, Icon, Pill, PressableRow, TimeRange, type IconName } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { WEEKDAY_NAMES } from '@/i18n/format';
import { radius, spacing, useAppTheme } from '@/theme';

import { studentsLabel } from './classes-model';
import type { ClassSlot, TeacherClassSummary } from './dashboard-model';

/** Weekly slots as chips: «الاثنين  09:00 – 11:00», shared slots marked. */
export function SlotChips({ slots }: { slots: ClassSlot[] }) {
  const { colors } = useAppTheme();
  if (slots.length === 0)
    return (
      <AppText variant="caption" tone="muted">
        {ar.classes.noSchedule}
      </AppText>
    );
  return (
    <View style={styles.chips}>
      {slots.map((slot) => (
        <View
          key={slot.id}
          style={[styles.chip, { backgroundColor: colors.muted }]}
          accessible
          accessibilityLabel={`${WEEKDAY_NAMES[slot.day]} من ${slot.start} إلى ${slot.end}${slot.shared ? `، ${ar.teacher.shared}` : ''}`}>
          <AppText variant="small">{WEEKDAY_NAMES[slot.day]}</AppText>
          <TimeRange start={slot.start} end={slot.end} tone="muted" />
          {slot.shared ? <Icon name="students" size={12} color={colors.mutedForeground} /> : null}
        </View>
      ))}
    </View>
  );
}

function Meta({ icon, text }: { icon: IconName; text: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.meta}>
      <Icon name={icon} size={14} color={colors.mutedForeground} />
      <AppText variant="caption" tone="muted" numberOfLines={1} style={styles.shrink}>
        {text}
      </AppText>
    </View>
  );
}

/**
 * One of my classes, three tidy lines: name + my role, where (branch ·
 * rooms), students + status, then the weekly slots — tap to open it.
 */
export function ClassCard({
  item: c,
  onPress,
  bordered = true,
}: {
  item: TeacherClassSummary;
  onPress: () => void;
  bordered?: boolean;
}) {
  return (
    <PressableRow
      onPress={onPress}
      bordered={bordered}
      accessibilityLabel={`${c.groupName} — ${c.branchName}، ${ar.labels.teachingRole[c.role]}، ${studentsLabel(c.activeStudents)}`}>
      <View style={styles.titleRow}>
        <AppText variant="bodyStrong" numberOfLines={2} style={styles.flex}>
          {c.groupName}
        </AppText>
        <Pill label={ar.labels.teachingRole[c.role]} tone={c.role === 'SUPERVISOR' ? 'brand' : 'muted'} />
      </View>
      {c.audience ? (
        <AppText variant="caption" tone="muted" numberOfLines={1}>
          {c.audience}
        </AppText>
      ) : null}
      <Meta icon="location" text={c.rooms.length ? `${c.branchName} · ${c.rooms.join('، ')}` : c.branchName} />
      <View style={styles.titleRow}>
        <Meta icon="students" text={studentsLabel(c.activeStudents)} />
        {c.status !== 'ACTIVE' ? <Pill label={ar.labels.status[c.status]} tone="warning" /> : null}
      </View>
      <SlotChips slots={c.slots} />
    </PressableRow>
  );
}

/**
 * The weekly schedule of ONE class, one slot per row: weekday and time, then
 * the slot's own room (with its branch when it is not the class's branch),
 * and the partner groups of a shared slot.
 */
export function ScheduleList({ slots }: { slots: ClassSlot[] }) {
  const { colors } = useAppTheme();
  if (slots.length === 0)
    return (
      <AppText variant="caption" tone="muted">
        {ar.classes.noSchedule}
      </AppText>
    );
  return (
    <View style={styles.scheduleList}>
      {slots.map((slot, i) => {
        const place = slot.roomName
          ? slot.roomBranchName
            ? `${slot.roomName} — ${slot.roomBranchName}`
            : slot.roomName
          : '—';
        return (
          <View
            key={slot.id}
            style={[styles.slotRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}
            accessible
            accessibilityLabel={`${WEEKDAY_NAMES[slot.day]} من ${slot.start} إلى ${slot.end}، ${place}${slot.sharedWith.length ? `، ${ar.classes.sharedWith(slot.sharedWith.join('، '))}` : ''}`}>
            <View style={[styles.dayTag, { backgroundColor: colors.brandSoft }]}>
              <AppText variant="small" style={{ color: colors.brandSoftForeground }}>
                {WEEKDAY_NAMES[slot.day]}
              </AppText>
            </View>
            <View style={styles.slotBody}>
              <TimeRange start={slot.start} end={slot.end} variant="label" />
              <View style={styles.meta}>
                <Icon name="room" size={13} color={colors.mutedForeground} />
                <AppText variant="caption" tone="muted" numberOfLines={2} style={styles.shrink}>
                  {place}
                </AppText>
              </View>
              {slot.sharedWith.length ? (
                <View style={styles.meta}>
                  <Icon name="students" size={13} color={colors.mutedForeground} />
                  <AppText variant="caption" tone="muted" numberOfLines={2} style={styles.shrink}>
                    {ar.classes.sharedWith(slot.sharedWith.join('، '))}
                  </AppText>
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 },
  scheduleList: { gap: 0 },
  slotRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm },
  dayTag: {
    minWidth: 72,
    alignItems: 'center',
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  slotBody: { flex: 1, gap: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
});

