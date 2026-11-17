import { useLocalSearchParams } from 'expo-router';

import { TeacherAnnouncementScreen } from '@/features/teacher/teacher-announcement';

export default function TeacherAnnouncementRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TeacherAnnouncementScreen announcementId={String(id ?? '')} />;
}
