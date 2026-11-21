import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import { AlertBox, AppText, Button, Card, Icon, InitialsAvatar, Pill, Screen, SuccessToast, type IconName } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { formatDate } from '@/i18n/format';
import { errorMessage } from '@/services/api/errors';
import { radius, spacing, touchTarget, useAppTheme, type ColorTokens } from '@/theme';
import { headerTitle } from '@/theme/navigation';

import {
  attemptLabel,
  cycleName,
  cycleProgressLong,
  cycleSummaryText,
  type RecitationEntry,
} from '../quran-reference/work-assignment';
import { surahByNumber } from '../quran/surahs';
import { studentProfile } from './classes-model';
import { platformClock } from './dashboard-model';
import { useTeacherWorkspace } from './use-teacher-dashboard';
import { usePullToRefresh } from './use-refresh';
import { useRecitationHistory, useStartRecitationCycle, workKey } from './use-work';
import type { RecitationAttempt, RecitationCycle, RecitationSurahHistory } from './work-types';

const w = ar.work;
const surahName = (n: number) => `سورة ${surahByNumber(n)?.nameAr ?? n}`;

/** Icon per entry; the words always say it too (never colour alone). */
const ENTRY_ICON: Record<RecitationEntry, IconName> = {
  SUCCESS: 'success',
  FAILED: 'notDone',
  PENDING: 'pending',
  POSTPONED: 'ban',
  DROPPED: 'ban',
  SESSION_CANCELLED: 'ban',
};
const entryColors = (colors: ColorTokens, entry: RecitationEntry) =>
  entry === 'SUCCESS'
    ? { bg: colors.brandSoft, fg: colors.brandSoftForeground }
    : entry === 'FAILED'
      ? { bg: colors.destructiveSoft, fg: colors.destructiveSoftForeground }
      : { bg: colors.muted, fg: colors.mutedForeground };

/**
 * «متابعة العرضات» of one of MY students (the web's tab): one card per surah with its current
 * cycle; the opened surah shows every cycle with its attempt cards (chronological numbers), the
 * earlier records and, once the current cycle is complete, «بدء دورة جديدة» (never automatic).
 * Every value comes from GET /teacher/students/:id/recitations.
 */
export function TeacherStudentRecitationsScreen({ studentId, initialSurah }: { studentId: string; initialSurah?: number }) {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const router = useRouter();
  const preferences = usePreferences();
  const workspace = useTeacherWorkspace(teacherId);
  const clock = platformClock(preferences.data?.timezone);
  const profile = workspace.data ? studentProfile(workspace.data, studentId, clock.today) : null;
  // Only a student of MY classes is requested (the backend refuses others anyway: 403 → ErrorState)
  const query = useRecitationHistory(teacherId, profile ? studentId : '');
  const [open, setOpen] = useState<number | null>(initialSurah ?? null);
  const [toast, setToast] = useState<string | null>(null);
  const { refreshing, onRefresh } = usePullToRefresh([[...workKey(teacherId), 'recitations', studentId]]);
  const surahs = query.data?.surahs ?? [];

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Stack.Screen options={{ title: headerTitle(profile ? `${w.recitations} — ${profile.name}` : w.recitations) }} />
      {toast ? <SuccessToast message={toast} /> : null}
      <QueryState query={[preferences, workspace]}>
        {!profile ? (
          <EmptyState
            icon="forbidden"
            title={w.recitationsUnavailable}
            action={<Button variant="outline" label={ar.classes.back} onPress={() => router.back()} />}
          />
        ) : (
          <>
            <Card style={styles.student}>
              <InitialsAvatar name={profile.name} size={48} photoUrl={profile.student.photoUrl} />
              <View style={styles.flex}>
                <AppText variant="heading" numberOfLines={1}>
                  {profile.name}
                </AppText>
                <AppText variant="small" tone="muted" numberOfLines={1}>
                  {profile.groupClass.groupName} — {profile.groupClass.branchName}
                </AppText>
              </View>
            </Card>
            <QueryState
              query={query}
              empty={surahs.length === 0}
              emptyIcon="recitation"
              emptyTitle={w.recitationsEmpty}
              emptyDescription={w.recitationsIntro}>
              <View accessibilityLabel={w.recitations} style={styles.list}>
                {surahs.map((s) => (
                  <SurahCard
                    key={s.surah}
                    teacherId={teacherId}
                    studentId={studentId}
                    history={s}
                    open={open === s.surah}
                    onToggle={() => setOpen(open === s.surah ? null : s.surah)}
                    onStarted={setToast}
                  />
                ))}
              </View>
            </QueryState>
          </>
        )}
      </QueryState>
    </Screen>
  );
}

