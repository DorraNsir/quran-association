import { useLocalSearchParams } from 'expo-router';

import { TeacherResourceFormScreen } from '@/features/teacher/teacher-resource-form';

export default function TeacherEditResourceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TeacherResourceFormScreen resourceId={String(id ?? '')} />;
}
