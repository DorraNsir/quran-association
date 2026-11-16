import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import type { SessionQuery } from './sessions-model';
import { fetchSessionAttendance, fetchTeacherSession, fetchTeacherSessions } from './teacher.api';
import { teacherKey } from './use-teacher-dashboard';

/** Sessions per page: bounded, never the whole history at once. */
export const SESSIONS_PAGE_SIZE = 20;

/**
 * GET /teacher/sessions, page by page. The next page is only requested when
 * the teacher asks for it ("load more"). `query === null` (an empty period)
 * requests nothing.
 */
export function useTeacherSessionPages(teacherId: string, query: SessionQuery | null) {
  return useInfiniteQuery({
    queryKey: [...teacherKey(teacherId), 'sessions', 'list', query],
    queryFn: ({ pageParam, signal }) =>
      fetchTeacherSessions({ ...query!, page: pageParam, pageSize: SESSIONS_PAGE_SIZE }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    enabled: query !== null,
  });
}

/** GET /teacher/sessions/:id — one of MY sessions. */
export function useTeacherSession(teacherId: string, sessionId: string) {
  return useQuery({
    queryKey: [...teacherKey(teacherId), 'sessions', 'detail', sessionId],
    queryFn: ({ signal }) => fetchTeacherSession(sessionId, signal),
    enabled: sessionId.length > 0,
  });
}

/**
 * «حضور غير مكتمل» count: ONE small request (pageSize 1, only meta.total is
 * read) with the same query as the tab, shared by the tab chip.
 */
export function usePendingCount(teacherId: string, query: SessionQuery | null) {
  return useQuery({
    queryKey: [...teacherKey(teacherId), 'sessions', 'pending-count', query],
    queryFn: ({ signal }) => fetchTeacherSessions({ ...query!, page: 1, pageSize: 1 }, signal),
    enabled: query !== null,
    select: (page) => page.meta.total,
  });
}

/** GET /teacher/sessions/:id/attendance — the roster in MY scope (read-only here). */
export function useSessionAttendance(teacherId: string, sessionId: string) {
  return useQuery({
    queryKey: [...teacherKey(teacherId), 'sessions', 'attendance', sessionId],
    queryFn: ({ signal }) => fetchSessionAttendance(sessionId, signal),
    enabled: sessionId.length > 0,
  });
}
