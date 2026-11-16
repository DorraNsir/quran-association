import { useLocalSearchParams } from 'expo-router';

import { TeacherNoteFormScreen } from '@/features/teacher/teacher-note-form';

export default function TeacherEditNoteRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TeacherNoteFormScreen noteId={String(id ?? '')} />;
}
