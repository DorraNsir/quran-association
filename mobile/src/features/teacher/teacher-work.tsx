import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import { AppText, Button, Card, ChipRow, Icon, InitialsAvatar, PressableRow, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { fontFamilies, radius, spacing, touchTarget, useAppTheme } from '@/theme';

import { teacherClasses } from './dashboard-model';
import { useTeacherWorkspace } from './use-teacher-dashboard';
import { usePullToRefresh } from './use-refresh';
import { useWorkProgramPages, workKey } from './use-work';
import { WorkProgressView, WorkSessionLine, WorkStatusBadge, WorkTypeBadge } from './work-badges';
import { phaseOf, studentName } from './work-model';
import type { WorkPeriod, WorkProgram, WorkProgramFilters, WorkProgramState } from './work-types';
import { WorkAssignmentView } from './work-assignment-view';

const w = ar.work;
const ALL = 'ALL';
const PREVIEW = 2;
const STATES: readonly WorkProgramState[] = ['pending', 'unfinished', 'cancelled', 'done'];

/** Typing pauses this long before the (server-side) student search is sent. */
export const SEARCH_DELAY_MS = 400;

/**
 * «متابعة برنامج العمل»: the work programs of MY sessions (GET
 * /teacher/work-programs — the server keeps only sessions of my team snapshot
 * and, in shared sessions, students of classes I manage there), filtered and
 * paginated ON THE SERVER as on the web: period, program state, class,
 * student name. One compact card per student × session.
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
  const [classId, setClassId] = useState<string>(initialClassId ?? ALL);
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
  };
  const filtered = Object.keys(filters).length > 0;
  const pages = useWorkProgramPages(teacherId, filters);
  const { refreshing, onRefresh } = usePullToRefresh([workKey(teacherId)]);
  const programs = pages.data?.pages.flatMap((p) => p.data) ?? [];
  const total = pages.data?.pages[0]?.meta.total ?? 0;

  const reset = () => {
    setPeriod(ALL);
    setState(ALL);
    setClassId(ALL);
    setStudentOnly(false);
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
          programs.map((p) => (
            <ProgramCard
              key={p.id}
              program={p}
              timeZone={timeZone}
              onPress={() => router.push({ pathname: '/teacher/work/[id]', params: { id: p.id } })}
            />
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

/** ONE student + ONE session: who, when, the server's progress and the first two items. */
function ProgramCard({ program: p, timeZone, onPress }: { program: WorkProgram; timeZone: string | undefined; onPress: () => void }) {
  const { colors } = useAppTheme();
  const name = studentName(p);
  const more = p.items.length - PREVIEW;
  return (
    <Card style={styles.card}>
      <PressableRow bordered={false} onPress={onPress} accessibilityLabel={`${w.detailTitle} ${name} — ${p.session.groupName}، ${p.session.date}`}>
        <View style={styles.head}>
          <InitialsAvatar name={name} size={40} photoUrl={p.student.photoUrl} />
          <View style={styles.flex}>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {name}
            </AppText>
            <AppText variant="small" tone="muted" numberOfLines={1}>
              {p.session.groupName} — {p.session.branchName}
            </AppText>
          </View>
        </View>
        <WorkSessionLine session={p.session} phase={phaseOf(p.session, timeZone)} />
        <WorkProgressView progress={p.progress} />
        {p.items.slice(0, PREVIEW).map((item) => (
          <View key={item.id} style={[styles.item, { borderColor: colors.border }]}>
            <WorkTypeBadge type={item.type} recitationNumber={item.recitationNumber} />
            {item.assignment ? (
              <View style={styles.flex}>
                <WorkAssignmentView type={item.type} assignment={item.assignment} workload={item.workload} compact />
              </View>
            ) : (
              <AppText variant="small" numberOfLines={2} style={styles.flex}>
                {item.description}
              </AppText>
            )}
            <WorkStatusBadge status={item.status} />
          </View>
        ))}
        {more > 0 ? (
          <AppText variant="small" tone="muted">
            {w.more(more)}
          </AppText>
        ) : null}
        {p.lastEditedBy ? (
          <AppText variant="small" tone="muted" numberOfLines={1}>
            {w.lastEditedBy(p.lastEditedBy)}
          </AppText>
        ) : null}
      </PressableRow>
    </Card>
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
  card: { paddingVertical: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: spacing.xs },
  flex: { flex: 1 },
});
