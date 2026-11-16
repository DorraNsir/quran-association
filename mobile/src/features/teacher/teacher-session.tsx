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
import { headerTitle } from '@/theme/navigation';

import { attendanceAction } from './attendance-action';
import { AttendanceStateLabel } from './attendance-badges';
import { rosterState } from './attendance-model';
import { platformClock, teacherClasses } from './dashboard-model';
import { ExtraSessionPill, SessionStatusPill } from './session-card';
import { myRoleIn, sessionTeam, toSessionItem, type SessionItem } from './sessions-model';
import { teacherKey, useTeacherWorkspace } from './use-teacher-dashboard';
import { usePullToRefresh } from './use-refresh';
import { useSessionAttendance, useTeacherSession } from './use-teacher-sessions';

/**
 * One of MY sessions (GET /teacher/sessions/:id): a compact summary, then the
 * attendance action right away (no scrolling), then the groups and the team.
 * WHERE and WHO are this session's snapshot — a shared or extra lesson may be
 * in another room or branch than the class's usual ones.
 */
export function TeacherSessionScreen({ sessionId }: { sessionId: string }) {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const router = useRouter();
  const { colors } = useAppTheme();
  const preferences = usePreferences();
  const workspace = useTeacherWorkspace(teacherId);
  const query = useTeacherSession(teacherId, sessionId);
  const { refreshing, onRefresh } = usePullToRefresh([
    [...teacherKey(teacherId), 'sessions', 'detail', sessionId],
    [...teacherKey(teacherId), 'sessions', 'attendance', sessionId],
  ]);
  const clock = platformClock(preferences.data?.timezone);

  const session = query.data;
  const item = session ? toSessionItem(session, clock) : null;
  const myClassIds = new Set(workspace.data ? teacherClasses(workspace.data).map((c) => c.id) : []);
  const classes = session ? [session.groupClass, ...session.additionalClasses] : [];
  const role = session ? myRoleIn(session, teacherId) : null;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      {item ? <Stack.Screen options={{ title: headerTitle(item.groupNames.join(' · ')) }} /> : null}
      <QueryState query={query}>
        {session && item ? (
          <>
            {/* Summary: when, where, what kind */}
            <Card style={styles.summary}>
              <View style={styles.row}>
                <View style={[styles.iconTile, { backgroundColor: colors.brandSoft }]}>
                  <Icon name="calendar" size={22} color={colors.primary} />
                </View>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{formatDateLong(item.date)}</AppText>
                  <TimeRange start={item.start} end={item.end} variant="label" tone="primary" />
                </View>
              </View>
              <View style={styles.meta}>
                <Icon name="location" size={14} color={colors.mutedForeground} />
                <AppText variant="caption" tone="muted" style={styles.shrink}>
                  {item.roomName} — {item.branchName}
                </AppText>
              </View>
              <View style={styles.pills}>
                <SessionStatusPill status={item.status} />
                {item.isToday ? <Pill label={ar.teacher.today} tone="brand" /> : null}
                {item.isExtra ? <ExtraSessionPill /> : null}
                {item.isShared ? <Pill label={ar.teacher.shared} /> : null}
                {role ? <Pill label={ar.labels.teachingRole[role]} tone={role === 'SUPERVISOR' ? 'brand' : 'muted'} /> : null}
              </View>
              {item.status === 'CANCELLED' ? (
                <AppText variant="small" style={{ color: colors.destructiveSoftForeground }}>
                  {ar.sessions.cancellationReason}: {item.cancellationReason ?? ar.sessions.noReason}
                </AppText>
              ) : null}
              {session.completion ? (
                <AppText variant="small" tone="muted">
                  {ar.sessions.completedOn} {formatDate(session.completion.completedAt)}
                </AppText>
              ) : null}
            </Card>

            <AttendanceActionCard
              teacherId={teacherId}
              sessionId={session.id}
              fallback={item}
              onOpen={() => router.push({ pathname: '/teacher/sessions/[id]/attendance', params: { id: session.id } })}
            />

            <SectionCard title={ar.sessions.groups} icon="classes" aside={item.isShared ? ar.teacher.shared : undefined}>
              <View>
                {classes.map((c, i) =>
                  myClassIds.has(c.id) ? (
                    <PressableRow
                      key={c.id}
                      bordered={i > 0}
                      accessibilityLabel={`${ar.classes.open}: ${c.group.name}`}
                      onPress={() => router.push({ pathname: '/teacher/classes/[id]', params: { id: c.id } })}>
                      <View style={styles.row}>
                        <View style={[styles.smallTile, { backgroundColor: colors.brandSoft }]}>
                          <Icon name="classes" size={16} color={colors.primary} />
                        </View>
                        <AppText variant="bodyStrong" numberOfLines={2} style={styles.flex}>
                          {c.group.name}
                        </AppText>
                      </View>
                    </PressableRow>
                  ) : (
                    // A partner class of a shared lesson that is not mine: name only — no arrow, not openable
                    <View
                      key={c.id}
                      style={[styles.plainRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}
                      accessible
                      accessibilityLabel={`${c.group.name}، ${ar.sessions.partnerGroup}`}>
                      <View style={[styles.smallTile, { backgroundColor: colors.muted }]}>
                        <Icon name="classes" size={16} color={colors.mutedForeground} />
                      </View>
                      <View style={styles.flex}>
                        <AppText variant="body" numberOfLines={2}>
                          {c.group.name}
                        </AppText>
                        <AppText variant="small" tone="muted">
                          {ar.sessions.partnerGroup}
                        </AppText>
                      </View>
                    </View>
                  ),
                )}
              </View>
            </SectionCard>

            <SectionCard title={ar.sessions.team} icon="teacher">
              {sessionTeam(session, teacherId).map((m) => (
                <View key={m.id} style={styles.row}>
                  <InitialsAvatar name={m.name} size={32} />
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
          </>
        ) : null}
      </QueryState>
    </Screen>
  );
}

/**
 * The ONE attendance entry point, right under the summary. Its label and
 * emphasis come from the roster the server returns (what may be changed
 * now); until it arrives, or if it fails, the session's own counts are
 * shown and the action stays a plain «عرض الحضور».
 */
function AttendanceActionCard({
  teacherId,
  sessionId,
  fallback,
  onOpen,
}: {
  teacherId: string;
  sessionId: string;
  fallback: SessionItem;
  onOpen: () => void;
}) {
  const roster = useSessionAttendance(teacherId, sessionId);
  const dto = roster.data;
  const kind = dto ? attendanceAction(dto) : 'view';
  const primary = kind !== 'view';
  return (
    <Card style={styles.action}>
      <View style={styles.actionHead}>
        {dto ? (
          <AttendanceStateLabel state={rosterState(dto)} />
        ) : (
          <AttendanceStateLabel state={fallback.progress} recorded={fallback.recorded} expected={fallback.expected} />
        )}
        {dto ? (
          <View style={styles.counts}>
            <AppText variant="small" tone="muted">
              {ar.attendance.progress(dto.recordedCount, dto.expectedCount)}
            </AppText>
            <AppText variant="small" tone="muted">
              {ar.attendance.teamProgress(dto.teacherRecordedCount, dto.teacherExpectedCount)}
            </AppText>
          </View>
        ) : null}
      </View>
      <Button
        variant={primary ? 'primary' : 'outline'}
        icon="attendance"
        label={ar.attendance.action[kind]}
        loading={roster.isPending}
        fullWidth
        onPress={onOpen}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  summary: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  shrink: { flexShrink: 1 },
  iconTile: { width: 44, height: 44, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  smallTile: { width: 32, height: 32, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  action: { gap: spacing.sm },
  actionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  counts: { alignItems: 'flex-end' },
  plainRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, minHeight: 48 },
  flex: { flex: 1 },
});
