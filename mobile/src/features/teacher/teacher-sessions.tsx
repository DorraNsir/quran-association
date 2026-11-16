import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import { AppText, Button, Card, ChipRow, Pill, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { formatDateLong } from '@/i18n/format';
import { spacing, useAppTheme } from '@/theme';

import { platformClock, teacherClasses } from './dashboard-model';
import { SessionCard } from './session-card';
import {
  combineQuery,
  DEFAULT_SESSION_TAB,
  groupByDay,
  PERIOD_PRESETS,
  periodRange,
  SESSION_TABS,
  tabQuery,
  toSessionItem,
  type PeriodPreset,
  type SessionTab,
} from './sessions-model';
import { teacherKey, useTeacherWorkspace } from './use-teacher-dashboard';
import { usePullToRefresh } from './use-refresh';
import { usePendingCount, useTeacherSessionPages } from './use-teacher-sessions';

const ALL = 'all';

/**
 * «الحصص»: my dated sessions, by status tab, period and class — server-side
 * filters of GET /teacher/sessions, paginated (20 per page, more on demand).
 * Cancelled sessions are kept and shown only in «الملغاة» and «الكل».
 */
export function TeacherSessionsScreen() {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const router = useRouter();
  const { colors } = useAppTheme();
  const preferences = usePreferences();
  const workspace = useTeacherWorkspace(teacherId);
  const clock = platformClock(preferences.data?.timezone);
  const year = preferences.data?.currentAcademicYear ?? null;

  const [tab, setTab] = useState<SessionTab>(DEFAULT_SESSION_TAB);
  const [period, setPeriod] = useState<PeriodPreset>('all');
  const [classId, setClassId] = useState<string>(ALL);

  const classes = workspace.data ? teacherClasses(workspace.data) : [];
  // Wait for the platform day before asking for date-bounded lists
  const query = preferences.isPending
    ? null
    : combineQuery(
        tabQuery(tab, clock.today),
        periodRange(period, clock.today, year),
        classId === ALL ? undefined : classId,
      );
  const pages = useTeacherSessionPages(teacherId, query);
  // One small count request for the «حضور غير مكتمل» chip (same filters)
  const pendingQuery = preferences.isPending
    ? null
    : combineQuery(
        tabQuery('pending', clock.today),
        periodRange(period, clock.today, year),
        classId === ALL ? undefined : classId,
      );
  const pending = usePendingCount(teacherId, pendingQuery);
  const { refreshing, onRefresh } = usePullToRefresh([[...teacherKey(teacherId), 'sessions', 'list']]);

  const items = (pages.data?.pages ?? []).flatMap((p) => p.data).map((s) => toSessionItem(s, clock));
  const total = pages.data?.pages[0]?.meta.total ?? 0;
  const days = groupByDay(items);
  const filtered = period !== 'all' || classId !== ALL;
  const emptyRange = !preferences.isPending && query === null;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} edges={[]}>
      <View style={styles.filters}>
        <ChipRow
          label={ar.sessions.title}
          value={tab}
          onChange={setTab}
          options={SESSION_TABS.map((value) => ({
            value,
            label:
              value === 'pending' && pending.data ? `${ar.sessions.tabs.pending} (${pending.data})` : ar.sessions.tabs[value],
          }))}
        />
        <ChipRow
          label={ar.sessions.filterPeriod}
          value={period}
          onChange={setPeriod}
          options={PERIOD_PRESETS.filter((p) => p !== 'year' || year).map((value) => ({
            value,
            label: ar.sessions.periods[value],
          }))}
        />
        {classes.length > 1 ? (
          <ChipRow
            label={ar.sessions.filterClass}
            value={classId}
            onChange={setClassId}
            options={[
              { value: ALL, label: ar.sessions.allClasses },
              ...classes.map((c) => ({ value: c.id, label: c.groupName })),
            ]}
          />
        ) : null}
      </View>

      <Card>
        {emptyRange ? (
          <EmptyState icon="calendar" title={ar.sessions.empty[tab]} description={ar.sessions.emptyFiltered} />
        ) : (
          <QueryState
            query={pages}
            empty={items.length === 0}
            emptyIcon="calendar"
            emptyTitle={ar.sessions.empty[tab]}
            emptyDescription={filtered ? ar.sessions.emptyFiltered : tab === 'all' ? ar.sessions.emptyNoSessions : undefined}>
            <AppText variant="small" tone="muted">
              {ar.sessions.count(total)}
            </AppText>
            {days.map((day) => (
              <View key={day.date} style={styles.day}>
                <View style={[styles.dayHeader, { borderColor: colors.border }]}>
                  <AppText variant="label" accessibilityRole="header" style={styles.flex}>
                    {formatDateLong(day.date)}
                  </AppText>
                  {day.date === clock.today ? <Pill label={ar.teacher.today} tone="brand" /> : null}
                </View>
                {day.items.map((s, i) => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    today={clock.today}
                    showDate={false}
                    showProgress
                    bordered={i > 0}
                    onPress={() => router.push({ pathname: '/teacher/sessions/[id]', params: { id: s.id } })}
                  />
                ))}
              </View>
            ))}
            {pages.hasNextPage ? (
              <Button
                variant="outline"
                label={ar.sessions.loadMore}
                loading={pages.isFetchingNextPage}
                onPress={() => void pages.fetchNextPage()}
              />
            ) : null}
          </QueryState>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { gap: spacing.sm },
  day: { gap: 0 },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  flex: { flex: 1 },
});
