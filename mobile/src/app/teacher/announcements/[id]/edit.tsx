import { useLocalSearchParams } from 'expo-router';

import { TeacherAnnouncementFormScreen } from '@/features/teacher/teacher-announcement-form';

export default function TeacherEditAnnouncementRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TeacherAnnouncementFormScreen announcementId={String(id ?? '')} />;
}
