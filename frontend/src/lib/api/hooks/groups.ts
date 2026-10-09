"use client"

import type { GroupClass, GroupClassStatus, GroupStatus, WeeklySchedule } from "@/types/domain"

import { api, keys, useApiMutation } from "../academic"

/** Classes carry group/branch/room/team; students and weekly slots depend on them. */
const affected = [keys.groups, keys.groupClasses, keys.schedules, keys.students, keys.teachers, keys.branches, keys.rooms] as const

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
  /** Students who must be in this class after saving (added ones are transferred) */
  studentIds: string[]
  currentMemberIds: string[]
  /** The class's weekly slots after saving (id = existing slot) */
  slots: (Pick<WeeklySchedule, "day" | "start" | "end" | "roomId"> & { id?: string })[]
  previousSlots: WeeklySchedule[]
  /** The class's branch before editing (a branch change moves every kept slot to a room of the new branch) */
  previousBranchId?: string
}

/**
 * Saves a class as the API models it: the class (branch + team), its status,
 * its weekly slots, each in its own room (deleted first so freed times can be
 * reused, then updated, then created) and the students transferred into it.
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

    for (const studentId of input.studentIds.filter((id) => !input.currentMemberIds.includes(id)))
      await api(`/admin/students/${studentId}/group-class`, { method: "PATCH", body: { groupClassId: saved.id } })
    return saved
  }, affected)
}
