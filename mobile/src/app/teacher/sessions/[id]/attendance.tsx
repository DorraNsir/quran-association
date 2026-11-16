import { useLocalSearchParams } from 'expo-router';

import { TeacherAttendanceScreen } from '@/features/teacher/teacher-attendance';

export default function TeacherSessionAttendanceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TeacherAttendanceScreen sessionId={String(id ?? '')} />;
}
