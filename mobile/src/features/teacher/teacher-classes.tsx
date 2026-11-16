import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { QueryState } from '@/components/feedback';
import { AppText, Card, LinkButton, Screen } from '@/components/ui';
import { useSession } from '@/features/auth/auth-provider';
import { ar } from '@/i18n/ar';
import { spacing } from '@/theme';

import { ClassCard } from './class-card';
import { teacherClasses } from './dashboard-model';
import { teacherKey, useTeacherWorkspace } from './use-teacher-dashboard';
import { usePullToRefresh } from './use-refresh';

/** «مجموعاتي»: the classes I supervise or assist in (GET /teacher/workspace). */
export function TeacherClassesScreen() {
  const { user } = useSession();
  const teacherId = user?.teacherId ?? '';
  const workspace = useTeacherWorkspace(teacherId);
  const router = useRouter();
  const { refreshing, onRefresh } = usePullToRefresh([[...teacherKey(teacherId), 'workspace']]);
  const classes = workspace.data ? teacherClasses(workspace.data) : [];

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} edges={[]}>
      <View style={styles.intro}>
        <AppText variant="caption" tone="muted" style={styles.flex}>
          {ar.classes.intro}
        </AppText>
        <LinkButton label={ar.schedule.open} onPress={() => router.push('/teacher/schedule')} />
      </View>
      <Card>
        <QueryState
          query={workspace}
          empty={classes.length === 0}
          emptyIcon="classes"
          emptyTitle={ar.classes.empty}
          emptyDescription={ar.classes.emptyHint}>
          {classes.map((c, i) => (
            <ClassCard
              key={c.id}
              item={c}
              bordered={i > 0}
              onPress={() => router.push({ pathname: '/teacher/classes/[id]', params: { id: c.id } })}
            />
          ))}
        </QueryState>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  flex: { flex: 1 },
});
