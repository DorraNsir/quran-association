"use client"

import { api, keys, useApiMutation } from "../academic"

/** Branch / room changes refresh every screen that shows them (rooms and classes carry branch data). */
const affected = [keys.branches, keys.rooms, keys.groupClasses] as const

export interface BranchInput {
  name: string
  address: string
  phone: string | null
}

export function useSaveBranch() {
  return useApiMutation(
    async ({ id, input, status }: { id?: string; input: BranchInput; status: "ACTIVE" | "INACTIVE" }) => {
      const saved = id
        ? await api<{ id: string; status: string }>(`/admin/branches/${id}`, { method: "PATCH", body: input })
        : await api<{ id: string; status: string }>("/admin/branches", { method: "POST", body: input })
      if (saved.status !== status)
        await api(`/admin/branches/${saved.id}/status`, { method: "PATCH", body: { status } })
      return saved
    },
    affected
  )
}

export function useSetBranchStatus() {
  return useApiMutation(
    ({ id, status }: { id: string; status: "ACTIVE" | "INACTIVE" }) =>
      api(`/admin/branches/${id}/status`, { method: "PATCH", body: { status } }),
    affected
  )
}

export function useSaveRoom() {
  return useApiMutation(
    async ({ id, branchId, name, status }: { id?: string; branchId: string; name: string; status: "ACTIVE" | "INACTIVE" }) => {
      const saved = id
        ? await api<{ id: string; status: string }>(`/admin/rooms/${id}`, { method: "PATCH", body: { name } })
        : await api<{ id: string; status: string }>("/admin/rooms", { method: "POST", body: { branchId, name } })
      if (saved.status !== status) await api(`/admin/rooms/${saved.id}/status`, { method: "PATCH", body: { status } })
      return saved
    },
    affected
  )
}

export function useSetRoomStatus() {
  return useApiMutation(
    ({ id, status }: { id: string; status: "ACTIVE" | "INACTIVE" }) =>
      api(`/admin/rooms/${id}/status`, { method: "PATCH", body: { status } }),
    affected
  )
}
