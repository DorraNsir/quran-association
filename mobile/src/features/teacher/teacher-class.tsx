import { Stack, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState, QueryState } from '@/components/feedback';
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
} from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { usePreferences } from '@/features/preferences/preferences';
import { ar } from '@/i18n/ar';
import { radius, spacing, useAppTheme } from '@/theme';
import { headerTitle } from '@/theme/navigation';

import { ScheduleList } from './class-card';
import { classRoster, findTeacherClass, studentsLabel } from './classes-model';
import { platformClock } from './dashboard-model';
import { InfoRow } from './info-row';
import { teacherKey, useTeacherWorkspace } from './use-teacher-dashboard';
import { usePullToRefresh } from './use-refresh';

/**
 * One of my classes: identity, where and when (slot by slot — a shared slot
 * may be in another room or branch), the team, and the students currently
 * in THIS class. Looked up in MY workspace bundle only: an id that is not one
 * of my classes shows "not available".
 */
export function TeacherClassScreen({ groupClassId }: { groupClassId: string }) {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const workspace = useTeacherWorkspace(teacherId);
  const preferences = usePreferences();
  const router = useRouter();
  const { colors } = useAppTheme();
  const { refreshing, onRefresh } = usePullToRefresh([[...teacherKey(teacherId), 'workspace']]);

  const today = platformClock(preferences.data?.timezone).today;
  const item = workspace.data ? findTeacherClass(workspace.data, groupClassId) : null;
  const roster = workspace.data && item ? classRoster(workspace.data, item.id, today) : [];

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      {item ? <Stack.Screen options={{ title: headerTitle(item.groupName) }} /> : null}
      <QueryState query={workspace}>
        {!item ? (
          <EmptyState
            icon="forbidden"
            title={ar.classes.notFoundTitle}
            description={ar.classes.notFoundDescription}
            action={<Button variant="outline" label={ar.classes.back} onPress={() => router.back()} />}
          />
        ) : (
          <>
            {/* Identity: group, audience, my role, status, size */}
            <Card style={styles.headerCard}>
              <View style={styles.titleRow}>
                <View style={[styles.iconTile, { backgroundColor: colors.brandSoft }]}>
                  <Icon name="classes" size={24} color={colors.primary} />
                </View>
                <View style={styles.flex}>
                  <AppText variant="title" numberOfLines={2}>
                    {item.groupName}
                  </AppText>
                  {item.audience ? (
                    <AppText variant="caption" tone="muted" numberOfLines={1}>
                      {item.audience}
                    </AppText>
                  ) : null}
                </View>
              </View>
              <View style={styles.pills}>
                <Pill label={ar.labels.teachingRole[item.role]} tone={item.role === 'SUPERVISOR' ? 'brand' : 'muted'} />
                {item.status !== 'ACTIVE' ? <Pill label={ar.labels.status[item.status]} tone="warning" /> : null}
                <Pill label={studentsLabel(roster.length)} />
                <Pill label={ar.classes.slotsCount(item.slots.length)} />
              </View>
            </Card>

            <Button
              variant="outline"
              icon="classes"
              label={ar.memorization.open}
              fullWidth
              onPress={() => router.push({ pathname: '/teacher/memorization', params: { classId: item.id } })}
            />

            <SectionCard title={ar.classes.details} icon="info">
              <InfoRow icon="location" label={ar.classes.branch}>
                {item.branchName}
              </InfoRow>
              <InfoRow icon="room" label={item.rooms.length > 1 ? ar.classes.rooms : ar.classes.room}>
                {item.rooms.length ? item.rooms.join('، ') : '—'}
              </InfoRow>
            </SectionCard>

            <SectionCard title={ar.classes.weekly} icon="calendar">
              <ScheduleList slots={item.slots} />
            </SectionCard>

            <SectionCard title={ar.classes.team} icon="teacher">
              {item.team.map((m) => (
                <View key={`${m.role}-${m.id}`} style={styles.titleRow}>
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

            <SectionCard title={ar.classes.students} icon="students" aside={studentsLabel(roster.length)}>
              {roster.length === 0 ? (
                <EmptyState icon="students" title={ar.classes.studentsEmpty} />
              ) : (
                roster.map((s, i) => (
                  <PressableRow
                    key={s.id}
                    bordered={i > 0}
                    accessibilityLabel={s.name}
                    onPress={() => router.push({ pathname: '/teacher/students/[id]', params: { id: s.id } })}>
                    <View style={styles.titleRow}>
                      <InitialsAvatar name={s.name} size={36} />
                      <View style={styles.flex}>
                        <AppText variant="body" numberOfLines={1}>
                          {s.name}
                        </AppText>
                        {s.age !== null ? (
                          <AppText variant="small" tone="muted">
                            {ar.student.age(s.age)}
                          </AppText>
                        ) : null}
                      </View>
                    </View>
                  </PressableRow>
                ))
              )}
            </SectionCard>
          </>
        )}
      </QueryState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerCard: { gap: spacing.md },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconTile: {
    width: 52,
    height: 52,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  flex: { flex: 1 },
});
