"use client"

import { useQueries, useQuery } from "@tanstack/react-query"

import type { ID, MemorizationProgress, Semester } from "@/types/domain"

import { api, useApiMutation } from "./academic"

/** The API names the semesters FIRST / SECOND. */
const API_SEMESTER = { SEMESTER_1: "FIRST", SEMESTER_2: "SECOND" } as const
const UI_SEMESTER = { FIRST: "SEMESTER_1", SECOND: "SEMESTER_2" } as const

interface ClassMemorizationDto {
  academicYear: { id: string; label: string }
  semester: "FIRST" | "SECOND"
  students: {
    studentId: string
    lastMemorizedSurahNumber: number | null
    updatedAt: string | null
    updatedBy?: string | null
  }[]
}
interface MemorizationRecordDto {
  studentId: string
  academicYear: { id: string; label: string }
  semester: "FIRST" | "SECOND"
  lastMemorizedSurahNumber: number
  updatedAt: string
  updatedBy: string | null
}

export const memorizationKeyRoot = ["memorization"] as const

const record = (studentId: string, academicYearId: string, semester: Semester, surah: number, updatedAt: string | null): MemorizationProgress => ({
  id: `${studentId}|${academicYearId}|${semester}`,
  studentId,
  academicYearId,
  semester,
  lastMemorizedSurah: surah,
  updatedByTeacherId: "",
  updatedAt: (updatedAt ?? "").slice(0, 10),
})

export interface MemorizationPeriod {
  academicYearId?: ID
  semester: Semester
}

/**
 * The recorded values of every student enrolled in these classes during a
 * semester (one request per class: admin or teacher endpoint, access-checked
 * by the API) — in the `MemorizationProgress` shape the screens index.
 */
export function useClassesMemorization(scope: "admin" | "teacher", classIds: ID[], period: MemorizationPeriod) {
  return useQueries({
    queries: classIds.map((id) => ({
      queryKey: [...memorizationKeyRoot, scope, "class", id, period.academicYearId, period.semester],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api<ClassMemorizationDto>(`/${scope}/group-classes/${id}/memorization`, {
          query: { academicYearId: period.academicYearId, semester: API_SEMESTER[period.semester] },
          signal,
        }),
      enabled: Boolean(period.academicYearId),
    })),
    combine: (results) => ({
      records: results.flatMap((r) =>
        (r.data?.students ?? []).flatMap((s) =>
          s.lastMemorizedSurahNumber === null
            ? []
            : [record(s.studentId, r.data!.academicYear.id, UI_SEMESTER[r.data!.semester], s.lastMemorizedSurahNumber, s.updatedAt)]
        )
      ),
      isPending: results.some((r) => r.isPending && r.fetchStatus !== "idle"),
      isError: results.some((r) => r.isError),
      error: results.find((r) => r.isError)?.error,
      refetch: () => results.forEach((r) => r.refetch()),
    }),
  })
}

/** Every recorded value of one student (admin endpoint, or the student's own). */
export function useStudentMemorization(scope: "admin" | "student", studentId?: ID, enabled = true) {
  return useQuery({
    enabled,
    queryKey: [...memorizationKeyRoot, scope, "student", studentId],
    queryFn: ({ signal }) =>
      api<MemorizationRecordDto[]>(scope === "student" ? "/student/memorization" : `/admin/students/${studentId}/memorization`, { signal }),
    select: (rows) => rows.map((r) => record(r.studentId, r.academicYear.id, UI_SEMESTER[r.semester], r.lastMemorizedSurahNumber, r.updatedAt)),
  })
}

/** Create or update THE value of (student, year, semester); the API checks teacher access and enrollment. */
export function useSaveMemorization(scope: "admin" | "teacher") {
  return useApiMutation(
    ({ studentId, academicYearId, semester, surah }: { studentId: ID; academicYearId: ID; semester: Semester; surah: number }) =>
      api(`/${scope}/students/${studentId}/memorization`, {
        method: "PUT",
        body: { academicYearId, semester: API_SEMESTER[semester], lastMemorizedSurahNumber: surah },
      }),
    [memorizationKeyRoot]
  )
}
