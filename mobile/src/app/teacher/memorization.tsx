import { useLocalSearchParams } from 'expo-router';

import { TeacherMemorizationScreen } from '@/features/teacher/teacher-memorization';

export default function TeacherMemorizationRoute() {
  const { classId } = useLocalSearchParams<{ classId?: string }>();
  return <TeacherMemorizationScreen initialClassId={classId ? String(classId) : undefined} />;
}
