import { useLocalSearchParams } from 'expo-router';

import { TeacherWorkProgramScreen } from '@/features/teacher/teacher-work-program';

export default function TeacherWorkProgramRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TeacherWorkProgramScreen programId={String(id ?? '')} />;
}
