import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import { AppText, BottomSheet, Button, Card, Icon, OptionRow, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { ar } from '@/i18n/ar';
import { fontFamilies, radius, spacing, touchTarget, useAppTheme } from '@/theme';

import { workloadSections, WORKLOAD_ORDER } from '../quran-reference/work-assignment';
import { teacherClasses } from './dashboard-model';
import { useTeacherWorkspace } from './use-teacher-dashboard';
import { usePullToRefresh } from './use-refresh';
import { useWorkProgramPages, useWorkSessionOptions, workKey } from './use-work';
import { sessionDay } from './work-model';
import { WorkProgramCard } from './work-program-card';
import type { WorkPeriod, WorkProgramFilters, WorkProgramState, WorkSession } from './work-types';

const w = ar.work;
const ALL = 'ALL';
type Order = 'original' | 'workload';
const STATES: readonly WorkProgramState[] = ['pending', 'unfinished', 'cancelled', 'done'];

/** Typing pauses this long before the (server-side) student search is sent. */
export const SEARCH_DELAY_MS = 400;

/** «الأحد 15 نوفمبر 2026 · 17:00 · مجموعة الأمل» — the full date, never shortened. */
const sessionText = (s: WorkSession) => `${sessionDay(s)} · ${s.startTime} · ${s.groupName}`;

/**
 * «متابعة برنامج العمل»: the work programs of MY sessions (GET /teacher/work-programs — the server
 * keeps only sessions of my team snapshot and, in shared sessions, students of classes I manage
 * there), filtered and paginated ON THE SERVER as on the web.
 *
 * Layout, from the top: «+ إضافة» in the header · search + «تصفية» (period, state, class in one
 * sheet, applied together) · the session + «الترتيب» · a short summary of the active filters and
 * the count · one card per program. «ترتيب حسب البرنامج» is offered for one chosen session only
 * (the server orders the whole session; advisory, never a rank) and is reset when the session
 * changes.
 */
export function TeacherWorkScreen({ initialClassId, studentId }: { initialClassId?: string; studentId?: string }) {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const router = useRouter();
  const { colors } = useAppTheme();
  const workspace = useTeacherWorkspace(teacherId);
  const classes = workspace.data ? teacherClasses(workspace.data) : [];
  const student = studentId ? workspace.data?.students.find((s) => s.id === studentId) : undefined;

  const [period, setPeriod] = useState<WorkPeriod | typeof ALL>(ALL);
  const [state, setState] = useState<WorkProgramState | typeof ALL>(ALL);
  const [classId, setClassIdRaw] = useState<string>(initialClassId ?? ALL);
  const [sessionId, setSessionIdRaw] = useState<string>(ALL);
  const [order, setOrder] = useState<Order>('original');
  const [sheet, setSheet] = useState<'filters' | 'sessions' | 'order' | null>(null);
  const sessionOptions = useWorkSessionOptions(teacherId);
  // Another session (or class) is never reordered without being asked
  const setSessionId = (v: string) => {
    setSessionIdRaw(v);
    setOrder('original');
  };
  const setClassId = (v: string) => {
    setClassIdRaw(v);
    setSessionId(ALL);
  };
  const [studentOnly, setStudentOnly] = useState(Boolean(studentId));
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    // Nothing typed since the last search: no timer (no needless update)
    if (text.trim() === q) return;
    const t = setTimeout(() => setQ(text.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [text, q]);

  const filters: WorkProgramFilters = {
    ...(q ? { q } : {}),
    ...(studentOnly && studentId ? { studentId } : {}),
    ...(classId !== ALL ? { groupClassId: classId } : {}),
    ...(period !== ALL ? { period } : {}),
    ...(state !== ALL ? { state } : {}),
    ...(sessionId !== ALL ? { sessionId } : {}),
    ...(sessionId !== ALL && order === 'workload' ? { order: 'workload' as const } : {}),
  };
  const ordered = filters.order === 'workload';
  const sessions = (sessionOptions.data ?? []).filter((s) => classId === ALL || s.groupClassId === classId);
  const chosenSession = sessions.find((s) => s.id === sessionId);
  const filtered = Object.keys(filters).some((k) => k !== 'order');
  const pages = useWorkProgramPages(teacherId, filters);
  const { refreshing, onRefresh } = usePullToRefresh([workKey(teacherId)]);
  const programs = pages.data?.pages.flatMap((p) => p.data) ?? [];
  const total = pages.data?.pages[0]?.meta.total ?? 0;

  // The sheet's filters, applied together
  const activeCount = [period !== ALL, state !== ALL, classId !== ALL].filter(Boolean).length;
  const summary = [
    period !== ALL ? w.period[period] : null,
    state !== ALL ? w.state[state] : null,
    classId !== ALL ? classes.find((c) => c.id === classId)?.groupName : null,
  ].filter(Boolean);

  const reset = () => {
    setPeriod(ALL);
    setState(ALL);
    setClassId(ALL);
    setStudentOnly(false);
    setOrder('original');
    setText('');
    setQ('');
  };
  const add = () => router.push({ pathname: '/teacher/work/new', params: studentOnly && studentId ? { studentId } : {} });

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={add}
              accessibilityRole="button"
              accessibilityLabel={w.add}
              hitSlop={8}
              style={[styles.addButton, { backgroundColor: colors.primary }]}>
              <Icon name="add" size={16} color={colors.primaryForeground} />
              <AppText variant="label" style={{ color: colors.primaryForeground }}>
                {w.addShort}
              </AppText>
            </Pressable>
          ),
        }}
      />

      {/* Search + «تصفية» */}
      <View style={styles.toolbar}>
        {studentOnly && studentId ? (
          <View style={[styles.field, styles.flex, { borderColor: colors.input, backgroundColor: colors.card }]}>
            <Icon name="user" size={16} color={colors.mutedForeground} />
            <AppText variant="small" numberOfLines={1} style={styles.flex}>
              {w.studentFilter(student ? `${student.firstName} ${student.lastName}` : '…')}
            </AppText>
            <Pressable onPress={() => setStudentOnly(false)} accessibilityRole="button" accessibilityLabel={w.clearStudent} hitSlop={8}>
              <Icon name="close" size={16} color={colors.mutedForeground} />
            </Pressable>
          </View>
        ) : (
          <View style={[styles.field, styles.flex, { borderColor: colors.input, backgroundColor: colors.card }]}>
            <Icon name="search" size={18} color={colors.mutedForeground} />
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={w.search}
              placeholderTextColor={colors.mutedForeground}
              accessibilityLabel={w.searchLabel}
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={() => setQ(text.trim())}
              style={[styles.searchInput, { color: colors.foreground }]}
            />
            {text ? (
              <Pressable onPress={() => setText('')} accessibilityRole="button" accessibilityLabel={w.clearSearch} hitSlop={8}>
                <Icon name="close" size={16} color={colors.mutedForeground} />
              </Pressable>
            ) : null}
          </View>
        )}
        <ToolButton
          icon="filter"
          label={w.filter}
          count={activeCount}
          accessibilityLabel={activeCount ? w.filtersActive(activeCount) : w.filter}
          onPress={() => setSheet('filters')}
        />
      </View>

      {/* The session (full date) + «الترتيب» */}
      <View style={styles.toolbar}>
        <Pressable
          onPress={() => setSheet('sessions')}
          accessibilityRole="button"
          accessibilityLabel={`${w.sessionFilter}: ${chosenSession ? sessionText(chosenSession) : w.allSessions}`}
          style={[styles.field, styles.flex, { borderColor: chosenSession ? colors.primary : colors.input, backgroundColor: colors.card }]}>
          <Icon name="calendar" size={16} color={chosenSession ? colors.primary : colors.mutedForeground} />
          <AppText variant="small" numberOfLines={1} style={styles.flex}>
            {chosenSession ? sessionText(chosenSession) : w.allSessions}
          </AppText>
          {chosenSession ? (
            <Pressable onPress={() => setSessionId(ALL)} accessibilityRole="button" accessibilityLabel={w.clearSession} hitSlop={8}>
              <Icon name="close" size={16} color={colors.mutedForeground} />
            </Pressable>
          ) : (
            <Icon name="forward" size={14} color={colors.mutedForeground} />
          )}
        </Pressable>
        <ToolButton
          icon="sort"
          label={w.sort}
          active={ordered}
          accessibilityLabel={`${w.sort}: ${ordered ? WORKLOAD_ORDER.workload : WORKLOAD_ORDER.original}`}
          onPress={() => setSheet('order')}
        />
      </View>

      <QueryState query={pages}>
        <View style={styles.meta}>
          <AppText variant="small" tone="muted" accessibilityLiveRegion="polite">
            {w.total(total)}
            {summary.length ? ` · ${summary.join(' · ')}` : ''}
          </AppText>
          {ordered ? (
            <AppText variant="caption" tone="primary" testID="order-active">
              {WORKLOAD_ORDER.active}
            </AppText>
          ) : null}
        </View>
        {programs.length === 0 ? (
          <Card>
            {filtered ? (
              <EmptyState
                icon="search"
                title={w.noMatch}
                description={w.noMatchHint}
                action={<Button variant="outline" label={w.resetFilters} onPress={reset} />}
              />
            ) : (
              <EmptyState icon="workFollowup" title={w.empty} description={w.emptyHint} />
            )}
          </Card>
        ) : (
          workloadSections(programs, ordered).map((section) => (
            <View key={section.key} style={styles.section}>
              {section.label ? (
                <AppText variant="caption" tone="muted" testID={`section-${section.kind}`}>
                  {section.label}
                  {section.hint ? ` — ${section.hint}` : ''}
                </AppText>
              ) : null}
              {section.programs.map((p) => (
                <WorkProgramCard key={p.id} program={p} onPress={() => router.push({ pathname: '/teacher/work/[id]', params: { id: p.id } })} />
              ))}
            </View>
          ))
        )}
        {pages.hasNextPage ? (
          <Button variant="outline" label={w.loadMore} loading={pages.isFetchingNextPage} onPress={() => void pages.fetchNextPage()} />
        ) : null}
      </QueryState>

      {/* Mounted while open: each opening starts from the applied filters */}
      {sheet === 'filters' ? (
        <FiltersSheet
          onClose={() => setSheet(null)}
          classes={classes.map((c) => ({ id: c.id, label: c.groupName }))}
          value={{ period, state, classId }}
          onApply={(v) => {
            setPeriod(v.period);
            setState(v.state);
            if (v.classId !== classId) setClassId(v.classId);
            setSheet(null);
          }}
        />
      ) : null}

      <BottomSheet visible={sheet === 'sessions'} title={w.sessionFilter} closeLabel={w.closeSessions} onClose={() => setSheet(null)}>
        {[{ id: ALL, label: w.allSessions }, ...sessions.map((s) => ({ id: s.id, label: sessionText(s) }))].map((o) => (
          <OptionRow
            key={o.id}
            label={o.label}
            selected={o.id === sessionId}
            onPress={() => {
              setSessionId(o.id);
              setSheet(null);
            }}
          />
        ))}
      </BottomSheet>

      <BottomSheet visible={sheet === 'order'} title={w.sortTitle} closeLabel={w.closePicker} onClose={() => setSheet(null)}>
        <View accessibilityRole="radiogroup" accessibilityLabel={w.pickOrder} style={styles.options}>
          <OptionRow
            label={WORKLOAD_ORDER.original}
            selected={!ordered}
            onPress={() => {
              setOrder('original');
              setSheet(null);
            }}
          />
          {/* «ترتيب حسب البرنامج»: for one chosen session only */}
          {sessionId !== ALL ? (
            <OptionRow
              label={WORKLOAD_ORDER.workload}
              selected={ordered}
              onPress={() => {
                setOrder('workload');
                setSheet(null);
              }}
            />
          ) : null}
        </View>
        <AppText variant="small" tone="muted">
          {sessionId !== ALL ? WORKLOAD_ORDER.explanation : WORKLOAD_ORDER.needsSession}
        </AppText>
      </BottomSheet>
    </Screen>
  );
}

