import { Stack } from 'expo-router';

import { ar } from '@/i18n/ar';
import { useStackScreenOptions } from '@/theme/navigation';

/**
 * «الملاحظات والاقتراحات» — shared by the teacher and student workspaces (`space` param). Reachable
 * only through the root Stack.Protected guard (a teacher or a student account); the backend
 * authorizes every request again and only ever returns the account's own feedback.
 */
export default function FeedbackLayout() {
  const screenOptions = useStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      <Stack.Screen name="index" options={{ title: ar.feedback.title }} />
      <Stack.Screen name="new" options={{ title: ar.feedback.sendTitle }} />
      <Stack.Screen name="[id]" options={{ title: ar.feedback.detailTitle }} />
    </Stack>
  );
}
