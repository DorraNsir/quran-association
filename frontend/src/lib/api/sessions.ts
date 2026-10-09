"use client"

import { useQuery } from "@tanstack/react-query"

import { sessionProgress, type AttendanceSummary } from "@/lib/attendance"
import type { AttendanceStatus, ISODate, RecordStatus, Session, SessionStatus } from "@/types/domain"

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
  completion?: { completedAt: string; source: "ATTENDANCE" | "ADMIN_OVERRIDE"; completedBy: string | null } | null
  groupClass: { id: string; status: RecordStatus; group: { id: string; name: string; status: RecordStatus } }
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
  /** Server rule: not cancelled, not in the future, and (teachers) within the correction window */
  editable: boolean
  students: {
    studentId: string
    firstName: string
    lastName: string
    photoUrl: string | null
    expected: boolean
    recorded: boolean
    status: AttendanceStatus | null
    note: string | null
  }[]
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
  groupClass: { id: string; groupId: string; status: RecordStatus }
  group: { id: string; name: string }
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
  return {
    session,
    groupClass: { id: s.groupClass.id, groupId: s.groupClass.group.id, status: s.groupClass.status },
    group: s.groupClass.group,
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

/** Bulk save (all-or-nothing). Completion is decided by the API (every expected student recorded). */
export function useSaveAttendance(scope: Exclude<SessionScope, "student">, id: string) {
  return useApiMutation(
    (records: { studentId: string; status: AttendanceStatus; note?: string | null }[]) =>
      api<SessionRosterDto>(`${base(scope)}/${id}/attendance`, { method: "PUT", body: { records } }),
    [keys.sessions, rosterKey(id), ["attendance"]]
  )
}

/** Admin: cancel, reopen, or mark completed without attendance (ADMIN_OVERRIDE). */
export function useSetSessionStatus(id: string) {
  return useApiMutation(
    (body: { status: SessionStatus; cancellationReason?: string; adminOverride?: boolean }) =>
      api<SessionDto>(`/admin/sessions/${id}/status`, { method: "PATCH", body }),
    [keys.sessions, rosterKey(id)]
  )
}

/** Page size used when a screen needs "all" rows of a bounded query. */
export const MAX_PAGE = 100
