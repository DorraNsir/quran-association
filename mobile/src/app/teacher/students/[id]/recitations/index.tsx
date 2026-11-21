import { useLocalSearchParams } from 'expo-router';

import { TeacherStudentRecitationsScreen } from '@/features/teacher/teacher-student-recitations';

export default function TeacherStudentRecitationsRoute() {
  const { id, surah } = useLocalSearchParams<{ id: string; surah?: string }>();
  return (
    <TeacherStudentRecitationsScreen
      studentId={String(id ?? '')}
      initialSurah={surah && /^\d+$/.test(surah) ? Number(surah) : undefined}
    />
  );
}
