import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import { AppText, BottomSheet, Button, Card, ChipRow, Icon, InitialsAvatar, OptionRow, PressableRow, Screen, type IconName } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { fontFamilies, radius, spacing, touchTarget, useAppTheme } from '@/theme';

import {
  overallRowText,
  programStatus,
  rowCycleText,
  workloadSections,
  WORKLOAD_ORDER,
  workTypesSummary,
  type ProgramStatusKind,
} from '../quran-reference/work-assignment';
import { teacherClasses } from './dashboard-model';
import { useTeacherWorkspace } from './use-teacher-dashboard';
import { usePullToRefresh } from './use-refresh';
import { useWorkProgramPages, useWorkSessionOptions, workKey } from './use-work';
import { phaseOf, sessionDay, studentName } from './work-model';
import type { WorkPeriod, WorkProgram, WorkProgramFilters, WorkProgramState } from './work-types';

const w = ar.work;
const ALL = 'ALL';
type Order = 'original' | 'workload';
const STATUS_ICON: Record<ProgramStatusKind, IconName> = {
  pending: 'pending',
  partial: 'partial',
  unfinished: 'partial',
  done: 'success',
  cancelled: 'ban',
};
const STATES: readonly WorkProgramState[] = ['pending', 'unfinished', 'cancelled', 'done'];

/** Typing pauses this long before the (server-side) student search is sent. */
export const SEARCH_DELAY_MS = 400;

/**
 * «متابعة برنامج العمل»: the work programs of MY sessions (GET
 * /teacher/work-programs — the server keeps only sessions of my team snapshot
 * and, in shared sessions, students of classes I manage there), filtered and
 * paginated ON THE SERVER as on the web: period, program state, class,
 * session, student name. One compact row per student × session.
 * «ترتيب حسب البرنامج»: on request, for one chosen session — the server orders
 * the whole session (advisory, never a rank); the choice holds across pages
 * and refreshes until «الترتيب الأصلي» or another session.
 */
