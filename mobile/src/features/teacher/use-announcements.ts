import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { createBody, updateBody, type AnnouncementDraft } from './announcement-model';
import type { Announcement, AnnouncementFilters } from './announcement-types';
import {
  archiveAnnouncement,
  createAnnouncement,
  deleteAnnouncement,
  fetchAnnouncement,
  fetchAnnouncements,
  publishAnnouncement,
  updateAnnouncement,
} from './teacher.api';
import { teacherKey } from './use-teacher-dashboard';

export const ANNOUNCEMENTS_PAGE_SIZE = 20;

export const announcementsKey = (teacherId: string) => [...teacherKey(teacherId), 'announcements'] as const;
export const announcementKey = (teacherId: string, id: string) => [...announcementsKey(teacherId), 'one', id] as const;

/** GET /teacher/announcements, server-filtered and paginated ("load more"). */
export function useAnnouncementPages(teacherId: string, filters: AnnouncementFilters) {
  return useInfiniteQuery({
    queryKey: [...announcementsKey(teacherId), 'list', filters],
    queryFn: ({ pageParam, signal }) => fetchAnnouncements({ ...filters, page: pageParam, pageSize: ANNOUNCEMENTS_PAGE_SIZE }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    enabled: !!teacherId,
  });
}

export function useAnnouncement(teacherId: string, id: string) {
  return useQuery({
    queryKey: announcementKey(teacherId, id),
    queryFn: ({ signal }) => fetchAnnouncement(id, signal),
    enabled: !!teacherId && id.length > 0,
  });
}

/** After a CONFIRMED write: the server's announcement is cached, then every list is refetched. */
export function applySavedAnnouncement(queryClient: QueryClient, teacherId: string, saved: Announcement) {
  queryClient.setQueryData(announcementKey(teacherId, saved.id), saved);
  return queryClient.invalidateQueries({
    queryKey: announcementsKey(teacherId),
    predicate: (q) => !(q.queryKey[3] === 'one' && q.queryKey[4] === saved.id),
  });
}

/** Create (publish now or draft) / edit: never retried, nothing shown as saved before the server says so. */
export function useSaveAnnouncement(teacherId: string, existing?: Announcement) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['save-announcement', existing?.id ?? 'new'],
    mutationFn: async ({ draft, mode }: { draft: AnnouncementDraft; mode: 'PUBLISH_NOW' | 'DRAFT' }) =>
      existing
        ? { announcement: await updateAnnouncement(existing.id, updateBody(existing, draft)), notifiedCount: 0 }
        : createAnnouncement(createBody(draft, mode)),
    onSuccess: (result) => applySavedAnnouncement(queryClient, teacherId, result.announcement),
  });
}

export type AnnouncementAction = 'publish' | 'archive' | 'delete';

/** Publish a draft / archive a published one / delete — confirmed by the server before anything changes on screen. */
export function useAnnouncementAction(teacherId: string, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['announcement-action', id],
    mutationFn: async (action: AnnouncementAction) => {
      if (action === 'publish') return (await publishAnnouncement(id)).announcement;
      if (action === 'archive') return archiveAnnouncement(id);
      await deleteAnnouncement(id);
      return null;
    },
    onSuccess: (saved) =>
      saved
        ? applySavedAnnouncement(queryClient, teacherId, saved)
        : // Deleted: the lists are refetched; the deleted one is never asked for again
          queryClient.invalidateQueries({
            queryKey: announcementsKey(teacherId),
            predicate: (q) => !(q.queryKey[3] === 'one' && q.queryKey[4] === id),
          }),
  });
}
