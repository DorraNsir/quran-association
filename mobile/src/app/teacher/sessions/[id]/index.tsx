import { useLocalSearchParams } from 'expo-router';

import { TeacherSessionScreen } from '@/features/teacher/teacher-session';

export default function TeacherSessionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TeacherSessionScreen sessionId={String(id ?? '')} />;
}
