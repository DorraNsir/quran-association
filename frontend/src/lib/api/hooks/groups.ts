"use client"

import { useQuery } from "@tanstack/react-query"

import type { GroupClass, GroupClassStatus, GroupStatus, ID, WeeklySchedule } from "@/types/domain"

import { api, keys, useApiMutation } from "../academic"
import { financeKey } from "@/lib/api/finance"

/** Classes carry group/branch/room/team; students and weekly slots depend on them. */
// Students joining a class are charged their group's fee automatically (payments screens)
// New weekly slots and (re)activations create sessions automatically (session lists refresh)
const affected = [keys.groups, keys.groupClasses, keys.schedules, keys.students, keys.teachers, keys.branches, keys.rooms, financeKey, keys.sessions] as const

export function useSaveGroup() {
  return useApiMutation(
    async ({ id, name, audience: text, status }: { id?: string; name: string; audience: string; status: GroupStatus }) => {
      // Optional field: an empty audience is sent as null (no value / cleared)
      const audience = text.trim() || null
      // Name and status in one request: a refused status change keeps the old name too
      return id
        ? api<{ id: string; status: string }>(`/admin/groups/${id}`, { method: "PATCH", body: { name, audience, status } })
        : api<{ id: string; status: string }>("/admin/groups", { method: "POST", body: { name, audience, status } })
    },
    affected
  )
}

export function useSetGroupStatus() {
  return useApiMutation(
    ({ id, status }: { id: string; status: GroupStatus }) =>
      api(`/admin/groups/${id}/status`, { method: "PATCH", body: { status } }),
    affected
  )
}

export function useSetClassStatus() {
  return useApiMutation(
    ({ id, status }: { id: string; status: GroupClassStatus }) =>
      api(`/admin/group-classes/${id}/status`, { method: "PATCH", body: { status } }),
    affected
  )
}

export interface ClassSaveInput {
  /** The class as the form asks for it; `version`: the one the form was opened with */
  groupClass: Omit<GroupClass, "id"> & { id?: string }
  /** The full list of the weekly slots it hosts (id = existing slot; none = new) */
  slots: (Pick<WeeklySchedule, "day" | "start" | "end" | "roomId"> & { id?: string })[]
}

/**
 * Saves a class in ONE request, as the API applies it: all or nothing (an
 * edit through «حفظ القسم» — PUT …/save — checked against the version the
 * form was opened with; a new class with its slots — POST). A refusal
 * changes nothing; a stale form gets 409 GROUP_CLASS_CHANGED and keeps its
 * unsaved values. A repeated request (double click, retry) is harmless.
 */
export function useSaveClass() {
  return useApiMutation(async ({ groupClass: c, slots }: ClassSaveInput) => {
    const body = {
      branchId: c.branchId,
      status: c.status,
      supervisorId: c.supervisorId,
      assistantTeacherIds: c.assistantIds,
      slots: slots.map((s) => ({ id: s.id, dayOfWeek: s.day, startTime: s.start, endTime: s.end, roomId: s.roomId })),
    }
    return c.id
      ? api<{ id: string; version: number }>(`/admin/group-classes/${c.id}/save`, {
          method: "PUT",
          body: { ...body, version: c.version },
        })
      : api<{ id: string; version: number }>("/admin/group-classes", { method: "POST", body: { ...body, groupId: c.groupId } })
  }, affected)
}

/** Why a class cannot change group (the API's codes; each comes with its Arabic message) */
export type ClassMoveBlock =
  | "SAME_GROUP"
  | "DESTINATION_ARCHIVED"
  | "RUNNING_STATE_CHANGES"
  | "HAS_STUDENTS"
  | "HAS_ATTENDANCE"
  | "HAS_COMPLETED_SESSIONS"
  | "HAS_WORK"
  | "HAS_TEACHER_NOTES"
  | "HAS_ONBOARDING_SUBMISSIONS"

/** What «نقل القسم إلى مجموعة أخرى» would do (read-only) */
export interface ClassMovePreviewDto {
  groupClassId: ID
  from: { id: ID; name: string; status: GroupStatus }
  to: { id: ID; name: string; status: GroupStatus }
  eligible: boolean
  blocks: { code: ClassMoveBlock; count: number; message: string }[]
  /** What stays attached to the class (same id) */
  keeps: { weeklySchedules: number; plannedSessions: number; teachers: number; onboardingLinks: number }
  /** The destination's fee for the current academic year, charged to its future students */
  destinationFee: string | null
}

export function useClassMovePreview(groupClassId: ID, groupId: ID) {
  return useQuery({
    queryKey: [...keys.groupClasses, "move-preview", groupClassId, groupId],
    queryFn: ({ signal }) =>
      api<ClassMovePreviewDto>(`/admin/group-classes/${groupClassId}/move-preview`, { query: { groupId }, signal }),
    enabled: Boolean(groupClassId && groupId),
    staleTime: 0,
  })
}

/** Moves an unused class to another group; the API re-checks everything and refuses (409) otherwise */
export function useMoveClass() {
  return useApiMutation(
    ({ id, groupId }: { id: ID; groupId: ID }) =>
      api(`/admin/group-classes/${id}/move`, { method: "POST", body: { groupId } }),
    affected
  )
}
