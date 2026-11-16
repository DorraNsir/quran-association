import { useFocusEffect, useRouter } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import {
  AppText,
  HeroHeader,
  Icon,
  InitialsAvatar,
  LinkButton,
  Pill,
  Screen,
  SectionCard,
  type IconName,
} from '@/components/ui';
import { LogoutButton, WorkspaceSwitcher } from '@/features/auth/account-components';
import { useSession } from '@/features/auth/auth-provider';
import { ar } from '@/i18n/ar';
import {
  formatCountOf,
  formatDateLong,
  formatPercent,
  ltr,
} from '@/i18n/format';
import { radius, spacing, useAppTheme } from '@/theme';

import { ClassCard } from './class-card';
import { SessionCard } from './session-card';
import type { MemorizationProgress } from './dashboard-model';
import type { AttendanceSummary } from './types';
import { useRefreshTeacherDashboard, useTeacherDashboard } from './use-teacher-dashboard';

const t = ar.teacher;

/**
 * «فضاء المعلم» — the teacher's day at a glance, read-only, from real
 * endpoints only (see use-teacher-dashboard.ts). Workflows (attendance,
 * memorization entry…) come in later phases.
 */
export function TeacherDashboard() {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const d = useTeacherDashboard(teacherId);
  const refresh = useRefreshTeacherDashboard(teacherId);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const theme = useAppTheme();

  // Light status bar over the green header, only while this screen is shown
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle(theme.dark ? 'light' : 'dark');
    }, [theme.dark]),
  );

  if (!user) return null;

  const onRefresh = () => {
    setRefreshing(true);
    void refresh().finally(() => setRefreshing(false));
  };
  const memoQueries = d.memorization;
  const memoRows = memoQueries.flatMap((q) => (q.data ? [q.data] : []));

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={onRefresh}
      edges={[]}
      hero={<HeroHeader title={ar.workspace.teacher} />}>
      {/* Welcome: name first, the platform date on its own line */}
      <View style={styles.welcome}>
        <InitialsAvatar name={`${user.person.firstName} ${user.person.lastName}`} size={52} />
        <View style={styles.flex}>
          <AppText variant="title" numberOfLines={1}>
            {t.welcome} {user.person.firstName}
          </AppText>
          <AppText variant="caption" tone="muted">
            {formatDateLong(d.clock.today)}
          </AppText>
        </View>
      </View>

      <QueryState query={[d.workspace, d.completedCount]}>
        <View style={styles.stats} accessibilityLabel={t.stats}>
          <StatTile label={t.myClasses} icon="classes" value={d.classes.length} />
          <StatTile
            label={t.myStudents}
            icon="students"
            value={d.classes.reduce((sum, c) => sum + c.activeStudents, 0)}
          />
          <StatTile label={t.completedSessions} icon="completed" value={d.completedCount.data ?? 0} />
        </View>
      </QueryState>

      <SectionCard
        title={t.todayTitle}
        icon="calendar"
        action={<LinkButton label={ar.sessions.seeAll} onPress={() => router.push('/teacher/sessions')} />}>
        <QueryState query={d.today}>
          {d.todayList.length > 0 ? (
            d.todayList.map((s, i) => (
              <SessionCard
                key={s.id}
                session={s}
                today={d.clock.today}
                showDate={false}
                showProgress
                bordered={i > 0}
                onPress={() => router.push({ pathname: '/teacher/sessions/[id]', params: { id: s.id } })}
              />
            ))
          ) : (
            <>
              <EmptyState icon="calendar" title={t.todayEmpty} />
              {d.nextSession ? (
                <View style={styles.column}>
                  <AppText variant="label" tone="muted">
                    {t.nextSession}
                  </AppText>
                  <SessionCard
                    session={d.nextSession}
                    today={d.clock.today}
                    bordered={false}
                    onPress={() =>
                      router.push({ pathname: '/teacher/sessions/[id]', params: { id: d.nextSession!.id } })
                    }
                  />
                </View>
              ) : null}
            </>
          )}
        </QueryState>
      </SectionCard>

      <SectionCard
        title={t.classesTitle}
        icon="students"
        action={
          d.classes.length > 0 ? (
            <LinkButton label={t.seeAllClasses} onPress={() => router.push('/teacher/classes')} />
          ) : undefined
        }>
        <QueryState
          query={d.workspace}
          empty={d.classes.length === 0}
          emptyIcon="classes"
          emptyTitle={t.classesEmpty}>
          {d.classes.map((c) => (
            <ClassCard
              key={c.id}
              item={c}
              onPress={() => router.push({ pathname: '/teacher/classes/[id]', params: { id: c.id } })}
            />
          ))}
        </QueryState>
      </SectionCard>

      <SectionCard
        title={t.attendanceTitle}
        icon="attendance"
        aside={d.year ? ltr(d.year.label) : t.allTime}>
        <QueryState
          query={d.attendance}
          empty={d.attendance.data?.recorded === 0}
          emptyIcon="attendance"
          emptyTitle={t.attendanceEmpty}>
          {d.attendance.data ? <AttendanceStats summary={d.attendance.data} /> : null}
        </QueryState>
      </SectionCard>

      <SectionCard
        title={t.memorizationTitle}
        icon="classes"
        //aside={d.year && d.semester ? `${ltr(d.year.label)} · ${ar.labels.semester[d.semester]}` : undefined}
        action={
          d.year && d.classes.length > 0 ? (
            <LinkButton label={ar.memorization.open} onPress={() => router.push('/teacher/memorization')} />
          ) : undefined
        }>
        {!d.year ? (
          <EmptyState icon="classes" title={t.memorizationNoYear} />
        ) : (
          <QueryState
            query={[d.workspace, ...memoQueries]}
            empty={d.classes.length === 0}
            emptyIcon="classes"
            emptyTitle={t.classesEmpty}>
            {memoRows.map((m) => (
              <MemorizationRow
                key={m.groupClassId}
                item={m}
                onPress={() => router.push({ pathname: '/teacher/memorization', params: { classId: m.groupClassId } })}
              />
            ))}
          </QueryState>
        )}
      </SectionCard>

      <ToolsCard onOpen={(path) => router.push(path)} />

      <WorkspaceSwitcher current="teacher" />
      <LogoutButton />
    </Screen>
  );
}

