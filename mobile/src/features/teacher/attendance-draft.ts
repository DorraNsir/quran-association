import type { AttendanceStatus, RosterStudent, RosterTeacher, SessionAttendance } from './types';

/*
 * Local edits of a session's attendance — students AND the session's teaching
 * team — before saving, and the PUT body built from them. Contract of
 * PUT /api/teacher/sessions/:id/attendance (backend attendance.dto.ts
 * SaveAttendanceDto, attendance.service.ts save()), the same one the web
 * AttendanceTaker uses:
 *  - `records` (students) and/or `teachers` (team members), at least one
 *    entry; only LISTED rows are created/updated, nothing is marked absent
 *    by default (partial saves are allowed); all-or-nothing;
 *  - a status cannot be removed once saved (no "unrecord");
 *  - `note`: omit to keep, null/"" to clear, ≤ 300 characters;
 *  - `expectedStatus`: the saved status we started from (null = not
 *    recorded) — 409 ATTENDANCE_CHANGED if someone changed it meanwhile;
 *  - students: an assistant of a shared session writes only their assigned
 *    classes' students (403 ATTENDANCE_STUDENT_NOT_ALLOWED);
 *  - teachers: ANY member of the session's team (supervisor or assistant)
 *    may record EVERY member, themselves included — no student scope applies
 *    (ATTENDANCE_TEACHER_NOT_IN_SESSION otherwise);
 *  - both: not before the start / not when cancelled; changing a SAVED
 *    value only within the teacher correction window (`correctable`);
 *  - the session becomes COMPLETED on the server when its whole expected
 *    STUDENT roster is recorded — a teachers-only save never completes it,
 *    and nothing here computes it.
 */

export const NOTE_MAX = 300;

export const STATUSES: readonly AttendanceStatus[] = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED'];

/** One attendance row, student or teacher, as saved on the server. */
export interface Subject {
  id: string;
  status: AttendanceStatus | null;
  note: string | null;
}

export const studentSubject = (s: RosterStudent): Subject => ({ id: s.studentId, status: s.status, note: s.note });
export const teacherSubject = (t: RosterTeacher): Subject => ({ id: t.teacherId, status: t.status, note: t.note });

export interface DraftEntry {
  status: AttendanceStatus;
  /** undefined = note untouched (kept on the server) */
  note?: string;
}

/** Only the rows the teacher touched (by id); everything else is the server's value. */
export type Draft = ReadonlyMap<string, DraftEntry>;

/** The two parts of one save, as the web: students and the session's team. */
export interface AttendanceDrafts {
  students: Draft;
  teachers: Draft;
}

export const EMPTY_DRAFTS: AttendanceDrafts = { students: new Map(), teachers: new Map() };

const normNote = (note: string | null | undefined) => {
  const trimmed = (note ?? '').trim();
  return trimmed.length ? trimmed : null;
};

/** Recording open: the lesson has started and is not cancelled (server `editable`). */
const recordingOpen = (dto: SessionAttendance) => dto.editable && dto.sessionStatus !== 'CANCELLED';

/**
 * May the teacher set this student's status now? All from the server:
 *  - recording open, and my scope (the server filters the list; checked again);
 *  - a student who counts (`expected`), OR one already recorded who no longer
 *    counts — the web and the API let that saved record be corrected; a
 *    non-counted student WITHOUT a record is never created;
 *  - a SAVED status may change only while `correctable`.
 */
export function canEditStudent(dto: SessionAttendance, s: RosterStudent): boolean {
  if (!recordingOpen(dto)) return false;
  if (!s.expected && s.status === null) return false;
  if (!dto.scope.allStudents && !(s.groupClass && dto.scope.groupClassIds.includes(s.groupClass.id))) return false;
  return s.status === null || dto.correctable;
}

/**
 * May the teacher set this team member's status now? Every member of the
 * session's team (supervisor, assistants, themselves, or a former member
 * already recorded) — no student scope; same start / cancellation / correction
 * rules as students.
 */
export function canEditTeacher(dto: SessionAttendance, t: RosterTeacher): boolean {
  if (!recordingOpen(dto)) return false;
  return t.status === null || dto.correctable;
}

