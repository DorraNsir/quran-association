import { useLocalSearchParams } from 'expo-router';

import { TeacherNoteScreen } from '@/features/teacher/teacher-note';

export default function TeacherNoteRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TeacherNoteScreen noteId={String(id ?? '')} />;
}
