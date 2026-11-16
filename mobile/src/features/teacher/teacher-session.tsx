import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { QueryState } from '@/components/feedback';
import {
  AppText,
  Button,
  Card,
  Icon,
  InitialsAvatar,
  Pill,
  PressableRow,
  Screen,
  SectionCard,
  TimeRange,
} from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { formatDate, formatDateLong } from '@/i18n/format';
import { radius, spacing, useAppTheme } from '@/theme';

import { platformClock, teacherClasses } from './dashboard-model';
import { AttendanceStateLabel } from './attendance-badges';
import { InfoRow } from './info-row';
import { SessionStatusPill } from './session-card';
import { myRoleIn, sessionTeam, toSessionItem } from './sessions-model';
import { teacherKey, useTeacherWorkspace } from './use-teacher-dashboard';
import { usePullToRefresh } from './use-refresh';
import { useTeacherSession } from './use-teacher-sessions';

/**
 * One of MY sessions, read-only (GET /teacher/sessions/:id). WHERE and WHO
 * are this session's snapshot — a shared or extra lesson may be in another
 * room or branch than the class's usual ones. No editing, cancelling or
 * attendance marking in this phase.
 */
export function TeacherSessionScreen({ sessionId }: { sessionId: string }) {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const router = useRouter();
  const { colors } = useAppTheme();
  const preferences = usePreferences();
  const workspace = useTeacherWorkspace(teacherId);
  const query = useTeacherSession(teacherId, sessionId);
  const { refreshing, onRefresh } = usePullToRefresh([[...teacherKey(teacherId), 'sessions', 'detail', sessionId]]);
  const clock = platformClock(preferences.data?.timezone);

  const session = query.data;
  const item = session ? toSessionItem(session, clock) : null;
  const myClassIds = new Set(workspace.data ? teacherClasses(workspace.data).map((c) => c.id) : []);
  const classes = session ? [session.groupClass, ...session.additionalClasses] : [];
  const role = session ? myRoleIn(session, teacherId) : null;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      {item ? <Stack.Screen options={{ title: item.groupNames.join(' · ') }} /> : null}
      <QueryState query={query}>
        {session && item ? (
          <>
            <Card style={styles.header}>
              <View style={styles.row}>
                <View style={[styles.iconTile, { backgroundColor: colors.brandSoft }]}>
                  <Icon name="calendar" size={24} color={colors.primary} />
                </View>
                <View style={styles.flex}>
                  <AppText variant="heading">{formatDateLong(item.date)}</AppText>
                  <TimeRange start={item.start} end={item.end} variant="bodyStrong" tone="primary" />
                </View>
              </View>
              <View style={styles.pills}>
                <SessionStatusPill status={item.status} />
                {item.isToday ? <Pill label={ar.teacher.today} tone="brand" /> : null}
                {item.isExtra ? <Pill label={ar.teacher.extra} tone="warning" /> : null}
                {item.isShared ? <Pill label={ar.teacher.shared} /> : null}
                {role ? <Pill label={ar.labels.teachingRole[role]} tone={role === 'SUPERVISOR' ? 'brand' : 'muted'} /> : null}
              </View>
              {item.status === 'CANCELLED' ? (
                <InfoRow icon="info" label={ar.sessions.cancellationReason}>
                  {item.cancellationReason ?? ar.sessions.noReason}
                </InfoRow>
              ) : null}
              {session.completion ? (
                <InfoRow icon="completed" label={ar.sessions.completedOn}>
                  {formatDate(session.completion.completedAt)}
                </InfoRow>
              ) : null}
            </Card>

            <SectionCard title={ar.sessions.place} icon="location">
              <InfoRow icon="room" label={ar.classes.room}>
                {item.roomName}
              </InfoRow>
              <InfoRow icon="location" label={ar.classes.branch}>
                {item.branchName}
              </InfoRow>
            </SectionCard>

            <SectionCard title={ar.sessions.groups} icon="classes" aside={item.isShared ? ar.sessions.sharedNote : undefined}>
              {classes.map((c, i) =>
                myClassIds.has(c.id) ? (
                  <PressableRow
                    key={c.id}
                    bordered={i > 0}
                    accessibilityLabel={`${ar.classes.open}: ${c.group.name}`}
                    onPress={() => router.push({ pathname: '/teacher/classes/[id]', params: { id: c.id } })}>
                    <AppText variant="bodyStrong">{c.group.name}</AppText>
                  </PressableRow>
                ) : (
                  // A partner class of a shared lesson that is not mine: name only, not openable
                  <View key={c.id} style={[styles.plainRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
                    <AppText variant="body">{c.group.name}</AppText>
                  </View>
                ),
              )}
            </SectionCard>

            <SectionCard title={ar.sessions.team} icon="teacher">
              {sessionTeam(session, teacherId).map((m) => (
                <View key={m.id} style={styles.row}>
                  <InitialsAvatar initials={m.name.split(' ').map((w) => w.charAt(0)).slice(0, 2).join('')} size={32} />
                  <AppText variant="body" style={styles.flex} numberOfLines={1}>
                    {m.name}
                    {m.isMe ? (
                      <AppText variant="caption" tone="muted">
                        {' '}({ar.classes.you})
                      </AppText>
                    ) : null}
                  </AppText>
                  <Pill label={ar.labels.teachingRole[m.role]} tone={m.role === 'SUPERVISOR' ? 'brand' : 'muted'} />
                </View>
              ))}
            </SectionCard>

            <SectionCard title={ar.sessions.attendanceTitle} icon="attendance">
              <AttendanceStateLabel state={item.progress} recorded={item.recorded} expected={item.expected} />
              {item.status !== 'CANCELLED' ? (
                <AppText variant="body">
                  {ar.sessions.attendanceRecorded(session.attendance.recorded, session.attendance.expected)}
                </AppText>
              ) : null}
              <Button
                variant="outline"
                icon="attendance"
                label={ar.attendance.open}
                fullWidth
                onPress={() =>
                  router.push({ pathname: '/teacher/sessions/[id]/attendance', params: { id: session.id } })
                }
              />
            </SectionCard>
          </>
        ) : null}
      </QueryState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconTile: { width: 52, height: 52, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  plainRow: { paddingVertical: spacing.md },
  flex: { flex: 1 },
});
