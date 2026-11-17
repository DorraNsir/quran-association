import { useLocalSearchParams } from 'expo-router';

import { TeacherResourceScreen } from '@/features/teacher/teacher-resource';

export default function TeacherResourceRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TeacherResourceScreen resourceId={String(id ?? '')} />;
}