/* ------------------------------- building blocks ------------------------------- */

function StatTile({ label, icon, value }: { label: string; icon: IconName; value: number }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[styles.stat, { backgroundColor: colors.brandSoft, borderColor: colors.border }]}
      accessible
      accessibilityLabel={`${label}: ${value}`}>
      <Icon name={icon} size={20} color={colors.primary} />
      <AppText variant="figure" style={[styles.number, { color: colors.brandSoftForeground }]}>
        {value}
      </AppText>
      <AppText variant="small" center numberOfLines={1} style={{ color: colors.brandSoftForeground }}>
        {label}
      </AppText>
    </View>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.miniStat} accessible accessibilityLabel={`${label}: ${value}`}>
      <View style={styles.miniHead}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <AppText variant="bodyStrong" style={styles.number}>
          {value}
        </AppText>
      </View>
      <AppText variant="small" tone="muted" numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}

/** «حضوري»: the API's numbers as-is (rate, attended / counted, per status). */
function AttendanceStats({ summary }: { summary: AttendanceSummary }) {
  const { colors } = useAppTheme();
  const rate = formatPercent(summary.rate);
  return (
    <View style={styles.column}>
      <View style={styles.rateRow}>
        <View style={styles.rateBlock} accessible accessibilityLabel={`${t.rate}: ${rate}`}>
          <AppText variant="figure" tone="primary">
            {rate}
          </AppText>
          <AppText variant="small" tone="muted">
            {t.rate}
          </AppText>
        </View>
        <View style={[styles.flex, styles.column]}>
          <ProgressBar ratio={summary.rate === null ? 0 : summary.rate / 100} />
          <AppText variant="caption" tone="muted">
            {t.attended} {formatCountOf(summary.attended, summary.eligible)} {t.countedSessions}
          </AppText>
        </View>
      </View>
      <View style={[styles.miniStats, { borderColor: colors.border }]}>
        <MiniStat label={t.present} value={summary.present} color={colors.primary} />
        <MiniStat label={t.late} value={summary.late} color={colors.warning} />
        <MiniStat label={t.absent} value={summary.absent} color={colors.destructive} />
        <MiniStat label={t.excused} value={summary.excused} color={colors.mutedForeground} />
      </View>
      <AppText variant="small" tone="muted">
        {t.attendanceHint}
      </AppText>
    </View>
  );
}