export function TeacherWorkScreen({ initialClassId, studentId }: { initialClassId?: string; studentId?: string }) {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const router = useRouter();
  const { colors } = useAppTheme();
  const timeZone = usePreferences().data?.timezone;
  const workspace = useTeacherWorkspace(teacherId);
  const classes = workspace.data ? teacherClasses(workspace.data) : [];
  const student = studentId ? workspace.data?.students.find((s) => s.id === studentId) : undefined;

  const [period, setPeriod] = useState<WorkPeriod | typeof ALL>(ALL);
  const [state, setState] = useState<WorkProgramState | typeof ALL>(ALL);
  const [classId, setClassIdRaw] = useState<string>(initialClassId ?? ALL);
  const [sessionId, setSessionIdRaw] = useState<string>(ALL);
  const [order, setOrder] = useState<Order>('original');
  const [sessionsOpen, setSessionsOpen] = useState(false);
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
  const sessionText = (s: (typeof sessions)[number]) => `${s.groupName} · ${sessionDay(s)} · ${s.startTime}`;
  const filtered = Object.keys(filters).some((k) => k !== 'order');
  const pages = useWorkProgramPages(teacherId, filters);
  const { refreshing, onRefresh } = usePullToRefresh([workKey(teacherId)]);
  const programs = pages.data?.pages.flatMap((p) => p.data) ?? [];
  const total = pages.data?.pages[0]?.meta.total ?? 0;

  const reset = () => {
    setPeriod(ALL);
    setState(ALL);
    setClassId(ALL);
    setStudentOnly(false);
    setOrder('original');
    setText('');
    setQ('');
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <AppText variant="small" tone="muted">
        {w.intro}
      </AppText>
      <Button
        label={w.add}
        icon="add"
        fullWidth
        onPress={() => router.push({ pathname: '/teacher/work/new', params: studentOnly && studentId ? { studentId } : {} })}
      />

      <View style={styles.filters}>
        <ChipRow
          label={w.pickPeriod}
          value={period}
          onChange={setPeriod}
          options={[
            { value: ALL, label: w.period.all },
            { value: 'upcoming', label: w.period.upcoming },
            { value: 'past', label: w.period.past },
          ]}
        />
        <ChipRow
          label={w.pickState}
          value={state}
          onChange={setState}
          options={[{ value: ALL, label: w.allStates }, ...STATES.map((s) => ({ value: s, label: w.state[s] }))]}
        />
        {classes.length > 1 ? (
          <ChipRow
            label={w.pickClass}
            value={classId}
            onChange={setClassId}
            options={[{ value: ALL, label: w.allClasses }, ...classes.map((c) => ({ value: c.id, label: c.groupName }))]}
          />
        ) : null}
        <Pressable
          onPress={() => setSessionsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={`${w.sessionFilter}: ${chosenSession ? sessionText(chosenSession) : w.allSessions}`}
          style={[styles.picker, { borderColor: colors.input, backgroundColor: colors.card }]}>
          <Icon name="calendar" size={16} color={colors.mutedForeground} />
          <AppText variant="body" numberOfLines={1} style={styles.flex}>
            {chosenSession ? sessionText(chosenSession) : w.allSessions}
          </AppText>
          <Icon name="forward" size={16} color={colors.mutedForeground} />
        </Pressable>
        <BottomSheet visible={sessionsOpen} title={w.sessionFilter} closeLabel={w.closeSessions} onClose={() => setSessionsOpen(false)}>
          {[{ id: ALL, label: w.allSessions }, ...sessions.map((s) => ({ id: s.id, label: sessionText(s) }))].map((o) => (
            <OptionRow
              key={o.id}
              label={o.label}
              selected={o.id === sessionId}
              onPress={() => {
                setSessionId(o.id);
                setSessionsOpen(false);
              }}
            />
          ))}
        </BottomSheet>
        {sessionId !== ALL ? (
          <ChipRow
            label={w.pickOrder}
            value={ordered ? 'workload' : 'original'}
            onChange={(v: Order) => setOrder(v)}
            options={[
              { value: 'original', label: WORKLOAD_ORDER.original },
              { value: 'workload', label: WORKLOAD_ORDER.workload },
            ]}
          />
        ) : (
          <AppText variant="caption" tone="muted">
            {WORKLOAD_ORDER.needsSession}
          </AppText>
        )}
        {ordered ? (
          <View style={styles.note} accessibilityLiveRegion="polite">
            <Icon name="info" size={14} color={colors.mutedForeground} />
            <AppText variant="caption" tone="muted" style={styles.flex}>
              <AppText variant="caption">{WORKLOAD_ORDER.active}</AppText> — {WORKLOAD_ORDER.explanation}
            </AppText>
          </View>
        ) : null}
        {studentOnly && studentId ? (
          <View style={styles.inline}>
            <AppText variant="small" style={styles.flex}>
              {w.studentFilter(student ? `${student.firstName} ${student.lastName}` : '…')}
            </AppText>
            <Button variant="ghost" label={w.clearStudent} onPress={() => setStudentOnly(false)} />
          </View>
        ) : (
          <View style={[styles.search, { borderColor: colors.input, backgroundColor: colors.card }]}>
            <Icon name="search" size={16} color={colors.mutedForeground} />
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
      </View>

      <QueryState query={pages}>
        <AppText variant="small" tone="muted" accessibilityLiveRegion="polite">
          {w.total(total)}
        </AppText>
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
            <Card key={section.key} style={styles.section}>
              {section.label ? (
                <AppText variant="caption" tone="muted" testID={`section-${section.kind}`} style={styles.sectionLabel}>
                  {section.label}
                  {section.hint ? ` — ${section.hint}` : ''}
                </AppText>
              ) : null}
              {section.programs.map((p, i) => (
                <ProgramRow
                  key={p.id}
                  program={p}
                  bordered={i > 0 || Boolean(section.label)}
                  showSession={sessionId === ALL}
                  timeZone={timeZone}
                  onPress={() => router.push({ pathname: '/teacher/work/[id]', params: { id: p.id } })}
                />
              ))}
            </Card>
          ))
        )}
        {pages.hasNextPage ? (
          <Button
            variant="outline"
            label={w.loadMore}
            loading={pages.isFetchingNextPage}
            onPress={() => void pages.fetchNextPage()}
          />
        ) : null}
      </QueryState>
    </Screen>
  );
}

