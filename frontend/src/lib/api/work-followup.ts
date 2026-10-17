"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import type { StudentWorkProgram, WorkProgram, WorkSession, WorkStatus, WorkType } from "@/types/work-followup"

import { api, useApiMutation } from "./academic"
import type { Page, Query } from "./client"

/**
 * «متابعة العمل» — the teacher endpoints (/api/teacher/work-programs…, the
 * API checks the session team and the roster on every call). One query-key
 * root: every change refreshes the list, the program pages and the options.
 */
export const workKeys = {
  all: ["work-followup"] as const,
  list: (filters: object, page: number, pageSize: number) => ["work-followup", "list", filters, page, pageSize] as const,
  one: (id: string) => ["work-followup", "program", id] as const,
  sessionOptions: ["work-followup", "session-options"] as const,
  eligible: (studentId: string, afterSessionId?: string) => ["work-followup", "eligible", studentId, afterSessionId ?? null] as const,
}

const BASE = "/teacher/work-programs"

export interface WorkProgramFilters {
  q?: string
  studentId?: string
  groupClassId?: string
  sessionId?: string
  period?: "upcoming" | "past"
  state?: "pending" | "unfinished" | "cancelled" | "done"
}

const clean = (q: object): Query =>
  Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== "")) as Query

export function useWorkPrograms(filters: WorkProgramFilters, page: number, pageSize: number) {
  return useQuery({
    queryKey: workKeys.list(clean(filters), page, pageSize),
    queryFn: ({ signal }) => api<Page<WorkProgram>>(BASE, { query: { ...clean(filters), page, pageSize }, signal }),
    placeholderData: keepPreviousData,
  })
}

export function useWorkProgram(id: string) {
  return useQuery({
    queryKey: workKeys.one(id),
    queryFn: ({ signal }) => api<WorkProgram>(`${BASE}/${id}`, { signal }),
    retry: false,
  })
}

/** Sessions that have programs (the «الحصة» filter). */
export function useWorkSessionOptions() {
  return useQuery({
    queryKey: workKeys.sessionOptions,
    queryFn: ({ signal }) => api<WorkSession[]>(`${BASE}/session-options`, { signal }),
  })
}

/** The student's existing upcoming sessions that may receive work (optionally later than a source session). */
export function useEligibleSessions(studentId: string | undefined, afterSessionId?: string) {
  return useQuery({
    queryKey: workKeys.eligible(studentId ?? "", afterSessionId),
    queryFn: ({ signal }) =>
      api<(WorkSession & { programId: string | null })[]>(`${BASE}/eligible-sessions`, {
        query: clean({ studentId, afterSessionId }),
        signal,
      }),
    enabled: Boolean(studentId),
  })
}

export interface NewWorkItemInput {
  type: WorkType
  description: string
  recitationNumber?: number | null
}

export function useCreateWorkProgram() {
  return useApiMutation(
    (body: { studentId: string; sessionId: string; generalNotes?: string | null; items: NewWorkItemInput[] }) =>
      api<WorkProgram>(BASE, { method: "POST", body }),
    [workKeys.all]
  )
}

/** One save of the edit form: notes (with the program version), changed saved items (with their versions), new items. */
export function useUpdateWorkProgram() {
  return useApiMutation(
    ({
      id,
      ...body
    }: {
      id: string
      version?: number
      generalNotes?: string | null
      items?: { id: string; version: number; type?: WorkType; description?: string; recitationNumber?: number | null }[]
      newItems?: NewWorkItemInput[]
    }) => api<WorkProgram>(`${BASE}/${id}`, { method: "PATCH", body }),
    [workKeys.all]
  )
}

/** «حفظ التقييم»: the changed items (and notes) at once — refused (409) if someone changed them meanwhile. */
export function useEvaluateWorkProgram() {
  return useApiMutation(
    ({
      id,
      ...body
    }: {
      id: string
      version?: number
      generalNotes?: string | null
      items: { id: string; version: number; status: WorkStatus; evaluationComment?: string | null }[]
    }) => api<WorkProgram>(`${BASE}/${id}/evaluation`, { method: "PATCH", body }),
    [workKeys.all]
  )
}

/** «نقل إلى الحصة القادمة» / «إضافة العرضة التالية» — the API answers with the target program. */
export function useScheduleWorkItem() {
  return useApiMutation(
    ({ itemId, mode, targetSessionId, description }: { itemId: string; mode: "carry" | "next"; targetSessionId: string; description?: string }) =>
      api<WorkProgram>(`/teacher/work-items/${itemId}/${mode === "carry" ? "transfer" : "next-recitation"}`, {
        method: "POST",
        body: mode === "carry" ? { targetSessionId } : { targetSessionId, description },
      }),
    [workKeys.all]
  )
}


/** The signed-in student's OWN programs (read-only: the API offers no write for students). */
export function useMyWorkPrograms(period: "upcoming" | "past" | undefined, page: number, pageSize: number) {
  return useQuery({
    queryKey: [...workKeys.all, "student", period ?? "all", page, pageSize],
    queryFn: ({ signal }) =>
      api<Page<StudentWorkProgram>>("/student/work-programs", { query: clean({ period, page, pageSize }), signal }),
    placeholderData: keepPreviousData,
  })
}
