import type { PlatformClock } from './dashboard-model';
import type { AttendanceStatus, RosterStudent, SessionAttendance, SessionStatus } from './types';

/*
 * Attendance, read-only. Every rule here is either the web's own logic
 * (frontend lib/attendance.ts) or a flag computed by the server — the
 * backend stays the single source of truth for eligibility and permissions.
 */

/* ------------------------------ session progress ------------------------------ */

/** Web AttendanceState: where a session stands for attendance. */
export type AttendanceState = 'CANCELLED' | 'UPCOMING' | 'NOT_RECORDED' | 'PARTIAL' | 'COMPLETE';

/**
 * The web's sessionProgress, from the counts every SessionDto carries
 * (expected roster on the date vs. records saved). One refinement, which is
 * the backend's own rule for when recording opens: a lesson of TODAY that has
 * not started yet (platform time) is UPCOMING, not "not recorded".
 */
export function attendanceState(
  s: { status: SessionStatus; date: string; startTime: string },
  counts: { expected: number; recorded: number },
  clock: PlatformClock,
): AttendanceState {
  if (s.status === 'CANCELLED') return 'CANCELLED';
  if (counts.recorded > 0 && counts.recorded >= counts.expected) return 'COMPLETE';
  if (counts.recorded > 0) return 'PARTIAL';
  if (s.date > clock.today || (s.date === clock.today && s.startTime > clock.time)) return 'UPCOMING';
  return 'NOT_RECORDED';
}

/* ---------------------------------- roster ---------------------------------- */

export interface RosterGroup {
  /** null = class unknown on that date (a recorded student no longer enrolled) */
  classId: string | null;
  groupName: string | null;
  students: RosterStudent[];
}

/**
 * Students as the server returned them (already limited to MY scope, sorted
 * by name). In a shared session they are grouped by the class they come from
 * on the session date; otherwise one group.
 */
export function rosterGroups(dto: SessionAttendance): RosterGroup[] {
  const shared = dto.additionalClasses.length > 0;
  if (!shared) return [{ classId: dto.groupClass.id, groupName: null, students: dto.students }];
  const order = [dto.groupClass.id, ...dto.additionalClasses.map((c) => c.id)];
  const groups = new Map<string | null, RosterGroup>();
  for (const s of dto.students) {
    const key = s.groupClass?.id ?? null;
    const group = groups.get(key) ?? { classId: key, groupName: s.groupClass?.group.name ?? null, students: [] };
    group.students.push(s);
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) =>
      (a.classId === null ? 99 : order.indexOf(a.classId)) - (b.classId === null ? 99 : order.indexOf(b.classId)),
  );
}

export type StatusCounts = Record<AttendanceStatus, number> & { notRecorded: number };

/** Breakdown over the EXPECTED students only (those who count for completion). */
export function statusCounts(students: readonly RosterStudent[]): StatusCounts {
  const counts: StatusCounts = { PRESENT: 0, LATE: 0, ABSENT: 0, EXCUSED: 0, notRecorded: 0 };
  for (const s of students) {
    if (!s.expected) continue;
    if (s.status) counts[s.status] += 1;
    else counts.notRecorded += 1;
  }
  return counts;
}

/* ------------------------------- restrictions ------------------------------- */

export type AttendanceNotice =
  | { kind: 'cancelled' }
  | { kind: 'notStarted'; startTime: string }
  | { kind: 'correctionClosed' }
  | { kind: 'assistantScope' }
  | { kind: 'emptyRoster' };

/**
 * What the server says about this roster, as notices — from its flags only:
 * `editable` (recording open), `correctable` (changing saved values allowed),
 * `scope` (an assistant of a shared session sees their classes only).
 */
export function attendanceNotices(dto: SessionAttendance): AttendanceNotice[] {
  const notices: AttendanceNotice[] = [];
  if (dto.sessionStatus === 'CANCELLED') notices.push({ kind: 'cancelled' });
  else if (!dto.editable) notices.push({ kind: 'notStarted', startTime: dto.startTime });
  else if (!dto.correctable) notices.push({ kind: 'correctionClosed' });
  if (!dto.scope.allStudents) notices.push({ kind: 'assistantScope' });
  if (dto.expectedCount === 0 && dto.sessionStatus !== 'CANCELLED') notices.push({ kind: 'emptyRoster' });
  return notices;
}

/** The roster's own completion state (caller scope), for the header. */
export function rosterState(dto: SessionAttendance): AttendanceState {
  if (dto.sessionStatus === 'CANCELLED') return 'CANCELLED';
  if (dto.complete) return 'COMPLETE';
  if (dto.recordedCount > 0) return 'PARTIAL';
  if (!dto.editable) return 'UPCOMING';
  return 'NOT_RECORDED';
}
