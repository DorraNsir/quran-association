import { api, type Query } from '@/services/api';

import type { SaveBody } from './attendance-draft';
import type {
  EligibleSession,
  EvaluationLine,
  NewWorkItem,
  WorkItemPatch,
  WorkProgram,
  WorkProgramFilters,
} from './work-types';

import type {
  AttendanceSummary,
  ClassMemorization,
  MemorizationRecord,
  Page,
  Semester,
  Session,
  SessionAttendance,
  SessionStatus,
  TeacherNote,
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

/*
 * «ملاحظاتي» — /api/teacher/notes (TeacherWorkspaceController): the signed-in
 * teacher's OWN private notes. The owner comes from the token; another
 * teacher's note answers 404 TEACHER_NOTE_NOT_FOUND. A note is only its
 * `content` (1–2000 characters after trimming); the dates are the server's.
 * There is no GET by id: a note is read from the list.
 */
const NOTES_PAGE_SIZE = 100; // the API's MAX_PAGE_SIZE
const NOTES_MAX_PAGES = 50;

/** GET /api/teacher/notes, every page (most recently updated first) — as the web's fetchAll. */
export async function fetchAllTeacherNotes(signal?: AbortSignal): Promise<TeacherNote[]> {
  const notes: TeacherNote[] = [];
  for (let page = 1; page <= NOTES_MAX_PAGES; page++) {
    const result = await api<Page<TeacherNote>>('/teacher/notes', { query: { page, pageSize: NOTES_PAGE_SIZE }, signal });
    notes.push(...result.data);
    if (page >= result.meta.totalPages) break;
  }
  return notes;
}

/** POST /api/teacher/notes — CreateTeacherNoteDto { content }. */
export const createTeacherNote = (content: string) =>
  api<TeacherNote>('/teacher/notes', { method: 'POST', body: { content } });

/** PATCH /api/teacher/notes/:id — UpdateTeacherNoteDto { content } (my note only). */
export const updateTeacherNote = (id: string, content: string) =>
  api<TeacherNote>(`/teacher/notes/${encodeURIComponent(id)}`, { method: 'PATCH', body: { content } });

/** DELETE /api/teacher/notes/:id — 204 (my note only). */
export const deleteTeacherNote = (id: string) =>
  api<void>(`/teacher/notes/${encodeURIComponent(id)}`, { method: 'DELETE' });

/*
 * «متابعة برنامج العمل» — /api/teacher/work-programs and /work-items
 * (TeacherWorkFollowupController). The server checks on every call that I am
 * in the session's TEAM SNAPSHOT (supervisor or assistant alike) and, in a
 * shared session, that the student is of a class I manage there. Nothing is
 * ever deleted (a dropped item is evaluated CANCELLED). Writes carry the
 * versions they were made from: a stale write answers 409 instead of
 * overwriting someone else's change.
 */
const WORK = '/teacher/work-programs';

const clean = (q: object): Query =>
  Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== '')) as Query;

/** GET — my programs (filters, pagination), each with its items and server progress. */
export const fetchWorkPrograms = (filters: WorkProgramFilters & { page: number; pageSize: number }, signal?: AbortSignal) =>
  api<Page<WorkProgram>>(WORK, { query: clean(filters), signal });

/** GET /:id — 404 also for a program outside my scope. */
export const fetchWorkProgram = (id: string, signal?: AbortSignal) =>
  api<WorkProgram>(`${WORK}/${encodeURIComponent(id)}`, { signal });

/** GET eligible-sessions — the student's existing UPCOMING sessions that may receive work (never a free date). */
export const fetchEligibleSessions = (studentId: string, afterSessionId: string | undefined, signal?: AbortSignal) =>
  api<EligibleSession[]>(`${WORK}/eligible-sessions`, { query: clean({ studentId, afterSessionId }), signal });

/** POST — CreateWorkProgramDto (one program per student per session; 409 WORK_PROGRAM_EXISTS + programId). */
export const createWorkProgram = (body: { studentId: string; sessionId: string; generalNotes: string | null; items: NewWorkItem[] }) =>
  api<WorkProgram>(WORK, { method: 'POST', body });

/** PATCH /:id — UpdateWorkProgramDto: notes (+ program version), changed saved items (+ their versions), new items. */
export const updateWorkProgram = (
  id: string,
  body: { version?: number; generalNotes?: string | null; items?: WorkItemPatch[]; newItems?: NewWorkItem[] },
) => api<WorkProgram>(`${WORK}/${encodeURIComponent(id)}`, { method: 'PATCH', body });

/** PATCH /:id/evaluation — «حفظ التقييم»: the changed items (+ notes), atomically. */
export const evaluateWorkProgram = (
  id: string,
  body: { items: EvaluationLine[]; version?: number; generalNotes?: string | null },
) => api<WorkProgram>(`${WORK}/${encodeURIComponent(id)}/evaluation`, { method: 'PATCH', body });

/** POST /work-items/:id/transfer | next-recitation — answers with the TARGET program. */
export const scheduleWorkItem = (itemId: string, mode: 'carry' | 'next', targetSessionId: string, description?: string) =>
  api<WorkProgram>(`/teacher/work-items/${encodeURIComponent(itemId)}/${mode === 'carry' ? 'transfer' : 'next-recitation'}`, {
    method: 'POST',
    body: mode === 'carry' ? { targetSessionId } : { targetSessionId, description },
  });
