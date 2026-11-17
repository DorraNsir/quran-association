import { useLocalSearchParams } from 'expo-router';

import { TeacherResourcesScreen } from '@/features/teacher/teacher-resources';

export default function TeacherResourcesRoute() {
  const { classId } = useLocalSearchParams<{ classId?: string }>();
  return <TeacherResourcesScreen initialClassId={classId ? String(classId) : undefined} />;
}
