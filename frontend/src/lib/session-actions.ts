/**
 * Which session actions to OFFER (cancel, extra lesson edit / permanent
 * delete). The API is the authority for permissions, eligibility and timing
 * and re-checks everything; these rules only hide actions it would refuse.
 */
import { tunisDateOf, tunisTimeOf } from "@/lib/dates"
import type { ISODate, SessionStatus } from "@/types/domain"

/** Whether a lesson (local date + "HH:mm" start) has not started yet in Africa/Tunis. */
export function notStartedInTunis(date: ISODate, start: string, at: Date | number = Date.now()) {
  const today = tunisDateOf(at)
  return date > today || (date === today && start > tunisTimeOf(at))
}

export interface ActionableSession {
  extra?: boolean
  status: SessionStatus
  date: ISODate
  start: string
}

const upcoming = (s: ActionableSession, at?: Date | number) =>
  s.status === "SCHEDULED" && notStartedInTunis(s.date, s.start, at)

/** Admin «إلغاء الحصة»: a scheduled lesson without recorded attendance (any date). */
export const canAdminCancel = (s: ActionableSession, recorded: number) => s.status === "SCHEDULED" && recorded === 0

/** Supervisor teacher «إلغاء الحصة»: their scheduled lesson, not started, without attendance. */
export const canTeacherCancel = (s: ActionableSession, recorded: number, isSupervisor: boolean, at?: Date | number) =>
  isSupervisor && recorded === 0 && upcoming(s, at)

/** Admin «تعديل الحصة»: an extra lesson, scheduled, not started, without attendance. */
export const canEditExtra = (s: ActionableSession, recorded: number, at?: Date | number) =>
  Boolean(s.extra) && recorded === 0 && upcoming(s, at)

/**
 * Admin «حذف نهائي»: an extra lesson without attendance, either cancelled
 * (any date) or scheduled and not started. Work or audit history it may hold
 * is only known to the API, which refuses with an explanation.
 */
export const canDeleteExtra = (s: ActionableSession, recorded: number, at?: Date | number) =>
  Boolean(s.extra) && recorded === 0 && (s.status === "CANCELLED" || upcoming(s, at))

/**
 * Attendance is recorded once the lesson has STARTED (date + start time in
 * Africa/Tunis) — from its start minute, during it and after its end; never
 * for a cancelled lesson. The API applies the same rule when saving.
 */
export const attendanceOpen = (s: Pick<ActionableSession, "status" | "date" | "start">, at?: Date | number) =>
  s.status !== "CANCELLED" && !notStartedInTunis(s.date, s.start, at)

/** «يبدأ تسجيل الحضور عند الساعة 22:30» (today), with the day for a later date. */
export function attendanceOpensLabel(s: Pick<ActionableSession, "date" | "start">, dayLabel: (date: ISODate) => string, at: Date | number = Date.now()) {
  return s.date === tunisDateOf(at)
    ? `يبدأ تسجيل الحضور عند الساعة ${s.start}`
    : `يبدأ تسجيل الحضور يوم ${dayLabel(s.date)} عند الساعة ${s.start}`
}
