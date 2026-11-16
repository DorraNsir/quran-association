import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { EmptyState, QueryState } from '@/components/feedback';
import { AppText, BottomSheet, Button, Card, ChipRow, Icon, OptionRow, Pill, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { formatDateLong } from '@/i18n/format';
import { radius, spacing, useAppTheme } from '@/theme';

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
  const [sheetOpen, setSheetOpen] = useState(false);

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
        <FilterBar
          total={pages.data ? total : null}
          active={[
            ...(period !== 'all'
              ? [{ key: 'period', label: ar.sessions.periods[period], clear: () => setPeriod('all') }]
              : []),
            ...(classId !== ALL
              ? [{ key: 'class', label: classes.find((c) => c.id === classId)?.groupName ?? '—', clear: () => setClassId(ALL) }]
              : []),
          ]}
          onOpen={() => setSheetOpen(true)}
          onReset={() => {
            setPeriod('all');
            setClassId(ALL);
          }}
        />
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

      <BottomSheet
        visible={sheetOpen}
        title={ar.sessions.filtersTitle}
        closeLabel={ar.sessions.closeFilters}
        onClose={() => setSheetOpen(false)}
        footer={
          <>
            <View style={styles.flex}>
              <Button
                variant="outline"
                label={ar.sessions.resetFilters}
                fullWidth
                disabled={!filtered}
                onPress={() => {
                  setPeriod('all');
                  setClassId(ALL);
                }}
              />
            </View>
            <View style={styles.flex}>
              <Button label={ar.sessions.done} fullWidth onPress={() => setSheetOpen(false)} />
            </View>
          </>
        }>
        <View style={styles.sheetGroup} accessibilityRole="radiogroup" accessibilityLabel={ar.sessions.filterPeriod}>
          <AppText variant="label">{ar.sessions.filterPeriod}</AppText>
          {PERIOD_PRESETS.filter((p) => p !== 'year' || year).map((value) => (
            <OptionRow
              key={value}
              label={ar.sessions.periods[value]}
              selected={period === value}
              onPress={() => setPeriod(value)}
            />
          ))}
        </View>
        {classes.length > 1 ? (
          <View style={styles.sheetGroup} accessibilityRole="radiogroup" accessibilityLabel={ar.sessions.filterClass}>
            <AppText variant="label">{ar.sessions.filterClass}</AppText>
            {[{ id: ALL, groupName: ar.sessions.allClasses }, ...classes].map((c) => (
              <OptionRow key={c.id} label={c.groupName} selected={classId === c.id} onPress={() => setClassId(c.id)} />
            ))}
          </View>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

/**
 * One compact line under the status tabs: «تصفية» (opens the sheet, shows
 * how many filters are on), each active filter as a removable chip, a reset
 * link, and the session count — instead of two extra rows of chips.
 */
function FilterBar({
  total,
  active,
  onOpen,
  onReset,
}: {
  total: number | null;
  active: { key: string; label: string; clear: () => void }[];
  onOpen: () => void;
  onReset: () => void;
}) {
  const { colors } = useAppTheme();
  const on = active.length > 0;
  return (
    <View style={styles.filterBar}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={on ? `${ar.sessions.filters}، ${ar.sessions.activeFilters(active.length)}` : ar.sessions.filters}
        style={({ pressed }) => [
          styles.filterButton,
          { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.brandSoft : colors.card },
          pressed && { opacity: 0.8 },
        ]}>
        <Icon name="filter" size={16} color={on ? colors.primary : colors.foreground} />
        <AppText variant="small" style={{ color: on ? colors.brandSoftForeground : colors.foreground }}>
          {ar.sessions.filters}
          {on ? ` (${active.length})` : ''}
        </AppText>
      </Pressable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.activeChips} style={styles.flex}>
        {active.map((f) => (
          <Pressable
            key={f.key}
            onPress={f.clear}
            accessibilityRole="button"
            accessibilityLabel={ar.sessions.removeFilter(f.label)}
            hitSlop={{ top: 6, bottom: 6 }}
            style={[styles.activeChip, { backgroundColor: colors.brandSoft }]}>
            <AppText variant="small" numberOfLines={1} style={{ color: colors.brandSoftForeground, maxWidth: 140 }}>
              {f.label}
            </AppText>
            <Icon name="close" size={12} color={colors.brandSoftForeground} />
          </Pressable>
        ))}
        {on ? (
          <Pressable onPress={onReset} accessibilityRole="button" accessibilityLabel={ar.sessions.resetFilters} hitSlop={8}>
            <AppText variant="small" tone="primary">
              {ar.sessions.resetFilters}
            </AppText>
          </Pressable>
        ) : null}
      </ScrollView>
      {total !== null ? (
        <AppText variant="small" tone="muted" accessibilityLiveRegion="polite">
          {ar.sessions.count(total)}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  filters: { gap: spacing.sm },
  filterBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  filterButton: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
  },
  activeChips: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  activeChip: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
  },
  sheetGroup: { gap: spacing.sm },
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
