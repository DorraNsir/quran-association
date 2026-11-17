import { Stack } from 'expo-router';

import { ar } from '@/i18n/ar';
import { useStackScreenOptions } from '@/theme/navigation';

/**
 * «فضاء المعلم»: the bottom tabs (home, classes, sessions) and, above them,
 * the detail screens. Reachable only through the root Stack.Protected guard
 * (TEACHER role + teacher profile); the backend still authorizes every request.
 */
export default function TeacherLayout() {
  const screenOptions = useStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false, title: ar.workspace.teacher }} />
      <Stack.Screen name="classes/[id]" options={{ title: ar.classes.details }} />
      <Stack.Screen name="students/[id]/index" options={{ title: ar.student.title }} />
      <Stack.Screen name="students/[id]/memorization/index" options={{ title: ar.memorization.history }} />
      <Stack.Screen name="students/[id]/memorization/record" options={{ title: ar.memorization.formTitle }} />
      <Stack.Screen name="memorization" options={{ title: ar.memorization.title }} />
      <Stack.Screen name="schedule" options={{ title: ar.schedule.title }} />
      <Stack.Screen name="work/index" options={{ title: ar.work.title }} />
      <Stack.Screen name="work/new" options={{ title: ar.work.newTitle }} />
      <Stack.Screen name="work/[id]/index" options={{ title: ar.work.detailTitle }} />
      <Stack.Screen name="work/[id]/evaluate" options={{ title: ar.work.evaluateTitle }} />
      <Stack.Screen name="work/[id]/edit" options={{ title: ar.work.editTitle }} />
      <Stack.Screen name="work/[id]/schedule" options={{ title: ar.work.detailTitle }} />
      <Stack.Screen name="announcements/index" options={{ title: ar.announcements.title }} />
      <Stack.Screen name="announcements/new" options={{ title: ar.announcements.newTitle }} />
      <Stack.Screen name="announcements/[id]/index" options={{ title: ar.announcements.detailTitle }} />
      <Stack.Screen name="announcements/[id]/edit" options={{ title: ar.announcements.editTitle }} />
      <Stack.Screen name="resources/index" options={{ title: ar.resources.title }} />
      <Stack.Screen name="resources/new" options={{ title: ar.resources.newTitle }} />
      <Stack.Screen name="resources/[id]/index" options={{ title: ar.resources.detailTitle }} />
      <Stack.Screen name="resources/[id]/edit" options={{ title: ar.resources.editTitle }} />
      <Stack.Screen name="notes/index" options={{ title: ar.notes.title }} />
      <Stack.Screen name="notes/new" options={{ title: ar.notes.newTitle }} />
      <Stack.Screen name="notes/[id]/index" options={{ title: ar.notes.detailTitle }} />
      <Stack.Screen name="notes/[id]/edit" options={{ title: ar.notes.editTitle }} />
      <Stack.Screen name="sessions/[id]/index" options={{ title: ar.sessions.detailTitle }} />
      <Stack.Screen name="sessions/[id]/attendance" options={{ title: ar.attendance.title }} />
    </Stack>
  );
}