/** The value shown for a row: the local edit, else the server's. */
export function effective(draft: Draft, s: Subject): { status: AttendanceStatus | null; note: string | null } {
  const entry = draft.get(s.id);
  if (!entry) return { status: s.status, note: s.note };
  return { status: entry.status, note: entry.note === undefined ? s.note : normNote(entry.note) };
}

/** True when the entry would change nothing on the server. */
function isNoop(s: Subject, entry: DraftEntry): boolean {
  const noteSame = entry.note === undefined || normNote(entry.note) === normNote(s.note);
  return s.status === entry.status && noteSame;
}

function withEntry(draft: Draft, s: Subject, entry: DraftEntry | null): Draft {
  const next = new Map(draft);
  if (entry === null || isNoop(s, entry)) next.delete(s.id);
  else next.set(s.id, entry);
  return next;
}

/** Select a status. Tapping the selected status of an UNSAVED edit clears that edit. */
export function setStatus(draft: Draft, s: Subject, status: AttendanceStatus): Draft {
  const current = draft.get(s.id);
  if (current && current.status === status && s.status === null) return withEntry(draft, s, null);
  return withEntry(draft, s, { status, note: current?.note });
}

/** Set a note (it needs a status: a new one goes with the first recording). */
export function setNote(draft: Draft, s: Subject, note: string): Draft {
  const status = draft.get(s.id)?.status ?? s.status;
  if (!status) return draft;
  return withEntry(draft, s, { status, note: note.slice(0, NOTE_MAX) });
}

/** «تحديد الباقين حاضرين» (students only, like the web): unrecorded, editable, expected → PRESENT. */
export function markRestPresent(draft: Draft, dto: SessionAttendance): Draft {
  let next = draft;
  for (const s of dto.students) {
    const subject = studentSubject(s);
    if (s.expected && canEditStudent(dto, s) && effective(next, subject).status === null)
      next = withEntry(next, subject, { status: 'PRESENT' });
  }
  return next;
}

interface SaveRow {
  status: AttendanceStatus;
  expectedStatus: AttendanceStatus | null;
  note?: string | null;
}
export interface SaveRecord extends SaveRow {
  studentId: string;
}
export interface SaveTeacherRecord extends SaveRow {
  teacherId: string;
}
export interface SaveBody {
  records?: SaveRecord[];
  teachers?: SaveTeacherRecord[];
}

/** A changed, still-allowed row → its PUT entry (note only when edited). */
function changeOf(subject: Subject, entry: DraftEntry | undefined, allowed: boolean): SaveRow | null {
  if (!entry || isNoop(subject, entry) || !allowed) return null;
  return {
    status: entry.status,
    expectedStatus: subject.status,
    ...(entry.note !== undefined && normNote(entry.note) !== normNote(subject.note) ? { note: normNote(entry.note) } : {}),
  };
}

/**
 * The PUT body: ONLY real changes of rows the teacher may edit, each with its
 * expectedStatus — students in `records`, team members in `teachers`; an
 * empty part is left out (the web does the same).
 */
export function savePayload(dto: SessionAttendance, drafts: AttendanceDrafts): SaveBody {
  const records: SaveRecord[] = [];
  for (const s of dto.students) {
    const row = changeOf(studentSubject(s), drafts.students.get(s.studentId), canEditStudent(dto, s));
    if (row) records.push({ studentId: s.studentId, ...row });
  }
  const teachers: SaveTeacherRecord[] = [];
  for (const t of dto.teachers) {
    const row = changeOf(teacherSubject(t), drafts.teachers.get(t.teacherId), canEditTeacher(dto, t));
    if (row) teachers.push({ teacherId: t.teacherId, ...row });
  }
  return { ...(records.length ? { records } : {}), ...(teachers.length ? { teachers } : {}) };
}

/** Edits that would be sent (not counting edits a refreshed roster no longer allows). */
export function pendingCount(dto: SessionAttendance, drafts: AttendanceDrafts): number {
  const body = savePayload(dto, drafts);
  return (body.records?.length ?? 0) + (body.teachers?.length ?? 0);
}

/** Expected STUDENTS still without a status if the draft were saved now (completion is about students). */
export function unrecordedAfterSave(dto: SessionAttendance, drafts: AttendanceDrafts): number {
  return dto.students.filter((s) => s.expected && effective(drafts.students, studentSubject(s)).status === null).length;
}
