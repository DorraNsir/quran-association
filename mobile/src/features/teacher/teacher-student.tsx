import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
import { AppText, Button, Card, InitialsAvatar, Pill, PressableRow, Screen, SectionCard } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { spacing } from '@/theme';
import { headerTitle } from '@/theme/navigation';

import { formatDate } from '@/i18n/format';

import { studentProfile } from './classes-model';
import { platformClock } from './dashboard-model';
import { InfoRow, PhoneValue } from './info-row';
import { teacherKey, useTeacherWorkspace } from './use-teacher-dashboard';
import { usePullToRefresh } from './use-refresh';

/**
 * «ملف الطالب» (read-only): only what the teacher workspace exposes for the
 * students of MY classes — the same fields as the web teacher page (no CIN,
 * no address). Attendance and memorization tabs come in later phases.
 */
export function TeacherStudentScreen({ studentId }: { studentId: string }) {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const workspace = useTeacherWorkspace(teacherId);
  const preferences = usePreferences();
  const router = useRouter();
  const { refreshing, onRefresh } = usePullToRefresh([[...teacherKey(teacherId), 'workspace']]);

  const today = platformClock(preferences.data?.timezone).today;
  const profile = workspace.data ? studentProfile(workspace.data, studentId, today) : null;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      {profile ? <Stack.Screen options={{ title: headerTitle(profile.name) }} /> : null}
      <QueryState query={workspace}>
        {!profile ? (
          <EmptyState
            icon="forbidden"
            title={ar.student.notFoundTitle}
            description={ar.student.notFoundDescription}
            action={<Button variant="outline" label={ar.classes.back} onPress={() => router.back()} />}
          />
        ) : (
          <>
            <Card style={styles.header}>
              <InitialsAvatar name={profile.name} size={64} photoUrl={profile.student.photoUrl} />
              <AppText variant="title" center>
                {profile.name}
              </AppText>
              <View style={styles.inline}>
                {profile.student.status !== 'ACTIVE' ? (
                  <Pill label={ar.labels.status[profile.student.status]} tone="warning" />
                ) : null}
                {profile.age !== null ? <Pill label={ar.student.age(profile.age)} /> : null}
              </View>
            </Card>

            <Card>
              <PressableRow
                bordered={false}
                accessibilityLabel={`${ar.classes.open}: ${profile.groupClass.groupName}`}
                onPress={() =>
                  router.push({ pathname: '/teacher/classes/[id]', params: { id: profile.groupClass.id } })
                }>
                <AppText variant="caption" tone="muted">
                  {ar.student.group}
                </AppText>
                <AppText variant="bodyStrong">
                  {profile.groupClass.groupName} — {profile.groupClass.branchName}
                </AppText>
              </PressableRow>
            </Card>

            <Card>
              <PressableRow
                bordered={false}
                accessibilityLabel={`${ar.memorization.history} — ${profile.name}`}
                onPress={() => router.push({ pathname: '/teacher/students/[id]/memorization', params: { id: profile.student.id } })}>
                <AppText variant="bodyStrong">{ar.memorization.history}</AppText>
                <AppText variant="small" tone="muted">
                  {ar.memorization.lastSurah}
                </AppText>
              </PressableRow>
              <Button
                icon="notes"
                label={ar.memorization.record}
                fullWidth
                onPress={() =>
                  router.push({ pathname: '/teacher/students/[id]/memorization/record', params: { id: profile.student.id } })
                }
              />
            </Card>

            <Card>
              <PressableRow
                bordered={false}
                accessibilityLabel={`${ar.work.studentLink} — ${profile.name}`}
                onPress={() => router.push({ pathname: '/teacher/work', params: { studentId: profile.student.id } })}>
                <AppText variant="bodyStrong">{ar.work.studentLink}</AppText>
                <AppText variant="small" tone="muted">
                  {ar.work.intro}
                </AppText>
              </PressableRow>
            </Card>

            <SectionCard title={ar.student.info} icon="info">
              <InfoRow icon="location" label={ar.student.branch}>
                {profile.groupClass.branchName}
              </InfoRow>
              <InfoRow icon="room" label={ar.student.room}>
                {profile.groupClass.rooms.length ? profile.groupClass.rooms.join('، ') : '—'}
              </InfoRow>
              <InfoRow icon="teacher" label={ar.student.supervisor}>
                {profile.groupClass.team.find((m) => m.role === 'SUPERVISOR')?.name ?? '—'}
              </InfoRow>
              {profile.student.phone ? (
                <InfoRow icon="phone" label={ar.student.phone}>
                  <PhoneValue phone={profile.student.phone} label={ar.student.phone} />
                </InfoRow>
              ) : null}
              <InfoRow icon="phone" label={ar.student.guardianPhone}>
                <PhoneValue phone={profile.student.guardianPhone} label={ar.student.guardianPhone} />
              </InfoRow>
              {profile.student.gender ? (
                <InfoRow icon="students" label={ar.student.genderLabel}>
                  {ar.student.gender[profile.student.gender]}
                </InfoRow>
              ) : null}
              <InfoRow icon="registered" label={ar.student.registrationDate}>
                {formatDate(profile.student.registrationDate)}
              </InfoRow>
            </SectionCard>
          </>
        )}
      </QueryState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', gap: spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
});