/** A compact toolbar button: icon + label (+ the number of active filters, or an active state). */
function ToolButton({
  icon,
  label,
  count = 0,
  active = false,
  accessibilityLabel,
  onPress,
}: {
  icon: 'filter' | 'sort';
  label: string;
  count?: number;
  active?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const on = active || count > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.tool,
        { backgroundColor: on ? colors.brandSoft : colors.card, borderColor: on ? colors.primary : colors.input },
        pressed && { opacity: 0.85 },
      ]}>
      <Icon name={icon} size={16} color={on ? colors.brandSoftForeground : colors.foreground} />
      <AppText variant="label" style={{ color: on ? colors.brandSoftForeground : colors.foreground }}>
        {label}
      </AppText>
      {count > 0 ? (
        <View style={[styles.count, { backgroundColor: colors.primary }]}>
          <AppText variant="caption" style={{ color: colors.primaryForeground }} testID="filters-count">
            {count}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

type SheetFilters = { period: WorkPeriod | typeof ALL; state: WorkProgramState | typeof ALL; classId: string };

/** «تصفية البرامج»: period, state and class as labelled choices, applied together. */
function FiltersSheet({
  onClose,
  classes,
  value,
  onApply,
}: {
  onClose: () => void;
  classes: { id: string; label: string }[];
  value: SheetFilters;
  onApply: (v: SheetFilters) => void;
}) {
  const [draft, setDraft] = useState<SheetFilters>(value);
  const section = <K extends keyof SheetFilters>(key: K, title: string, options: { value: SheetFilters[K]; label: string }[]) => (
    <View accessibilityRole="radiogroup" accessibilityLabel={title} style={styles.options}>
      <AppText variant="label" accessibilityRole="header">
        {title}
      </AppText>
      {options.map((o) => (
        <OptionRow key={String(o.value)} label={o.label} selected={draft[key] === o.value} onPress={() => setDraft({ ...draft, [key]: o.value })} />
      ))}
    </View>
  );
  return (
    <BottomSheet
      visible
      title={w.filtersTitle}
      closeLabel={w.closePicker}
      onClose={onClose}
      footer={
        <>
          <View style={styles.flex}>
            <Button label={w.applyFilters} fullWidth onPress={() => onApply(draft)} />
          </View>
          <Button variant="ghost" label={w.resetShort} onPress={() => setDraft({ period: ALL, state: ALL, classId: ALL })} />
        </>
      }>
      {section('period', w.pickPeriod, [
        { value: ALL, label: w.period.all },
        { value: 'upcoming', label: w.period.upcoming },
        { value: 'past', label: w.period.past },
      ])}
      {section('state', w.pickState, [{ value: ALL, label: w.allStates }, ...STATES.map((s) => ({ value: s, label: w.state[s] }))])}
      {classes.length > 1
        ? section('classId', w.pickClass, [{ value: ALL, label: w.allClasses }, ...classes.map((c) => ({ value: c.id, label: c.label }))])
        : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  field: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, minHeight: touchTarget, fontFamily: fontFamilies.regular, fontSize: 15, textAlign: 'right', writingDirection: 'rtl' },
  tool: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
  },
  count: { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    minHeight: 34,
  },
  meta: { gap: 2 },
  section: { gap: spacing.sm },
  options: { gap: spacing.xs },
  flex: { flex: 1, minWidth: 0 },
});
