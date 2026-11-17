import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState, QueryState } from '@/components/feedback';
import { AppText, Button, Card, Icon, InitialsAvatar, Pill, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { formatDate, formatDateLong, ltr } from '@/i18n/format';
import { radius, spacing, useAppTheme } from '@/theme';
import { headerTitle } from '@/theme/navigation';
import { ApiError } from '@/services/api';

import { studentProfile } from './classes-model';
import { currentSemester, platformClock } from './dashboard-model';
import { platformDateOf, SEMESTERS, semesterEntry, semesterNotStarted, semesterPeriod, type SemesterEntry } from './memorization-model';
import { useStudentMemorization } from './use-memorization';
import { teacherKey, useTeacherWorkspace } from './use-teacher-dashboard';
import { usePullToRefresh } from './use-refresh';

const m = ar.memorization;

/**
 * «سجل الحفظ» of one of MY students (read-only): the current academic year's
 * two semesters, newest first — each one's last memorized surah as recorded
 * (GET /teacher/students/:id/memorization). That is the whole history the
 * backend keeps: one value per semester, no per-lesson entries.
 */
export function TeacherStudentMemorizationScreen({ studentId }: { studentId: string }) {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const router = useRouter();
  const preferences = usePreferences();
  const workspace = useTeacherWorkspace(teacherId);
  const timeZone = preferences.data?.timezone;
  const clock = platformClock(timeZone);
  const year = preferences.data?.currentAcademicYear ?? null;
  const profile = workspace.data ? studentProfile(workspace.data, studentId, clock.today) : null;
  // Only a student of MY classes is requested (the backend refuses others anyway)
  const results = useStudentMemorization(teacherId, profile ? studentId : '', year);
  const { refreshing, onRefresh } = usePullToRefresh([[...teacherKey(teacherId), 'memorization', 'student', studentId]]);
  const entries = SEMESTERS.map((semester, i) => semesterEntry(semester, results[i]?.data, results[i]?.error)).reverse();
  // A 403 on one semester is a normal state (not my student then), not an error
  const failed = results.find((r) => r.isError && !(r.error instanceof ApiError && r.error.isForbidden));
  const loading = results.some((r) => r.isPending && r.fetchStatus !== 'idle');

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <QueryState query={[preferences, workspace]}>
        {!profile ? (
          <EmptyState
            icon="forbidden"
            title={m.studentUnavailable}
            description={m.studentUnavailableHint}
            action={<Button variant="outline" label={ar.classes.back} onPress={() => router.back()} />}
          />
        ) : !year ? (
          <EmptyState icon="classes" title={m.noYear} />
        ) : (
          <>
            <Stack.Screen options={{ title: headerTitle(`${m.history} — ${profile.name}`) }} />
            <Card style={styles.header}>
              <InitialsAvatar name={profile.name} size={48} photoUrl={profile.student.photoUrl} />
              <View style={styles.flex}>
                <AppText variant="heading" numberOfLines={1}>
                  {profile.name}
                </AppText>
                <AppText variant="small" tone="muted" numberOfLines={1}>
                  {profile.groupClass.groupName} · {ltr(year.label)}
                </AppText>
              </View>
            </Card>

            {failed ? (
              <ErrorState error={failed.error} onRetry={() => results.forEach((r) => r.isError && void r.refetch())} />
            ) : loading ? (
              <LoadingState />
            ) : (
              entries.map((entry) =>
                entry ? (
                  <SemesterCard
                    key={entry.semester}
                    entry={entry}
                    isCurrent={entry.semester === currentSemester(year, clock.today)}
                    period={semesterPeriod(year, entry.semester)}
                    notStarted={semesterNotStarted(year, entry.semester, clock.today)}
                    timeZone={timeZone}
                    onEdit={() =>
                      router.push({
                        pathname: '/teacher/students/[id]/memorization/record',
                        params: { id: studentId, semester: entry.semester },
                      })
                    }
                  />
                ) : null,
              )
            )}
            <AppText variant="small" tone="muted">
              {m.rule} {m.sharedRecord}
            </AppText>
          </>
        )}
      </QueryState>
    </Screen>
  );
}

function SemesterCard({
  entry,
  isCurrent,
  period,
  notStarted,
  timeZone,
  onEdit,
}: {
  entry: SemesterEntry;
  isCurrent: boolean;
  period: { from: string; to: string };
  notStarted: boolean;
  timeZone: string | undefined;
  /** Not offered for a semester outside my teaching of the student (the API would refuse) */
  onEdit: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Card style={styles.semester}>
      <View style={styles.inline}>
        <AppText variant="bodyStrong" accessibilityRole="header" style={styles.flex}>
          {ar.labels.semester[entry.semester]}
        </AppText>
        {isCurrent ? <Pill label={m.currentSemester} tone="brand" /> : null}
      </View>
      <AppText variant="small" tone="muted">
        {m.period(formatDate(period.from), formatDate(period.to))}
      </AppText>
      {entry.kind === 'recorded' ? (
        <View style={[styles.result, { backgroundColor: colors.brandSoft }]}>
          <Icon name="classes" size={20} color={colors.primary} />
          <View style={styles.flex}>
            <AppText variant="small" style={{ color: colors.brandSoftForeground }}>
              {m.lastSurah}
            </AppText>
            <AppText variant="heading" style={{ color: colors.brandSoftForeground }}>
              {entry.record.surahName}
            </AppText>
            <AppText variant="small" tone="muted">
              {m.surahNumber(entry.record.lastMemorizedSurahNumber)}
            </AppText>
          </View>
        </View>
      ) : (
        <AppText variant="body" tone="muted">
          {entry.kind === 'notMine' ? m.notMine : notStarted ? m.notStarted : m.notSetLong}
        </AppText>
      )}
      {entry.kind === 'recorded' ? (
        <AppText variant="small" tone="muted">
          {m.updatedOn(formatDateLong(platformDateOf(entry.record.updatedAt, timeZone)))}
        </AppText>
      ) : null}
      {entry.kind !== 'notMine' ? (
        <Button
          variant={entry.kind === 'recorded' ? 'outline' : 'primary'}
          icon="notes"
          label={entry.kind === 'recorded' ? `${m.edit} — ${ar.labels.semester[entry.semester]}` : `${m.add} — ${ar.labels.semester[entry.semester]}`}
          fullWidth
          onPress={onEdit}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  semester: { gap: spacing.sm },
  result: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.lg, padding: spacing.md },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
