import { useLocalSearchParams } from 'expo-router';

import { FeedbackDetailScreen } from '@/features/feedback/feedback-screens';
import { useFeedbackSpace } from '@/features/feedback/use-feedback-space';

export default function FeedbackDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FeedbackDetailScreen space={useFeedbackSpace()} id={id ?? ''} />;
}
