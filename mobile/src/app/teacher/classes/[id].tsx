import { useLocalSearchParams } from 'expo-router';

import { TeacherClassScreen } from '@/features/teacher/teacher-class';

export default function TeacherClassRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TeacherClassScreen groupClassId={String(id ?? '')} />;
}
