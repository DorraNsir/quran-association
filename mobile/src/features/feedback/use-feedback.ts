import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { File as ExpoFile } from 'expo-file-system';
import { Platform } from 'react-native';

import { api, type Page } from '@/services/api';

import type { Feedback, FeedbackDraft, FeedbackSpace, PickedScreenshot } from './feedback-model';

export const feedbackKey = (userId: string, space: FeedbackSpace) => ['feedback', userId, space] as const;
export const feedbackItemKey = (userId: string, space: FeedbackSpace, id: string) => [...feedbackKey(userId, space), 'detail', id] as const;

export const fetchMyFeedbackItem = (space: FeedbackSpace, id: string, signal?: AbortSignal) =>
  api<Feedback>(`/${space}/feedback/${id}`, { signal });

/** «ملاحظاتي»: my latest submissions (the server lists the account's own only). */
export function useMyFeedback(userId: string, space: FeedbackSpace) {
  return useQuery({
    queryKey: [...feedbackKey(userId, space), 'list'],
    queryFn: ({ signal }) => api<Page<Feedback>>(`/${space}/feedback`, { query: { page: 1, pageSize: 50 }, signal }),
    enabled: !!userId,
  });
}

export function useMyFeedbackItem(userId: string, space: FeedbackSpace, id: string) {
  return useQuery({
    queryKey: feedbackItemKey(userId, space, id),
    queryFn: ({ signal }) => fetchMyFeedbackItem(space, id, signal),
    enabled: !!userId && !!id,
  });
}

/** Upload (multipart through expo/fetch: a part exposing bytes()) — POST /files?purpose=FEEDBACK_SCREENSHOT. */
async function uploadScreenshot(shot: PickedScreenshot): Promise<string> {
  const form = new FormData();
  const local = new ExpoFile(shot.uri);
  form.append('file', {
    name: shot.name,
    type: shot.mimeType,
    bytes: async () => new Uint8Array(await local.arrayBuffer()),
  } as unknown as Blob);
  const stored = await api<{ id: string }>('/files', {
    method: 'POST',
    query: { purpose: 'FEEDBACK_SCREENSHOT' },
    form,
    timeoutMs: 120_000,
  });
  return stored.id;
}

/** The technical context the app knows (no device identifiers, no screen contents). */
export function feedbackContext(screenPath?: string) {
  return {
    platform: Platform.OS === 'ios' ? ('IOS' as const) : ('ANDROID' as const),
    ...(Constants.expoConfig?.version ? { appVersion: Constants.expoConfig.version } : {}),
    ...(screenPath ? { screenPath } : {}),
  };
}

/** «إرسال الملاحظة»: the screenshot first (if any), then the feedback; the list refreshed after. */
export function useSendFeedback(userId: string, space: FeedbackSpace) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ draft, screenshot, screenPath }: { draft: FeedbackDraft; screenshot: PickedScreenshot | null; screenPath?: string }) => {
      const screenshotFileId = screenshot ? await uploadScreenshot(screenshot) : undefined;
      return api<Feedback>(`/${space}/feedback`, {
        method: 'POST',
        body: {
          category: draft.category,
          title: draft.title.trim(),
          description: draft.description.trim(),
          ...(screenshotFileId ? { screenshotFileId } : {}),
          ...feedbackContext(screenPath),
        },
      });
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(feedbackItemKey(userId, space, saved.id), saved);
      return queryClient.invalidateQueries({ queryKey: [...feedbackKey(userId, space), 'list'] });
    },
  });
}
