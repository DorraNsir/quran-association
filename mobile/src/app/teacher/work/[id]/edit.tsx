import { useLocalSearchParams } from 'expo-router';

import { TeacherWorkFormScreen } from '@/features/teacher/teacher-work-form';

export default function TeacherWorkEditRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TeacherWorkFormScreen programId={String(id ?? '')} />;
}
