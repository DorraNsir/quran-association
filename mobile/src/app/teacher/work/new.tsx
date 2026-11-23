import { useLocalSearchParams } from 'expo-router';

import { TeacherWorkFormScreen } from '@/features/teacher/teacher-work-form';

export default function TeacherNewWorkRoute() {
  const { studentId, surah } = useLocalSearchParams<{ studentId?: string; surah?: string }>();
  const n = surah && /^\d+$/.test(surah) && Number(surah) >= 1 && Number(surah) <= 114 ? Number(surah) : undefined;
  return <TeacherWorkFormScreen studentId={studentId ? String(studentId) : undefined} surah={n} />;
}
