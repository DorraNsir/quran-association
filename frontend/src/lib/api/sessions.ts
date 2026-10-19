"use client"

import { useQuery } from "@tanstack/react-query"

import { sessionProgress, type AttendanceSummary } from "@/lib/attendance"
import type { AttendanceStatus, ISODate, RecordStatus, Session, SessionStatus, TeachingRole } from "@/types/domain"

import { api, keys, useApiMutation } from "./academic"
import type { Page, Query } from "./client"

/* ------------------------------ API DTOs ------------------------------ */

type ActivationStatus = "ACTIVE" | "INACTIVE"

export interface SessionTeacherDto {
  id: string
  firstName: string
  lastName: string
  role: "SUPERVISOR" | "ASSISTANT"
  status: ActivationStatus
}

/** GET /api/{admin|teacher}/sessions… (the student variant has no attention / completion). */
export interface SessionDto {
  id: string
  date: ISODate
  startTime: string
  endTime: string
  status: SessionStatus
  cancellationReason: string | null
  weeklyScheduleId: string | null
  /** Created as a one-off extra lesson (stored; a deleted slot's sessions also lose weeklyScheduleId) */
  isExtra: boolean
  completion?: { completedAt: string; source: "ATTENDANCE" | "ADMIN_OVERRIDE"; completedBy: string | null } | null
  /** The HOST class (whose weekly slot it is) */
  groupClass: { id: string; status: RecordStatus; group: { id: string; name: string; status: RecordStatus } }
  /** «حصة مشتركة»: the other participating classes (empty for a normal lesson) */
  additionalClasses?: { id: string; status: RecordStatus; group: { id: string; name: string; status: RecordStatus } }[]
  room: { id: string; name: string; status: ActivationStatus; branch: { id: string; name: string; status: ActivationStatus } }
  teachers: SessionTeacherDto[]
  attention?: string[]
  attendance: { expected: number; recorded: number; present: number; absent: number; late: number; excused: number }
}

/** GET /api/{admin|teacher}/sessions/:id/attendance */
export interface SessionRosterDto {
  sessionId: string
  date: ISODate
  startTime: string
  endTime: string
  sessionStatus: SessionStatus
  expectedCount: number
  recordedCount: number
  complete: boolean
  /** Server rule: may record (not cancelled, not in the future) — first recordings have no time limit */
  editable: boolean
  /** May also CHANGE saved values (teachers: within the correction window; admins: always) */
  correctable: boolean
  /** «حصة مشتركة»: the other participating classes */
  additionalClasses?: { id: string; group: { id: string; name: string } }[]
  /** The caller's students: all, or (an assistant of a shared lesson) only those of their classes */
  scope?: { allStudents: boolean; groupClassIds: string[] }
  students: {
    studentId: string
    firstName: string
    lastName: string
    photoUrl: string | null
    /** The student's own class and program ON the session date */
    groupClass?: { id: string; group: { id: string; name: string } } | null
    expected: boolean
    recorded: boolean
    status: AttendanceStatus | null
    note: string | null
  }[]
  /** The session's team SNAPSHOT (who taught it), supervisor first */
  teacherExpectedCount: number
  teacherRecordedCount: number
  teachers: {
    teacherId: string
    firstName: string
    lastName: string
    photoUrl: string | null
    /** null: recorded earlier but no longer in the snapshot */
    role: TeachingRole | null
    recorded: boolean
    /** null = لم يسجل بعد */
    status: AttendanceStatus | null
    note: string | null
  }[]
}

/** GET /api/{admin|teacher}/sessions/:id/attendance/history — append-only audit, newest first. */
export interface AttendanceChangeDto {
  id: string
  subject: "STUDENT" | "TEACHER"
  subjectId: string
  subjectName: string
  kind: "CREATED" | "MODIFIED"
  previousStatus: AttendanceStatus | null
  newStatus: AttendanceStatus
  previousNote: string | null
  newNote: string | null
  actorName: string
  createdAt: string
}

