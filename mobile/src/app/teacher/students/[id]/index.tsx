import { useLocalSearchParams } from 'expo-router';

import { TeacherStudentScreen } from '@/features/teacher/teacher-student';

export default function TeacherStudentRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TeacherStudentScreen studentId={String(id ?? '')} />;
}
