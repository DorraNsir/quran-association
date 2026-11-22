import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import { AppText, Button, Card, Icon, InitialsAvatar, Screen, type IconName } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { formatDate } from '@/i18n/format';
import { radius, spacing, touchTarget, useAppTheme, type ColorTokens } from '@/theme';
import { headerTitle } from '@/theme/navigation';

import { nextRecitationText, recitationLabel, recitationsCount, type RecitationEntry } from '../quran-reference/work-assignment';
import { surahByNumber } from '../quran/surahs';
import { studentProfile } from './classes-model';
import { platformClock } from './dashboard-model';
import { useTeacherWorkspace } from './use-teacher-dashboard';
import { usePullToRefresh } from './use-refresh';
import { useRecitationHistory, workKey } from './use-work';
import type { RecitationAttempt, RecitationSurahHistory } from './work-types';

const w = ar.work;
const surahName = (n: number) => `سورة ${surahByNumber(n)?.nameAr ?? n}`;

/** Icon per result; the words always say it too (never colour alone). */
const ENTRY_ICON: Record<RecitationEntry, IconName> = {
  COMPLETED: 'success',
  PARTIAL: 'partial',
  NOT_COMPLETED: 'notDone',
  CANCELLED: 'ban',
  POSTPONED: 'clock',
  PENDING: 'pending',
  SESSION_CANCELLED: 'ban',
};
const entryColors = (colors: ColorTokens, entry: RecitationEntry) =>
  entry === 'COMPLETED'
    ? { bg: colors.brandSoft, fg: colors.brandSoftForeground }
    : entry === 'NOT_COMPLETED' || entry === 'CANCELLED'
      ? { bg: colors.destructiveSoft, fg: colors.destructiveSoftForeground }
      : entry === 'PARTIAL'
        ? { bg: colors.warningSoft, fg: colors.warningSoftForeground }
        : { bg: colors.muted, fg: colors.mutedForeground };

/**
 * «متابعة العرضات» of one of MY students (the web's tab): one card per surah («سورة المجادلة · 3
 * عرضات»); the opened surah lists its numbered recitations in order, each with its result, and the
 * next number. Every value comes from GET /teacher/students/:id/recitations — no cycles, no target.
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
  const { refreshing, onRefresh } = usePullToRefresh([[...workKey(teacherId), 'recitations', studentId]]);
  const surahs = query.data?.surahs ?? [];

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Stack.Screen options={{ title: headerTitle(profile ? `${w.recitations} — ${profile.name}` : w.recitations) }} />
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
                  <SurahCard key={s.surah} history={s} open={open === s.surah} onToggle={() => setOpen(open === s.surah ? null : s.surah)} />
                ))}
              </View>
            </QueryState>
          </>
        )}
      </QueryState>
    </Screen>
  );
}

function SurahCard({ history, open, onToggle }: { history: RecitationSurahHistory; open: boolean; onToggle: () => void }) {
  const { colors } = useAppTheme();
  const count = recitationsCount(history.attempts);
  return (
    <Card>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${surahName(history.surah)} — ${count}`}
        style={styles.header}>
        <View style={styles.flex}>
          <AppText variant="bodyStrong">{surahName(history.surah)}</AppText>
          <AppText variant="small" tone="muted">
            {count}
          </AppText>
        </View>
        <Icon name="forward" size={16} color={colors.mutedForeground} />
      </Pressable>
      {open ? (
        <View style={styles.panel}>
          <AppText variant="bodyStrong" accessibilityRole="header">
            {w.recitationsOf(surahName(history.surah))}
          </AppText>
          <Entries entries={history.entries} />
          <AppText variant="caption" tone="muted" testID="next-recitation">
            {nextRecitationText(history.nextNumber)}
          </AppText>
        </View>
      ) : null}
    </Card>
  );
}

/** One card per recitation, in order (any number; text wraps on small screens). */
function Entries({ entries }: { entries: RecitationAttempt[] }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.gap}>
      {entries.map((e) => {
        const { bg, fg } = entryColors(colors, e.entry);
        const label = recitationLabel(e.number, e.entry);
        const meta = `حصة ${formatDate(e.sessionDate)}${e.evaluatedBy ? ` · ${e.evaluatedBy}` : ''}`;
        return (
          <View key={e.itemId} testID={`entry-${e.entry}`} accessible accessibilityLabel={`${label} — ${meta}`} style={[styles.entry, { backgroundColor: bg }]}>
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
  entry: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.lg },
});
