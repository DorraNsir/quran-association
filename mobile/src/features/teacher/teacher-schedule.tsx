import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import { AlertBox, AppText, Card, ChipRow, Icon, LinkButton, Pill, PressableRow, Screen, TimeRange } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { WEEKDAY_NAMES, weekdayOf, timeRangeLabel } from '@/i18n/format';
import { spacing, useAppTheme } from '@/theme';

import { platformClock, WEEK_ORDER } from './dashboard-model';
import { formatDuration, teacherWeeklySlots, weekDays, weeklyMinutes, type WeeklySlotView } from './schedule-model';
import type { Weekday } from './types';
import { teacherKey, useTeacherWorkspace } from './use-teacher-dashboard';
import { usePullToRefresh } from './use-refresh';

const s = ar.schedule;
const ALL = 'ALL';
type DayFilter = Weekday | typeof ALL;

/**
 * «جدولي»: my RECURRING weekly timetable (from the cached teacher workspace —
 * no extra request). Not a list of dated lessons: those are in «الحصص».
 */
export function TeacherScheduleScreen() {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const router = useRouter();
  const preferences = usePreferences();
  const workspace = useTeacherWorkspace(teacherId);
  const { refreshing, onRefresh } = usePullToRefresh([[...teacherKey(teacherId), 'workspace']]);
  const { colors } = useAppTheme();
  const [filter, setFilter] = useState<DayFilter>(ALL);

  const today = weekdayOf(platformClock(preferences.data?.timezone).today);
  const slots = workspace.data ? teacherWeeklySlots(workspace.data) : [];
  const days = weekDays(slots).filter((d) => filter === ALL || d.day === filter);
  const openClass = (classId: string) => router.push({ pathname: '/teacher/classes/[id]', params: { id: classId } });

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <QueryState query={workspace} empty={slots.length === 0} emptyIcon="calendar" emptyTitle={s.empty} emptyDescription={s.emptyHint}>
        <Card style={styles.summary}>
          <View style={styles.inline}>
            <Icon name="calendar" size={18} color={colors.primary} />
            <AppText variant="bodyStrong" style={styles.flex}>
              {s.weekly}
            </AppText>
            <AppText variant="small" tone="muted">
              {s.summary(slots.length, formatDuration(weeklyMinutes(slots)))}
            </AppText>
          </View>
          <AlertBox tone="info" message={s.recurringNote} />
          <View style={styles.end}>
            <LinkButton label={s.seeSessions} onPress={() => router.push('/teacher/sessions')} />
          </View>
        </Card>

        <ChipRow
          label={s.pickDay}
          value={filter}
          onChange={setFilter}
          options={[
            { value: ALL, label: s.all },
            ...WEEK_ORDER.map((day) => ({
              value: day,
              label: day === today ? `${WEEKDAY_NAMES[day]} · ${s.today}` : WEEKDAY_NAMES[day],
            })),
          ]}
        />

        {days.map((d) =>
          filter !== ALL && d.slots.length === 0 ? (
            <Card key={d.day}>
              <EmptyState icon="calendar" title={s.emptyDay} />
            </Card>
          ) : (
            <DayCard key={d.day} day={d.day} slots={d.slots} isToday={d.day === today} onOpen={openClass} />
          ),
        )}
      </QueryState>
    </Screen>
  );
}

function DayCard({
  day,
  slots,
  isToday,
  onOpen,
}: {
  day: Weekday;
  slots: WeeklySlotView[];
  isToday: boolean;
  onOpen: (classId: string) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Card style={[styles.day, isToday && { borderColor: colors.primary }]}>
      <View style={styles.inline}>
        <AppText variant="label" accessibilityRole="header" style={[styles.flex, isToday && { color: colors.primary }]}>
          {WEEKDAY_NAMES[day]}
        </AppText>
        {isToday ? <Pill label={s.today} tone="brand" /> : null}
      </View>
      {slots.length === 0 ? (
        <AppText variant="small" tone="muted">
          {s.noSlot}
        </AppText>
      ) : (
        slots.map((slot, i) => <SlotRow key={slot.id} slot={slot} bordered={i > 0} onOpen={onOpen} />)
      )}
    </Card>
  );
}

function SlotRow({ slot, bordered, onOpen }: { slot: WeeklySlotView; bordered: boolean; onOpen: (classId: string) => void }) {
  const { colors } = useAppTheme();
  const title = slot.shared ? s.shared(slot.groupNames.join(' + ')) : (slot.groupNames[0] ?? '—');
  const place = `${slot.roomName ?? s.noRoom} — ${slot.branchName ?? s.noBranch}`;
  return (
    <PressableRow
      bordered={bordered}
      onPress={() => onOpen(slot.classId)}
      accessibilityLabel={`${WEEKDAY_NAMES[slot.day]} ${timeRangeLabel(slot.start, slot.end)}، ${title}، ${ar.labels.teachingRole[slot.role]}، ${place}`}>
      <View style={styles.inline}>
        <TimeRange start={slot.start} end={slot.end} variant="label" tone="primary" />
        <AppText variant="small" tone="muted">
          {formatDuration(slot.minutes)}
        </AppText>
      </View>
      <AppText variant="bodyStrong" numberOfLines={2}>
        {title}
      </AppText>
      <View style={styles.inline}>
        <Icon name="room" size={13} color={colors.mutedForeground} />
        <AppText variant="small" tone="muted" numberOfLines={2} style={styles.shrink}>
          {place}
        </AppText>
      </View>
      <View style={styles.inline}>
        <Pill label={ar.labels.teachingRole[slot.role]} tone={slot.role === 'SUPERVISOR' ? 'brand' : 'muted'} />
        {slot.shared ? <Pill label={ar.teacher.shared} /> : null}
      </View>
    </PressableRow>
  );
}

const styles = StyleSheet.create({
  summary: { gap: spacing.sm },
  day: { gap: spacing.xs },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  end: { flexDirection: 'row', justifyContent: 'flex-end' },
  shrink: { flexShrink: 1 },
  flex: { flex: 1 },
});
