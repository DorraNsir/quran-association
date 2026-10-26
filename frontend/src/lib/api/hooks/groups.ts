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
      const saved = id
        ? await api<{ id: string; status: string }>(`/admin/groups/${id}`, { method: "PATCH", body: { name, audience } })
        : await api<{ id: string; status: string }>("/admin/groups", { method: "POST", body: { name, audience } })
      if (saved.status !== status) await api(`/admin/groups/${saved.id}/status`, { method: "PATCH", body: { status } })
      return saved
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
  groupClass: Omit<GroupClass, "id"> & { id?: string }
  /** The class's weekly slots after saving (id = existing slot) */
  slots: (Pick<WeeklySchedule, "day" | "start" | "end" | "roomId"> & { id?: string })[]
  previousSlots: WeeklySchedule[]
  /** The class's branch before editing (a branch change moves every kept slot to a room of the new branch) */
  previousBranchId?: string
}

/**
 * Saves a class as the API models it: the class (branch + team), its status,
 * its weekly slots, each in its own room (deleted first so freed times can be
 * reused, then updated, then created).
 * A branch change sends the new room of every kept slot with the class itself
 * (the API applies both atomically). The API
 * checks every conflict and rule; on a refusal the error is shown and the
 * screens reload the real state (steps already accepted stay applied).
 */
export function useSaveClass() {
  return useApiMutation(async (input: ClassSaveInput) => {
    const c = input.groupClass
    const team = { supervisorId: c.supervisorId, assistantTeacherIds: c.assistantIds }
    const kept = new Map(input.slots.filter((s) => s.id).map((s) => [s.id!, s]))
    const branchChanged = !!c.id && input.previousBranchId !== undefined && input.previousBranchId !== c.branchId
    const base = (id: string) => `/admin/group-classes/${id}/schedules`
    if (c.id)
      for (const old of input.previousSlots.filter((s) => !kept.has(s.id)))
        await api(`${base(c.id)}/${old.id}`, { method: "DELETE" })

    const saved = c.id
      ? await api<{ id: string; status: string }>(`/admin/group-classes/${c.id}`, {
          method: "PATCH",
          body: {
            branchId: c.branchId,
            ...team,
            ...(branchChanged && { scheduleRooms: [...kept].map(([scheduleId, s]) => ({ scheduleId, roomId: s.roomId })) }),
          },
        })
      : await api<{ id: string; status: string }>("/admin/group-classes", {
          method: "POST",
          body: { groupId: c.groupId, branchId: c.branchId, ...team },
        })
    if (saved.status !== c.status) await api(`/admin/group-classes/${saved.id}/status`, { method: "PATCH", body: { status: c.status } })

    for (const old of input.previousSlots) {
      const next = kept.get(old.id)
      if (!next) continue
      const body = {
        ...((next.start !== old.start || next.end !== old.end || next.day !== old.day) && {
          dayOfWeek: next.day,
          startTime: next.start,
          endTime: next.end,
        }),
        ...(!branchChanged && next.roomId !== old.roomId && { roomId: next.roomId }),
      }
      if (Object.keys(body).length) await api(`${base(saved.id)}/${old.id}`, { method: "PATCH", body })
    }
    for (const slot of input.slots.filter((s) => !s.id))
      await api(base(saved.id), {
        method: "POST",
        body: { dayOfWeek: slot.day, startTime: slot.start, endTime: slot.end, roomId: slot.roomId },
      })

    return saved
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
