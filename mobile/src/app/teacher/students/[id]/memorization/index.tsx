import { useLocalSearchParams } from 'expo-router';

import { TeacherStudentMemorizationScreen } from '@/features/teacher/teacher-student-memorization';

export default function TeacherStudentMemorizationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TeacherStudentMemorizationScreen studentId={String(id ?? '')} />;
}
