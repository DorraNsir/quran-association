import { FeedbackListScreen } from '@/features/feedback/feedback-screens';
import { useFeedbackSpace } from '@/features/feedback/use-feedback-space';

export default function FeedbackRoute() {
  return <FeedbackListScreen space={useFeedbackSpace()} />;
}
