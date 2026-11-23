import { useLocalSearchParams } from 'expo-router';

import { TeacherRecitationsScreen } from '@/features/teacher/teacher-recitations';

/** «متابعة العرضات»: ?studentId=…&surah=… opens a student with one surah expanded («سجل العرضات»). */
export default function TeacherRecitationsRoute() {
  const { studentId, surah } = useLocalSearchParams<{ studentId?: string; surah?: string }>();
  return (
    <TeacherRecitationsScreen
      key={studentId ? String(studentId) : ''}
      initialStudentId={studentId ? String(studentId) : undefined}
      initialSurah={surah && /^\d+$/.test(surah) && Number(surah) >= 1 && Number(surah) <= 114 ? Number(surah) : undefined}
    />
  );
}
