import { useLocalSearchParams } from 'expo-router';

import { TeacherResourceFormScreen } from '@/features/teacher/teacher-resource-form';

export default function TeacherNewResourceRoute() {
  const { classId } = useLocalSearchParams<{ classId?: string }>();
  return <TeacherResourceFormScreen initialClassId={classId ? String(classId) : undefined} />;
}
