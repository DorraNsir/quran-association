import { useLocalSearchParams } from 'expo-router';

import { TeacherWorkScheduleScreen } from '@/features/teacher/teacher-work-schedule';

export default function TeacherWorkScheduleRoute() {
  const { id, itemId, mode } = useLocalSearchParams<{ id: string; itemId?: string; mode?: string }>();
  return (
    <TeacherWorkScheduleScreen programId={String(id ?? '')} itemId={String(itemId ?? '')} mode={mode === 'next' ? 'next' : 'carry'} />
  );
}
