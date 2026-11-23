import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import { AppText, Button, Card, ChipRow, Icon, InitialsAvatar, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { formatDate } from '@/i18n/format';
import { fontFamilies, radius, spacing, touchTarget, useAppTheme } from '@/theme';

import {
  ayahCount,
  nextRecitationText,
  postponedTimes,
  recitationsCount,
  recitationTitle,
  type RecitationColumn,
} from '../quran-reference/work-assignment';
import { normalizeArabic, SURAHS } from '../quran/surahs';
import { platformClock } from './dashboard-model';
import { tabQuery } from './sessions-model';
import { StudentPickerSheet, studentOptions } from './student-picker-sheet';
import { useTeacherWorkspace } from './use-teacher-dashboard';
import { usePullToRefresh } from './use-refresh';
import { useTeacherSessionPages } from './use-teacher-sessions';
import { useRecitationHistory, workKey } from './use-work';
import { RECITATION_STATE_LOOK } from './work-look';
import { RECITATION_STATE_SHORT, RECITATION_STATES, recitationState, type RecitationState } from './work-model';
import type { RecitationAttempt, RecitationSurahHistory } from './work-types';

const w = ar.work;

/** One history entry as a row (no grouping: each postponement stays visible on its own date). */
const asRow = (e: RecitationAttempt): RecitationColumn<RecitationAttempt> => ({ key: e.itemId, number: e.number, result: e, earlier: [] });
type Scope = 'history' | 'all';

interface SurahRow {
  surah: number;
  name: string;
  history: RecitationSurahHistory | null;
  columns: RecitationColumn<RecitationAttempt>[];
}

/**
 * «متابعة العرضات» — the module (teachers): one of MY students (photo, searchable by class), then
 * one expandable card per surah — those with recitations, or all 114 — collapsed: the surah and
 * «3 عرضات»; open: its history in chronological order, one row per entry — its number, result
 * (or «مجدولة» / «بانتظار التقييم») and session date, opening its program. The numbers are the
 * server's: they follow the chronology, and a postponed entry («لا تحتسب») shows the number of
 * the recitation that continues it. Values from GET /teacher/students/:id/recitations (one student; the API checks access);
 * «إضافة عرضة» opens the usual Work Program form, prefilled.
 */
export function TeacherRecitationsScreen({ initialStudentId, initialSurah }: { initialStudentId?: string; initialSurah?: number }) {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const router = useRouter();
  const { colors } = useAppTheme();
  const workspace = useTeacherWorkspace(teacherId);
  const groups = useMemo(() => (workspace.data ? studentOptions(workspace.data) : []), [workspace.data]);
  const all = groups.flatMap((g) => g.students.map((s) => ({ ...s, classLabel: g.label })));
  const [studentId, setStudentId] = useState(initialStudentId ?? '');
  const [picking, setPicking] = useState(false);
  const student = all.find((s) => s.id === studentId) ?? null;
  const { refreshing, onRefresh } = usePullToRefresh([[...workKey(teacherId), 'recitations', studentId]]);

  const addRecitation = (surah?: number) =>
    student && router.push({ pathname: '/teacher/work/new', params: surah ? { studentId: student.id, surah: String(surah) } : { studentId: student.id } });

  const footer = student ? (
    <View style={[styles.footer, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Button icon="add" label={w.addRecitation} fullWidth onPress={() => addRecitation()} />
    </View>
  ) : undefined;

  return (
    <Screen footer={footer} refreshing={refreshing} onRefresh={student ? onRefresh : undefined}>
      <Stack.Screen options={{ title: w.recitations }} />
      <QueryState query={workspace}>
        <Pressable
          onPress={() => setPicking(true)}
          accessibilityRole="button"
          accessibilityLabel={student ? `${w.changeStudent}: ${student.name}` : w.recitationsPick}
          style={({ pressed }) => [styles.student, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { backgroundColor: colors.accent }]}>
          {student ? (
            <>
              <InitialsAvatar name={student.name} size={52} photoUrl={student.photoUrl} />
              <View style={styles.flex}>
                <AppText variant="heading" numberOfLines={1}>
                  {student.name}
                </AppText>
                <AppText variant="small" tone="muted" numberOfLines={1}>
                  {student.classLabel}
                </AppText>
              </View>
            </>
          ) : (
            <>
              <View style={[styles.placeholder, { backgroundColor: colors.muted }]}>
                <Icon name="students" size={22} color={colors.mutedForeground} />
              </View>
              <AppText variant="bodyStrong" style={styles.flex}>
                {w.recitationsPick}
              </AppText>
            </>
          )}
          <Icon name="forward" size={16} color={colors.mutedForeground} />
        </Pressable>

        {student ? (
          <StudentRecitations
            key={student.id}
            teacherId={teacherId}
            studentId={student.id}
            initialSurah={initialSurah}
            onAdd={addRecitation}
            onOpen={(programId) => router.push({ pathname: '/teacher/work/[id]', params: { id: programId } })}
          />
        ) : (
          <EmptyState icon="recitation" title={w.recitationsPick} description={w.recitationsPickHint} />
        )}

        <StudentPickerSheet
          visible={picking}
          groups={groups}
          selectedId={studentId}
          onClose={() => setPicking(false)}
          onPick={(id) => {
            setStudentId(id);
            setPicking(false);
          }}
        />
      </QueryState>
    </Screen>
  );
}

function StudentRecitations({
  teacherId,
  studentId,
  initialSurah,
  onAdd,
  onOpen,
}: {
  teacherId: string;
  studentId: string;
  initialSurah?: number;
  onAdd: (surah?: number) => void;
  onOpen: (programId: string) => void;
}) {
  const { colors } = useAppTheme();
  const query = useRecitationHistory(teacherId, studentId);
  const [scope, setScope] = useState<Scope>('history');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<number | null>(initialSurah ?? null);

  const histories = useMemo(() => new Map((query.data?.surahs ?? []).map((h) => [h.surah, h])), [query.data]);
  const rows: SurahRow[] = useMemo(
    () =>
      SURAHS.map((s) => {
        const history = histories.get(s.number) ?? null;
        // every entry its own row, in the server's chronological order and with its numbers (a
        // postponed one and the one continuing it show the same number: two rows, one recitation)
        return { surah: s.number, name: `سورة ${s.nameAr}`, history, columns: history ? history.entries.map(asRow) : [] };
      }),
    [histories],
  );
  const needle = normalizeArabic(search);
  const visible = rows.filter(
    (r) =>
      (scope === 'all' || r.history || r.surah === open) &&
      (!needle || normalizeArabic(r.name).includes(needle) || String(r.surah) === search.trim()),
  );
  // «مجدولة» vs «بانتظار التقييم»: has the recitation's session started (platform clock)? Only a
  // session of TODAY needs its start time — from my sessions of today (the «الحصص» tab's query)
  const preferences = usePreferences();
  const clock = platformClock(preferences.data?.timezone);
  const columns = rows.flatMap((r) => r.columns);
  const pendingToday = columns.some((c) => c.result.entry === 'PENDING' && c.result.sessionDate === clock.today);
  const todaySessions = useTeacherSessionPages(teacherId, pendingToday ? tabQuery('today', clock.today) : null);
  const startTimes = new Map((todaySessions.data?.pages ?? []).flatMap((p) => p.data).map((x) => [x.id, x.startTime]));
  const stateOf = (c: RecitationColumn<RecitationAttempt>) => recitationState(c.result.entry, c.result.sessionDate, startTimes.get(c.result.sessionId), clock);
  const totals = RECITATION_STATES.map((state) => ({ state, count: columns.filter((c) => stateOf(c) === state).length })).filter((t) => t.count > 0);
  const attempts = [...histories.values()].reduce((n, h) => n + h.attempts, 0);

  return (
    <QueryState query={query}>
      {/* The student's recitations by result (one per displayed recitation; server counts) */}
      <View style={styles.totals} accessible accessibilityLabel={`${w.recitationsTotal}: ${recitationsCount(attempts)}`} testID="recitation-totals">
        <View style={[styles.total, { backgroundColor: colors.muted }]} testID="total-attempts">
          <AppText variant="heading">{attempts}</AppText>
          <AppText variant="small" tone="muted">
            {w.recitationsTotal}
          </AppText>
        </View>
        {totals.map(({ state, count }) => {
          const look = RECITATION_STATE_LOOK[state];
          return (
            <View key={state} style={[styles.total, { backgroundColor: colors[look.bg] }]} testID={`total-${state}`}>
              <View style={styles.inline}>
                <Icon name={look.icon} size={16} color={colors[look.fg]} />
                <AppText variant="heading" style={{ color: colors[look.fg] }}>
                  {count}
                </AppText>
              </View>
              <AppText variant="small" style={{ color: colors[look.fg] }}>
                {RECITATION_STATE_SHORT[state]}
              </AppText>
            </View>
          );
        })}
      </View>

      <View style={[styles.search, { borderColor: colors.input, backgroundColor: colors.card }]}>
        <Icon name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={w.searchSurah}
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel={w.searchSurahLabel}
          autoCorrect={false}
          returnKeyType="search"
          style={[styles.searchInput, { color: colors.foreground }]}
        />
        {search ? (
          <Pressable onPress={() => setSearch('')} accessibilityRole="button" accessibilityLabel={w.clearSurahSearch} hitSlop={8}>
            <Icon name="close" size={16} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      <ChipRow
        label={w.surahScope}
        value={scope}
        onChange={setScope}
        size="lg"
        options={[
          { value: 'history', label: w.scopeHistory },
          { value: 'all', label: w.scopeAll },
        ]}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon="recitation"
          title={histories.size === 0 && scope === 'history' && !needle ? w.recitationsEmpty : w.noSurahMatch}
          description={histories.size === 0 && scope === 'history' && !needle ? w.recitationsEmptyHint : undefined}
        />
      ) : (
        <View style={styles.list} accessibilityLabel={w.recitations}>
          {visible.map((r) => (
            <SurahCard
              key={r.surah}
              row={r}
              open={open === r.surah}
              onToggle={() => setOpen(open === r.surah ? null : r.surah)}
              onAdd={() => onAdd(r.surah)}
              onOpen={onOpen}
              stateOf={stateOf}
            />
          ))}
        </View>
      )}
    </QueryState>
  );
}

function SurahCard({
  row,
  open,
  onToggle,
  onAdd,
  onOpen,
  stateOf,
}: {
  row: SurahRow;
  open: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onOpen: (programId: string) => void;
  stateOf: (column: RecitationColumn<RecitationAttempt>) => RecitationState;
}) {
  const { colors } = useAppTheme();
  const attempts = row.history?.attempts ?? 0;
  const count = recitationsCount(attempts);
  return (
    <Card style={styles.card}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${row.name} — ${count}`}
        testID={`surah-${row.surah}`}
        style={styles.header}>
        <Icon name="memorization" size={22} color={colors.primary} />
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{row.name}</AppText>
          <AppText variant="small" tone="muted">
            {w.ayahsCount(ayahCount(row.surah))}
          </AppText>
        </View>
        <View style={[styles.count, { backgroundColor: attempts ? colors.brandSoft : colors.muted }]}>
          <AppText variant="label" style={{ color: attempts ? colors.brandSoftForeground : colors.mutedForeground }}>
            {count}
          </AppText>
        </View>
        <View style={open ? styles.up : styles.down}>
          <Icon name="forward" size={16} color={colors.mutedForeground} />
        </View>
      </Pressable>
      {open ? (
        <View style={styles.panel}>
          {row.columns.map((c) => (
            <Entry key={c.key} column={c} state={stateOf(c)} surah={row.name} onOpen={onOpen} />
          ))}
          {row.history ? (
            <AppText variant="caption" tone="muted" testID="next-recitation">
              {nextRecitationText(row.history.nextNumber)}
            </AppText>
          ) : null}
          <Button variant="outline" icon="add" label={w.addRecitation} accessibilityLabel={w.addRecitationFor(row.name)} onPress={onAdd} />
        </View>
      ) : null}
    </Card>
  );
}

/** One recitation: «العرضة 2», its session date, its result; postponements noted; opens its program. */
function Entry({
  column,
  state,
  surah,
  onOpen,
}: {
  column: RecitationColumn<RecitationAttempt>;
  state: RecitationState;
  surah: string;
  onOpen: (programId: string) => void;
}) {
  const { colors } = useAppTheme();
  const e = column.result;
  const look = RECITATION_STATE_LOOK[state];
  const skipped = column.earlier.filter((x) => x.entry === 'POSTPONED' || x.entry === 'SESSION_CANCELLED');
  const postponed = skipped.length ? w.postponedOn(skipped.map((x) => formatDate(x.sessionDate)).join('، ')) : null;
  const result = `${RECITATION_STATE_SHORT[state]}${state === 'POSTPONED' ? ' · لا تحتسب' : ''}`;
  const label = [`${surah} — ${recitationTitle(column.number)}`, result, formatDate(e.sessionDate), postponedTimes(skipped.length), e.evaluatedBy]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      onPress={() => onOpen(e.programId)}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityHint={w.openLinked}
      testID={`entry-${state}`}
      style={({ pressed }) => [styles.entry, { backgroundColor: colors[look.bg] }, pressed && styles.pressed]}>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{recitationTitle(column.number)}</AppText>
        <View style={styles.inline}>
          <Icon name="calendar" size={14} color={colors.mutedForeground} />
          <AppText variant="small" tone="muted">
            {formatDate(e.sessionDate)}
          </AppText>
        </View>
        {postponed ? (
          <AppText variant="small" style={{ color: colors.infoSoftForeground }} testID="postponed-note">
            {postponed}
          </AppText>
        ) : null}
        {e.evaluationComment ? (
          <AppText variant="small" tone="muted">
            {e.evaluationComment}
          </AppText>
        ) : null}
      </View>
      <View style={[styles.pill, { backgroundColor: colors.card }]}>
        <Icon name={look.icon} size={16} color={colors[look.fg]} />
        <AppText variant="label" style={{ color: colors[look.fg] }}>
          {result}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  student: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.md,
  },
  placeholder: { width: 52, height: 52, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, minWidth: 0 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  totals: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  total: { flexGrow: 1, flexBasis: '22%', alignItems: 'center', gap: 2, borderRadius: radius.lg, paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
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
  list: { gap: spacing.sm },
  card: { paddingVertical: spacing.sm },
  header: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  count: { borderRadius: radius.full, paddingHorizontal: spacing.md, paddingVertical: 4 },
  down: { transform: [{ rotate: '90deg' }] },
  up: { transform: [{ rotate: '-90deg' }] },
  panel: { gap: spacing.sm, marginTop: spacing.sm },
  entry: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.lg, padding: spacing.sm },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  pressed: { opacity: 0.8 },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
});
