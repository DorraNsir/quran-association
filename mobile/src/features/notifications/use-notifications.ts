import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, type AppStateStatus } from 'react-native';

import { ar } from '@/i18n/ar';
import { ApiError, errorMessage } from '@/services/api';

import { fetchAnnouncement, fetchResource, fetchTeacherSession, fetchTeacherWorkspace } from '@/features/teacher/teacher.api';
import { announcementKey } from '@/features/teacher/use-announcements';
import { resourceKey } from '@/features/teacher/use-resources';
import { teacherKey } from '@/features/teacher/use-teacher-dashboard';
import type { TeacherWorkspace } from '@/features/teacher/types';

import { markPagesRead, patchPages, teacherNotificationTarget, type TargetCheck } from './notification-model';
import type { AppNotification } from './notification-types';
import { fetchNotifications, fetchUnreadCount, markAllNotificationsRead, markNotificationRead } from './notifications.api';

const t = ar.notifications;

export const NOTIFICATIONS_PAGE_SIZE = 20;
/** Polling, not push (as the web bell): every 30 s, only while the app is in the foreground. */
export const UNREAD_POLL_MS = 30_000;

/*
 * Every notification query is keyed by the ACCOUNT (user id): another
 * account signed in on this phone never sees a cached count or list of the
 * previous one. Logout / session end also clears the whole cache
 * (AuthProvider → queryClient.clear()).
 */
export const notificationsKey = (userId: string) => ['notifications', userId] as const;
export const notificationListKey = (userId: string, unreadOnly: boolean) => [...notificationsKey(userId), 'list', { unreadOnly }] as const;
export const unreadCountKey = (userId: string) => [...notificationsKey(userId), 'unread-count'] as const;

/** true while the app is in the foreground (React Native AppState). */
export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => setActive(status === 'active'));
    return () => subscription.remove();
  }, []);
  return active;
}

/**
 * GET /notifications/unread-count. With `poll` (the bell — ONE observer, so
 * one timer): refetched every 30 s while the app is active, and at once when
 * it comes back to the foreground; no timer at all in the background or
 * without an account (signed out → userId '' → disabled).
 */
export function useUnreadCount(userId: string, { poll = false }: { poll?: boolean } = {}) {
  const active = useAppActive();
  const query = useQuery({
    queryKey: unreadCountKey(userId),
    queryFn: ({ signal }) => fetchUnreadCount(signal),
    select: (r) => r.count,
    enabled: userId.length > 0,
    refetchInterval: poll && active ? UNREAD_POLL_MS : false,
    refetchIntervalInBackground: false,
    // The foreground refetch is explicit below (not twice through focusManager)
    refetchOnWindowFocus: false,
  });
  const wasActive = useRef(active);
  const { refetch } = query;
  useEffect(() => {
    if (poll && active && !wasActive.current && userId) void refetch();
    wasActive.current = active;
  }, [poll, active, userId, refetch]);
  return query;
}

/** GET /notifications (newest first), all or unread only, "load more" pages. */
export function useNotificationPages(userId: string, unreadOnly: boolean) {
  return useInfiniteQuery({
    queryKey: notificationListKey(userId, unreadOnly),
    queryFn: ({ pageParam, signal }) => fetchNotifications({ page: pageParam, pageSize: NOTIFICATIONS_PAGE_SIZE, unreadOnly }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    enabled: userId.length > 0,
  });
}

/** After the server CONFIRMED a read: lists patched, count lowered at once, then both refetched. */
function applyRead(queryClient: QueryClient, userId: string, saved: AppNotification) {
  queryClient.setQueriesData({ queryKey: [...notificationsKey(userId), 'list'] }, (d: Parameters<typeof patchPages>[0]) => patchPages(d, saved));
  queryClient.setQueryData(unreadCountKey(userId), (c: { count: number } | undefined) => (c ? { count: Math.max(0, c.count - 1) } : c));
  return queryClient.invalidateQueries({ queryKey: notificationsKey(userId) });
}

/** PATCH /notifications/:id/read — nothing changes on screen before the server answers. */
export function useMarkNotificationRead(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['notification-read', userId],
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: (saved) => applyRead(queryClient, userId, saved),
  });
}

