import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/services/api';

import type { SaveBody } from './attendance-draft';
import { saveSessionAttendance } from './teacher.api';
import type { SessionAttendance } from './types';
import { teacherKey } from './use-teacher-dashboard';

export const attendanceKey = (teacherId: string, sessionId: string) =>
  [...teacherKey(teacherId), 'sessions', 'attendance', sessionId] as const;

export type SaveErrorKind =
  /** 409 ATTENDANCE_CHANGED — someone changed a saved value meanwhile */
  | 'conflict'
  /** The server no longer allows (part of) it: window closed, cancelled, not started, outside my scope… */
  | 'locked'
  /** 400 — refused values (e.g. a student no longer in the session) */
  | 'invalid'
  /** No answer — the edits are kept, save again when back online */
  | 'offline'
  | 'unknown';

const LOCKED = new Set([
  'ATTENDANCE_CORRECTION_WINDOW_CLOSED',
  'ATTENDANCE_SESSION_CANCELLED',
  'ATTENDANCE_SESSION_FUTURE',
  'ATTENDANCE_STUDENT_NOT_ALLOWED',
  // A team member no longer accepted for this session (team changed meanwhile)
  'ATTENDANCE_TEACHER_NOT_IN_SESSION',
]);

/** Every failure keeps the local edits; the kind decides what the screen offers next. */
export function classifySaveError(error: unknown): SaveErrorKind {
  if (!(error instanceof ApiError)) return 'unknown';
  if (error.isNetwork) return 'offline';
  if (error.code === 'ATTENDANCE_CHANGED') return 'conflict';
  if (LOCKED.has(error.code) || error.isForbidden || error.isNotFound) return 'locked';
  // Other 400s (e.g. a student no longer in the session)
  if (error.status === 400) return 'invalid';
  return 'unknown';
}

/**
 * After a CONFIRMED save: the server's answer becomes this roster's data (it is
 * the authoritative result, not an optimistic guess), then every other query
 * that shows sessions or their attendance progress is refreshed — session
 * details and status (it may now be COMPLETED), lists, the «حضور غير مكتمل»
 * count and the dashboard.
 */
export function applySavedAttendance(
  queryClient: QueryClient,
  teacherId: string,
  sessionId: string,
  saved: SessionAttendance,
) {
  const key = attendanceKey(teacherId, sessionId);
  queryClient.setQueryData(key, saved);
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: [...teacherKey(teacherId), 'sessions'],
      predicate: (q) => !(q.queryKey[3] === 'attendance' && q.queryKey[4] === sessionId),
    }),
    // «حضوري» on the dashboard: my own attendance may have just been recorded
    queryClient.invalidateQueries({ queryKey: [...teacherKey(teacherId), 'attendance-summary'] }),
  ]);
}

/** The save mutation: never retried automatically, no optimistic update. */
export function useSaveAttendance(teacherId: string, sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ['save-attendance', sessionId],
    mutationFn: (body: SaveBody) => saveSessionAttendance(sessionId, body),
    onSuccess: (saved) => applySavedAttendance(queryClient, teacherId, sessionId, saved),
  });
}
