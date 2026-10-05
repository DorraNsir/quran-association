/**
 * Attendance rules, shared by every screen (pure functions — no UI, no state).
 * The NestJS API will own these later; keep this the single place they live.
 */
import type {
  AttendanceStatus,
  ID,
  ISODate,
  Session,
  Student,
  StudentAttendance,
} from "@/types/domain"

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ["PRESENT", "ABSENT", "EXCUSED", "LATE"]

/**
 * Who is expected in a session: active members of the group who were
 * already registered on that date. (The prototype tracks only the current
 * group; membership history will come with the API.)
 */
export function rosterFor(session: Pick<Session, "groupId" | "date">, students: Student[]) {
  return students.filter(
    (s) => s.groupId === session.groupId && s.status === "ACTIVE" && s.registrationDate <= session.date
  )
}

export interface AttendanceSummary {
  /** Records counted (one per student per session) */
  recorded: number
  present: number
  absent: number
  excused: number
  late: number
  /**
   * Attendance rate in %, or null when nothing can be computed.
   *
   *   rate = (PRESENT + LATE) / (recorded − EXCUSED) × 100
   *
   * - LATE counts as attended (the student came).
   * - EXCUSED is left out of the denominator: a justified absence neither
   *   helps nor hurts. Counts are always shown next to the rate.
   * - Cancelled or unrecorded sessions have no records, so they don't count.
   */
  rate: number | null
}

export function summarize(records: Pick<StudentAttendance, "status">[]): AttendanceSummary {
  const count = (status: AttendanceStatus) => records.filter((r) => r.status === status).length
  const present = count("PRESENT")
  const absent = count("ABSENT")
  const excused = count("EXCUSED")
  const late = count("LATE")
  const eligible = records.length - excused
  return {
    recorded: records.length,
    present,
    absent,
    excused,
    late,
    rate: eligible > 0 ? Math.round(((present + late) / eligible) * 1000) / 10 : null,
  }
}

/** Where a session stands, from the administration's point of view. */
export type AttendanceState = "CANCELLED" | "UPCOMING" | "NOT_RECORDED" | "PARTIAL" | "COMPLETE"

export interface SessionProgress {
  state: AttendanceState
  recorded: number
  expected: number
}

export function sessionProgress(
  session: Session,
  rosterSize: number,
  recordedCount: number,
  today: ISODate
): SessionProgress {
  const base = { recorded: recordedCount, expected: rosterSize }
  if (session.status === "CANCELLED") return { ...base, state: "CANCELLED" }
  if (recordedCount > 0 && recordedCount >= rosterSize) return { ...base, state: "COMPLETE" }
  if (recordedCount > 0) return { ...base, state: "PARTIAL" }
  if (session.date > today) return { ...base, state: "UPCOMING" }
  return { ...base, state: "NOT_RECORDED" }
}

/** Attendance can be taken on the day of the session or afterwards, never for a cancelled one. */
export function canTakeAttendance(session: Session, today: ISODate) {
  return session.status !== "CANCELLED" && session.date <= today
}

/** Group records by session id once, instead of filtering per row. */
export function indexBySession<T extends { sessionId: ID }>(records: T[]) {
  const map = new Map<ID, T[]>()
  for (const r of records) {
    const list = map.get(r.sessionId)
    if (list) list.push(r)
    else map.set(r.sessionId, [r])
  }
  return map
}

/** Count of one status inside a summary. */
export function countOf(summary: AttendanceSummary, status: AttendanceStatus) {
  return { PRESENT: summary.present, ABSENT: summary.absent, EXCUSED: summary.excused, LATE: summary.late }[status]
}
