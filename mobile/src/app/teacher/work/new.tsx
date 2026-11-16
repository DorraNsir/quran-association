import { useLocalSearchParams } from 'expo-router';

import { TeacherWorkFormScreen } from '@/features/teacher/teacher-work-form';

export default function TeacherNewWorkRoute() {
  const { studentId } = useLocalSearchParams<{ studentId?: string }>();
  return <TeacherWorkFormScreen studentId={studentId ? String(studentId) : undefined} />;
}
