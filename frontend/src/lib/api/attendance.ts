"use client"

import { useQueries, useQuery } from "@tanstack/react-query"

import type { AttendanceSummary } from "@/lib/attendance"
import type { AttendanceStatus, ISODate, SessionStatus } from "@/types/domain"

import { api } from "./client"
import type { Page, Query } from "./client"

export interface PeriodFilter {
  from?: ISODate
  to?: ISODate
}

/** GET /api/admin/attendance/students-summary — counts per student (one grouped query). */
export interface StudentSummaryLine extends AttendanceSummary {
  studentId: string
  firstName: string
  lastName: string
  photoUrl: string | null
}

/** One record of a student's history (admin / teacher / student endpoints). */
export interface StudentAttendanceRecordDto {
  sessionId: string
  date: ISODate
  startTime: string
  endTime: string
  sessionStatus: SessionStatus
  groupClass: { id: string; group: { id: string; name: string } }
  status: AttendanceStatus
  note: string | null
  updatedAt: string
}

const clean = (q: object): Query =>
  Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== "")) as Query

export const attendanceKey = ["attendance"] as const

export function useStudentsAttendanceSummary(filters: PeriodFilter & { groupId?: string; groupClassId?: string; branchId?: string }, enabled = true) {
  return useQuery({
    queryKey: [...attendanceKey, "students-summary", clean(filters)],
    queryFn: ({ signal }) => api<StudentSummaryLine[]>("/admin/attendance/students-summary", { query: clean(filters), signal }),
    enabled,
  })
}

/** Path of one student's attendance for the viewer: admin / teacher (access-checked) / the student themself. */
const studentBase = (scope: "admin" | "teacher" | "student", studentId?: string) =>
  scope === "student" ? "/student/attendance" : `/${scope}/students/${studentId}/attendance`

export function useStudentAttendanceRecords(
  scope: "admin" | "teacher" | "student",
  studentId: string | undefined,
  period: PeriodFilter,
  page: number,
  pageSize: number
) {
  return useQuery({
    queryKey: [...attendanceKey, "student", scope, studentId, "records", clean({ ...period }), page, pageSize],
    queryFn: ({ signal }) =>
      api<Page<StudentAttendanceRecordDto>>(studentBase(scope, studentId), { query: clean({ ...period, page, pageSize }), signal }),
    placeholderData: (previous) => previous,
  })
}

export function useStudentAttendanceSummary(scope: "admin" | "teacher" | "student", studentId: string | undefined, period: PeriodFilter) {
  return useQuery({
    queryKey: [...attendanceKey, "student", scope, studentId, "summary", clean({ ...period })],
    queryFn: ({ signal }) => api<AttendanceSummary>(`${studentBase(scope, studentId)}/summary`, { query: clean({ ...period }), signal }),
  })
}

/**
 * Attendance rate of each of a teacher's students over the current academic
 * year (teacher endpoint: access-checked per student) — a map studentId → rate.
 */
export function useTeacherStudentRates(studentIds: string[]) {
  return useQueries({
    queries: studentIds.map((id) => ({
      queryKey: [...attendanceKey, "student", "teacher", id, "summary", {}],
      queryFn: ({ signal }: { signal: AbortSignal }) => api<AttendanceSummary>(`/teacher/students/${id}/attendance/summary`, { signal }),
      retry: false,
    })),
    combine: (results) => new Map(studentIds.map((id, i) => [id, results[i]?.data?.rate ?? null])),
  })
}
