import { api, type Query } from '@/services/api';

import type { SaveBody } from './attendance-draft';

import type {
  AttendanceSummary,
  ClassMemorization,
  MemorizationRecord,
  Page,
  Semester,
  Session,
  SessionAttendance,
  SessionStatus,
  TeacherWorkspace,
} from './types';

/*
 * Teacher endpoints (all @TeacherApi(): TEACHER role + linked, active
 * teacher profile; the teacher is always taken from the access token, never
 * from the query). Read-only in this phase.
 */

/** GET /api/teacher/workspace — my non-archived classes, their groups, branches, rooms, slots and current students. */
export const fetchTeacherWorkspace = (signal?: AbortSignal) =>
  api<TeacherWorkspace>('/teacher/workspace', { signal });

/** GET /api/teacher/sessions — my sessions (team snapshot), paginated. */
export const fetchTeacherSessions = (
  query: {
    from?: string;
    to?: string;
    status?: SessionStatus;
    groupClassId?: string;
    order?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
  },
  signal?: AbortSignal,
) => api<Page<Session>>('/teacher/sessions', { query: query as Query, signal });

/**
 * GET /api/teacher/attendance/summary — MY attendance as a teacher, over the
 * sessions I taught (recorded by any member of the session's team — me
 * included — or by the administration).
 */
export const fetchTeacherAttendanceSummary = (
  query: { academicYearId?: string },
  signal?: AbortSignal,
) =>
  api<AttendanceSummary>('/teacher/attendance/summary', { query: query as Query, signal });

/** GET /api/teacher/group-classes/:id/memorization — one of my classes for a semester. */
export const fetchClassMemorization = (
  groupClassId: string,
  query: { academicYearId: string; semester: Semester },
  signal?: AbortSignal,
) =>
  api<ClassMemorization>(`/teacher/group-classes/${encodeURIComponent(groupClassId)}/memorization`, {
    query: query as Query,
    signal,
  });

/** GET /api/teacher/sessions/:id — one of MY sessions (403 / 404 SESSION_NOT_FOUND otherwise). */
export const fetchTeacherSession = (id: string, signal?: AbortSignal) =>
  api<Session>(`/teacher/sessions/${encodeURIComponent(id)}`, { signal });

/**
 * GET /api/teacher/sessions/:id/attendance — the roster of one of MY sessions
 * (team snapshot; 403 / 404 otherwise), already limited to MY students in a
 * shared session where I am an assistant. Read-only in this phase.
 */
export const fetchSessionAttendance = (sessionId: string, signal?: AbortSignal) =>
  api<SessionAttendance>(`/teacher/sessions/${encodeURIComponent(sessionId)}/attendance`, { signal });

/**
 * PUT /api/teacher/sessions/:id/attendance — saves ONLY the listed rows
 * (all-or-nothing): students in `records`, members of the session's team in
 * `teachers`; answers with the fresh roster.
 */
export const saveSessionAttendance = (sessionId: string, body: SaveBody) =>
  api<SessionAttendance>(`/teacher/sessions/${encodeURIComponent(sessionId)}/attendance`, {
    method: 'PUT',
    body,
  });

/**
 * GET /api/teacher/students/:id/memorization — one semester of a student I
 * teach (or taught during that semester): the record, or null when not
 * recorded yet; 403 when the student is outside my classes for that period.
 */
export const fetchStudentMemorization = (
  studentId: string,
  query: { academicYearId: string; semester: Semester },
  signal?: AbortSignal,
) =>
  api<MemorizationRecord | null | undefined>(`/teacher/students/${encodeURIComponent(studentId)}/memorization`, {
    query: query as Query,
    signal,
    // «null» may arrive as an empty body: always null, never undefined
  }).then((record) => record ?? null);

/**
 * PUT /api/teacher/students/:id/memorization — sets THE semester's last
 * memorized surah (creates or updates the single record; UpsertMemorizationDto:
 * academicYearId, semester FIRST|SECOND, lastMemorizedSurahNumber 1–114).
 * The server records who updated it. No concurrency check, no delete endpoint.
 */
export const saveStudentMemorization = (
  studentId: string,
  body: { academicYearId: string; semester: Semester; lastMemorizedSurahNumber: number },
) =>
  api<MemorizationRecord>(`/teacher/students/${encodeURIComponent(studentId)}/memorization`, {
    method: 'PUT',
    body,
  });