function ProgressBar({ ratio }: { ratio: number }) {
  const { colors } = useAppTheme();
  const width = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%` as const;
  return (
    <View style={[styles.bar, { backgroundColor: colors.muted }]} accessibilityElementsHidden>
      <View style={[styles.barFill, { backgroundColor: colors.primary, width }]} />
    </View>
  );
}

function MemorizationRow({ item: m, onPress }: { item: MemorizationProgress; onPress: () => void }) {
  const { colors } = useAppTheme();
  const left = m.total - m.recorded;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${ar.memorization.open}: ${m.groupName}، ${formatCountOf(m.recorded, m.total)}`}
      style={({ pressed }) => [styles.memo, { borderColor: colors.border }, pressed && { backgroundColor: colors.accent }]}>
      <View style={styles.titleRow}>
        <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>
          {m.groupName}
        </AppText>
        {left > 0 ? (
          <Pill label={t.memorizationMissing(left)} tone="warning" />
        ) : (
          <Pill label={t.memorizationComplete} tone="brand" />
        )}
      </View>
      <View style={styles.titleRow}>
        <View style={styles.flex}>
          <ProgressBar ratio={m.total ? m.recorded / m.total : 0} />
        </View>
        <AppText variant="small" tone="muted">
          {formatCountOf(m.recorded, m.total)}
        </AppText>
      </View>
    </Pressable>
  );
}

/** Modules that do not exist yet: listed so the roadmap is visible, clearly inactive. */
const COMING: { icon: IconName; label: string }[] = [
  { icon: 'resources', label: t.tools.resources },
  { icon: 'announcements', label: t.tools.announcements },
];

/** Teacher tools: working shortcuts first, then the clearly inactive roadmap (no fake buttons). */
function ToolsCard({ onOpen }: { onOpen: (path: '/teacher/schedule' | '/teacher/memorization' | '/teacher/notes' | '/teacher/work') => void }) {
  const { colors } = useAppTheme();
  const available: { icon: IconName; label: string; path: '/teacher/schedule' | '/teacher/memorization' | '/teacher/notes' | '/teacher/work' }[] = [
    { icon: 'calendar', label: ar.schedule.open, path: '/teacher/schedule' },
    { icon: 'classes', label: ar.memorization.open, path: '/teacher/memorization' },
    { icon: 'workFollowup', label: ar.work.open, path: '/teacher/work' },
    { icon: 'notes', label: ar.notes.open, path: '/teacher/notes' },
  ];
  return (
    <SectionCard title={t.toolsTitle} icon="workFollowup">
      <View style={styles.tools}>
        {available.map((tool) => (
          <Pressable
            key={tool.path}
            onPress={() => onOpen(tool.path)}
            accessibilityRole="link"
            accessibilityLabel={tool.label}
            style={({ pressed }) => [
              styles.toolLink,
              { backgroundColor: pressed ? colors.brandSoft : colors.card, borderColor: colors.primary },
            ]}>
            <Icon name={tool.icon} size={16} color={colors.primary} />
            <AppText variant="label" tone="primary">
              {tool.label}
            </AppText>
          </Pressable>
        ))}
      </View>
      <View style={styles.tools}>
        <Pill label={t.comingSoon} />
        {COMING.map((tool) => (
          <View
            key={tool.label}
            style={[styles.tool, { borderColor: colors.border }]}
            accessible
            accessibilityLabel={`${tool.label} — ${t.comingSoon}`}
            accessibilityState={{ disabled: true }}>
            <Icon name={tool.icon} size={14} color={colors.mutedForeground} />
            <AppText variant="small" tone="muted">
              {tool.label}
            </AppText>
          </View>
        ))}
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  column: { gap: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  welcome: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    minHeight: 104,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  number: { fontVariant: ['tabular-nums'] },
  session: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  dateBox: {
    width: 84,
    alignItems: 'center',
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  sessionBody: { flex: 1, gap: spacing.xs },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  rateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  rateBlock: { alignItems: 'center', minWidth: 72 },
  miniStats: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
  },
  miniStat: { flex: 1, alignItems: 'center', gap: 2 },
  miniHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 8, height: 8, borderRadius: radius.full },
  bar: { height: 8, borderRadius: radius.full, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radius.full },
  memo: {
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  toolLink: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
  },
  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
});
