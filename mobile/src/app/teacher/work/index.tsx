import { useLocalSearchParams } from 'expo-router';

import { TeacherWorkScreen } from '@/features/teacher/teacher-work';

export default function TeacherWorkRoute() {
  const { classId, studentId } = useLocalSearchParams<{ classId?: string; studentId?: string }>();
  return <TeacherWorkScreen initialClassId={classId ? String(classId) : undefined} studentId={studentId ? String(studentId) : undefined} />;
}
