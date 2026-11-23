import { useLocalSearchParams } from 'expo-router';

import { useSession } from '@/features/auth/auth-provider';
import { canUseWorkspace } from '@/features/auth/workspaces';

import type { FeedbackSpace } from './feedback-model';

/** The workspace the feedback screens act for: the `space` param when the account may use it. */
export function useFeedbackSpace(): FeedbackSpace {
  const { space } = useLocalSearchParams<{ space?: string }>();
  const { user } = useSession();
  const asked: FeedbackSpace | null = space === 'teacher' || space === 'student' ? space : null;
  if (asked && user && canUseWorkspace(user, asked)) return asked;
  return user && canUseWorkspace(user, 'teacher') ? 'teacher' : 'student';
}
