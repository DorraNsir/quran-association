import { useLocalSearchParams } from 'expo-router';

import { TeacherMemorizationFormScreen } from '@/features/teacher/teacher-memorization-form';

export default function TeacherMemorizationRecordRoute() {
  const { id, semester } = useLocalSearchParams<{ id: string; semester?: string }>();
  return <TeacherMemorizationFormScreen studentId={String(id ?? '')} semesterParam={semester ? String(semester) : undefined} />;
}