/**
 * What a save sends: only what the user changed, each with the value the
 * page was showing (`expectedStatus`) so the API refuses — instead of
 * silently overwriting — a record someone else changed meanwhile.
 */
export interface SaveAttendanceBody {
  records?: { studentId: string; status: AttendanceStatus; note?: string | null; expectedStatus: AttendanceStatus | null }[]
  teachers?: { teacherId: string; status: AttendanceStatus; note?: string | null; expectedStatus: AttendanceStatus | null }[]
}

/* ------------------------------ row model ------------------------------ */

export interface TeamMember {
  id: string
  firstName: string
  lastName: string
  status: ActivationStatus
}

/**
 * A dated session with what every list/detail screen shows, straight from
 * the API: the class's group, branch and room, the team SNAPSHOT of the
 * session, and its attendance progress (roster on the date vs. records).
 */
export interface SessionRow {
  session: Session
  /** The HOST class */
  groupClass: { id: string; groupId: string; status: RecordStatus }
  /** The host's group — for a shared lesson its name is every program, e.g. «أركان + الماهر» */
  group: { id: string; name: string }
  /** Every participating class with its group, host first (one entry for a normal lesson) */
  classes: { id: string; group: { id: string; name: string } }[]
  shared: boolean
  branch: { id: string; name: string }
  room: { id: string; name: string }
  supervisor?: TeamMember
  assistants: TeamMember[]
  /** Students expected on the session date */
  expected: number
  progress: ReturnType<typeof sessionProgress>
  summary: AttendanceSummary
  attention: string[]
}

export const toSession = (s: SessionDto): Session => ({
  id: s.id,
  groupClassId: s.groupClass.id,
  scheduleId: s.weeklyScheduleId ?? "",
  extra: s.isExtra,
  additionalGroupClassIds: (s.additionalClasses ?? []).map((c) => c.id),
  roomId: s.room.id,
  date: s.date,
  start: s.startTime,
  end: s.endTime,
  status: s.status,
  cancellationReason: s.cancellationReason ?? undefined,
})

export function toSessionRow(s: SessionDto, today: ISODate): SessionRow {
  const session = toSession(s)
  const { expected, recorded, present, absent, late, excused } = s.attendance
  const member = (t: SessionTeacherDto): TeamMember => ({ id: t.id, firstName: t.firstName, lastName: t.lastName, status: t.status })
  const supervisor = s.teachers.find((t) => t.role === "SUPERVISOR")
  const eligible = recorded - excused
  const classes = [s.groupClass, ...(s.additionalClasses ?? [])].map((c) => ({ id: c.id, group: { id: c.group.id, name: c.group.name } }))
  const shared = classes.length > 1
  return {
    session,
    groupClass: { id: s.groupClass.id, groupId: s.groupClass.group.id, status: s.groupClass.status },
    group: shared ? { id: s.groupClass.group.id, name: sharedLessonName(classes) } : s.groupClass.group,
    classes,
    shared,
    branch: s.room.branch,
    room: s.room,
    supervisor: supervisor && member(supervisor),
    assistants: s.teachers.filter((t) => t.role === "ASSISTANT").map(member),
    expected,
    progress: sessionProgress(session, expected, recorded, today),
    summary: {
      recorded,
      present,
      absent,
      late,
      excused,
      rate: eligible > 0 ? Math.round(((present + late) / eligible) * 1000) / 10 : null,
    },
    attention: s.attention ?? [],
  }
}

/** «أركان + الماهر»: the programs of a shared lesson. */
export function sharedLessonName(classes: { group: { name: string } }[]) {
  return classes.map((c) => c.group.name).join(" + ")
}

/* ------------------------------ queries ------------------------------ */

export type SessionScope = "admin" | "teacher" | "student"

