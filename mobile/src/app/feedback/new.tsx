import { FeedbackFormScreen } from '@/features/feedback/feedback-screens';
import { useFeedbackSpace } from '@/features/feedback/use-feedback-space';

export default function NewFeedbackRoute() {
  return <FeedbackFormScreen space={useFeedbackSpace()} />;
}
