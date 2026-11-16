import { useLocalSearchParams } from 'expo-router';

import { TeacherWorkEvaluateScreen } from '@/features/teacher/teacher-work-evaluate';

export default function TeacherWorkEvaluateRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TeacherWorkEvaluateScreen programId={String(id ?? '')} />;
}