export interface SessionFilters {
  from?: ISODate
  to?: ISODate
  status?: SessionStatus
  groupId?: string
  groupClassId?: string
  branchId?: string
  teacherId?: string
  order?: "asc" | "desc"
}

const base = (scope: SessionScope) => `/${scope}/sessions`
const clean = (filters: SessionFilters): Query =>
  Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== "")) as Query

/** One page of sessions (server filters, ordering and pagination). */
export function useSessionPage(scope: SessionScope, filters: SessionFilters, page: number, pageSize: number, enabled = true) {
  return useQuery({
    queryKey: [...keys.sessions, scope, "page", clean(filters), page, pageSize],
    queryFn: ({ signal }) =>
      api<Page<SessionDto>>(base(scope), { query: { ...clean(filters), page, pageSize }, signal }),
    placeholderData: (previous) => previous,
    enabled,
  })
}

/** Every session of a bounded range (≤ 62 days) — calendars, today's list, a class's history. */
export function useSessionRange(scope: SessionScope, filters: SessionFilters & { from: ISODate; to: ISODate }, enabled = true) {
  return useQuery({
    queryKey: [...keys.sessions, scope, "range", clean(filters)],
    queryFn: ({ signal }) => api<SessionDto[]>(`${base(scope)}/calendar`, { query: clean(filters), signal }),
    enabled,
  })
}

export function useSession(scope: Exclude<SessionScope, "student">, id: string) {
  return useQuery({
    queryKey: [...keys.sessions, scope, "one", id],
    queryFn: ({ signal }) => api<SessionDto>(`${base(scope)}/${id}`, { signal }),
  })
}

export const rosterKey = (id: string) => ["attendance", "session", id] as const

export function useSessionRoster(scope: Exclude<SessionScope, "student">, id: string, enabled = true) {
  return useQuery({
    queryKey: [...rosterKey(id), scope],
    queryFn: ({ signal }) => api<SessionRosterDto>(`${base(scope)}/${id}/attendance`, { signal }),
    enabled,
  })
}

/**
 * One save for students and teachers (all-or-nothing). Completion is decided
 * by the API (every expected student recorded); omitted rows are untouched.
 */
export function useSaveAttendance(scope: Exclude<SessionScope, "student">, id: string) {
  return useApiMutation(
    (body: SaveAttendanceBody) => api<SessionRosterDto>(`${base(scope)}/${id}/attendance`, { method: "PUT", body }),
    [keys.sessions, rosterKey(id), ["attendance"], ["notifications"]]
  )
}

export function useAttendanceHistory(scope: Exclude<SessionScope, "student">, id: string, enabled = true) {
  return useQuery({
    queryKey: [...rosterKey(id), scope, "history"],
    queryFn: ({ signal }) => api<AttendanceChangeDto[]>(`${base(scope)}/${id}/attendance/history`, { signal }),
    enabled,
  })
}

/** Admin: cancel, reopen, or mark completed without attendance (ADMIN_OVERRIDE). */
export function useSetSessionStatus(id: string) {
  return useApiMutation(
    (body: { status: SessionStatus; cancellationReason?: string; adminOverride?: boolean }) =>
      api<SessionDto>(`/admin/sessions/${id}/status`, { method: "PATCH", body }),
    [keys.sessions, rosterKey(id)]
  )
}

/**
 * Admin: «حصة إضافية (مرة واحدة)» — one SCHEDULED lesson of a class, today
 * or later, not tied to a weekly slot (the API refuses past dates and
 * room / teacher conflicts).
 */
export function useCreateExtraSession() {
  return useApiMutation(
    (body: { groupClassId: string; roomId: string; date: ISODate; startTime: string; endTime: string; additionalGroupClassIds?: string[] }) =>
      api<SessionDto>("/admin/sessions/extra", { method: "POST", body }),
    [keys.sessions, ["attendance"]]
  )
}

/** Page size used when a screen needs "all" rows of a bounded query. */
export const MAX_PAGE = 100