function SurahCard({
  teacherId,
  studentId,
  history,
  open,
  onToggle,
  onStarted,
}: {
  teacherId: string;
  studentId: string;
  history: RecitationSurahHistory;
  open: boolean;
  onToggle: () => void;
  onStarted: (message: string) => void;
}) {
  const { colors } = useAppTheme();
  const start = useStartRecitationCycle(teacherId, studentId);
  const current = history.cycles.at(-1);
  const previous = history.cycles.slice(0, -1).reverse();
  const summary = current ? cycleSummaryText(current) : w.earlierOnly(history.earlier.length);
  return (
    <Card>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${surahName(history.surah)} — ${summary}`}
        style={styles.header}>
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{surahName(history.surah)}</AppText>
          <AppText variant="small" tone="muted">
            {summary}
          </AppText>
        </View>
        <Icon name="forward" size={16} color={colors.mutedForeground} />
      </Pressable>
      {open ? (
        <View style={styles.panel}>
          <AppText variant="bodyStrong" accessibilityRole="header">
            {w.recitationsOf(surahName(history.surah))}
          </AppText>
          {current ? <CycleView cycle={current} /> : null}
          {start.error ? <AlertBox message={errorMessage(start.error)} /> : null}
          {history.canStartNewCycle ? (
            <Button
              icon="revision"
              label={w.startNewCycle}
              loading={start.isPending}
              onPress={() =>
                // Confirmed by the server before anything is shown as started
                start.mutate(history.surah, {
                  onSuccess: () => onStarted(w.cycleStarted(cycleName((current?.number ?? 0) + 1), surahName(history.surah))),
                })
              }
            />
          ) : null}
          {previous.length ? (
            <View style={styles.gap}>
              <AppText variant="small" tone="muted" accessibilityRole="header">
                {w.previousCycles}
              </AppText>
              {previous.map((c) => (
                <CycleView key={c.id} cycle={c} />
              ))}
            </View>
          ) : null}
          {history.earlier.length ? (
            <View style={styles.gap}>
              <AppText variant="small" tone="muted" accessibilityRole="header">
                {w.earlierRecitations}
              </AppText>
              <Attempts entries={history.earlier} />
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function CycleView({ cycle }: { cycle: RecitationCycle }) {
  const { colors } = useAppTheme();
  const progress = cycleProgressLong(cycle.successes, cycle.required);
  return (
    <View style={styles.gap}>
      <View style={styles.inline} accessible accessibilityLabel={`${cycleName(cycle.number)} — ${progress}${cycle.completed ? ` — ${w.cycleCompleted}` : ''}`}>
        <AppText variant="bodyStrong">{cycleName(cycle.number)}</AppText>
        <AppText variant="small" tone="muted">
          · {progress}
        </AppText>
        {cycle.completed ? (
          <Pill
            icon="success"
            tone="success"
            label={`${w.cycleCompleted}${cycle.completedAt ? ` — ${formatDate(cycle.completedAt.slice(0, 10))}` : ''}`}
          />
        ) : null}
      </View>
      {/* successes out of four; the text above says it (the bar is decoration) */}
      <View style={styles.meter} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: cycle.required }, (_, i) => (
          <View key={i} style={[styles.segment, { backgroundColor: i < cycle.successes ? colors.primary : colors.muted }]} />
        ))}
      </View>
      {cycle.entries.length ? (
        <Attempts entries={cycle.entries} />
      ) : (
        <AppText variant="small" tone="muted">
          {w.noAttemptYet}
        </AppText>
      )}
    </View>
  );
}

/** Attempt cards, one per line (any number of attempts; text wraps on small screens). */
function Attempts({ entries }: { entries: RecitationAttempt[] }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.gap}>
      {entries.map((e) => {
        const { bg, fg } = entryColors(colors, e.entry);
        const label = attemptLabel(e.attemptNumber, e.entry);
        const meta = `حصة ${formatDate(e.sessionDate)}${e.evaluatedBy ? ` · ${e.evaluatedBy}` : ''}`;
        return (
          <View
            key={e.itemId}
            testID={`attempt-${e.entry}`}
            accessible
            accessibilityLabel={`${label} — ${meta}`}
            style={[styles.attempt, { backgroundColor: bg }]}>
            <Icon name={ENTRY_ICON[e.entry]} size={18} color={fg} />
            <View style={styles.flex}>
              <AppText variant="label" style={{ color: fg }}>
                {label}
              </AppText>
              <AppText variant="caption" tone="muted">
                {meta}
              </AppText>
              {e.evaluationComment ? (
                <AppText variant="caption" tone="muted">
                  {e.evaluationComment}
                </AppText>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  student: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  list: { gap: spacing.md },
  flex: { flex: 1, minWidth: 0 },
  gap: { gap: spacing.xs },
  header: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  panel: { gap: spacing.md, marginTop: spacing.md },
  inline: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  meter: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 6, borderRadius: radius.full },
  attempt: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.lg },
});