/**
 * ONE student + ONE session as one compact row: photo (or initial), name, class (+ the session
 * unless one session is chosen), the kinds of work and the evaluation state — icon and words.
 * The whole row opens that program; everything else is on its screen.
 */
function ProgramRow({
  program: p,
  bordered,
  showSession,
  timeZone,
  onPress,
}: {
  program: WorkProgram;
  bordered: boolean;
  showSession: boolean;
  timeZone: string | undefined;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  const name = studentName(p);
  const status = programStatus(p.progress);
  const types = workTypesSummary(p.items.map((i) => i.type));
  const cycles = rowCycleText(p.items);
  const overall = overallRowText(p.overallEvaluation?.level);
  const context = showSession ? `${p.session.groupName} · ${sessionDay(p.session)} · ${w.phase[phaseOf(p.session, timeZone)]}` : p.session.groupName;
  const tone = status.kind === 'done' ? colors.primary : status.kind === 'pending' || status.kind === 'cancelled' ? colors.mutedForeground : colors.warning;
  return (
    <PressableRow
      bordered={bordered}
      onPress={onPress}
      accessibilityLabel={`${w.detailTitle} ${name} — ${context} — ${types} — ${status.text}${overall ? ` — ${overall}` : ''}${cycles ? ` — ${cycles}` : ''}`}>
      <View style={styles.row} testID={`program-${p.id}`}>
        <InitialsAvatar name={name} size={44} photoUrl={p.student.photoUrl} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {name}
          </AppText>
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {context}
          </AppText>
          <View style={styles.meta}>
            {types ? (
              <AppText variant="small" numberOfLines={1}>
                {types}
              </AppText>
            ) : null}
            <View style={styles.inline}>
              <Icon name={STATUS_ICON[status.kind]} size={14} color={tone} />
              <AppText variant="small" style={{ color: tone }} testID={`status-${status.kind}`}>
                {status.text}
              </AppText>
            </View>
            {/* «التقييم العام»: only once given; next to the items' state, never instead of it */}
            {overall ? (
              <View style={[styles.overall, { backgroundColor: colors.brandSoft }]}>
                <Icon name="success" size={12} color={colors.brandSoftForeground} />
                <AppText variant="caption" style={{ color: colors.brandSoftForeground }} testID="row-overall">
                  {overall}
                </AppText>
              </View>
            ) : null}
          </View>
          {/* «متابعة العرضات»: tracked recitations only, one line */}
          {cycles ? (
            <View style={styles.inline}>
              <Icon name="revision" size={12} color={colors.primary} />
              <AppText variant="caption" tone="muted" numberOfLines={1} style={styles.flex} testID="row-cycles">
                {cycles}
              </AppText>
            </View>
          ) : null}
        </View>
      </View>
    </PressableRow>
  );
}

const styles = StyleSheet.create({
  filters: { gap: spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  search: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, minHeight: touchTarget, fontFamily: fontFamilies.regular, fontSize: 15, textAlign: 'right', writingDirection: 'rtl' },
  picker: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  overall: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.md, paddingHorizontal: 6, paddingVertical: 1 },
  section: { paddingVertical: 0, gap: 0 },
  sectionLabel: { paddingTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: spacing.md, rowGap: 2 },
  flex: { flex: 1, minWidth: 0 },
});