/** PATCH /notifications/read-all — then every loaded row is read and the badge is gone. */
export function useMarkAllNotificationsRead(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['notifications-read-all', userId],
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => {
      const readAt = new Date().toISOString();
      queryClient.setQueriesData({ queryKey: [...notificationsKey(userId), 'list'] }, (d: Parameters<typeof markPagesRead>[0]) =>
        markPagesRead(d, readAt),
      );
      queryClient.setQueryData(unreadCountKey(userId), { count: 0 });
      return queryClient.invalidateQueries({ queryKey: notificationsKey(userId) });
    },
  });
}

/**
 * Is the content STILL the teacher's now? The same request (and cache key) as
 * the screen it opens — so the screen shows at once; the API answers 404/403
 * for content the account lost, the workspace no longer lists a student or a
 * class that moved away.
 */
async function stillMine(queryClient: QueryClient, teacherId: string, check: TargetCheck): Promise<boolean> {
  const base = { staleTime: 0, retry: false } as const;
  switch (check.kind) {
    case 'resource':
      await queryClient.fetchQuery({ ...base, queryKey: resourceKey(teacherId, check.id), queryFn: ({ signal }) => fetchResource(check.id, signal) });
      return true;
    case 'announcement':
      await queryClient.fetchQuery({
        ...base,
        queryKey: announcementKey(teacherId, check.id),
        queryFn: ({ signal }) => fetchAnnouncement(check.id, signal),
      });
      return true;
    case 'session':
      await queryClient.fetchQuery({
        ...base,
        queryKey: [...teacherKey(teacherId), 'sessions', 'detail', check.id],
        queryFn: ({ signal }) => fetchTeacherSession(check.id, signal),
      });
      return true;
    case 'workspace': {
      const workspace = await queryClient.fetchQuery<TeacherWorkspace>({
        ...base,
        queryKey: [...teacherKey(teacherId), 'workspace'],
        queryFn: ({ signal }) => fetchTeacherWorkspace(signal),
      });
      return workspace[check.list].some((x) => x.id === check.id);
    }
  }
}

/** A message the teacher must see (a native dialog: visible wherever the row was in the list). */
const tell = (message: string) => Alert.alert(t.title, message);

/**
 * Opening a notification: marked read FIRST (a failure is shown, the row
 * stays unread, nothing opens), then followed only to a verified mobile
 * screen — deleted content, a subject the app has no screen for, or content
 * this account lost each get their own Arabic message. One at a time: a
 * second tap while one opens is ignored.
 */
export function useOpenNotification(userId: string, teacherId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const markRead = useMarkNotificationRead(userId);
  const busy = useRef(false);
  const [opening, setOpening] = useState<string | null>(null);

  async function open(n: AppNotification) {
    if (busy.current) return;
    busy.current = true;
    setOpening(n.id);
    try {
      if (!n.isRead) {
        try {
          await markRead.mutateAsync(n.id);
        } catch (error) {
          tell(`${t.markReadFailed}\n${errorMessage(error)}`);
          return;
        }
      }
      const target = teacherNotificationTarget(n);
      if (target.kind === 'none') return;
      if (target.kind === 'gone') return tell(t.gone);
      if (target.kind === 'unsupported') return tell(t.unsupported);
      let mine: boolean;
      try {
        mine = await stillMine(queryClient, teacherId, target.check);
      } catch (error) {
        // Gone (404) or no longer this account's (403): one message
        const lost = error instanceof ApiError && (error.status === 404 || error.status === 403);
        return tell(lost ? t.goneForMe : errorMessage(error));
      }
      if (!mine) return tell(t.goneForMe);
      router.push(target.href);
    } finally {
      busy.current = false;
      setOpening(null);
    }
  }

  return { open, opening };
}
