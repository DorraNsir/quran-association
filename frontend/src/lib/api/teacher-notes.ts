"use client"

import { useQuery } from "@tanstack/react-query"

import type { ID, TeacherNote } from "@/types/domain"

import { api, useApiMutation } from "./academic"
import { fetchAll } from "./client"

export const notesKey = ["teacher-notes"] as const

/**
 * «ملاحظاتي»: the signed-in teacher's own private notes, most recently
 * updated first (the API returns only the author's notes; no admin or
 * student route exposes them).
 */
export function useTeacherNotes() {
  return useQuery({
    queryKey: notesKey,
    queryFn: ({ signal }) => fetchAll<TeacherNote>("/teacher/notes", {}, signal),
  })
}

/** Create or edit a note: only its text — the owner and dates are set by the server. */
export function useSaveTeacherNote() {
  return useApiMutation(
    ({ id, content }: { id?: ID; content: string }) =>
      id
        ? api<TeacherNote>(`/teacher/notes/${id}`, { method: "PATCH", body: { content } })
        : api<TeacherNote>("/teacher/notes", { method: "POST", body: { content } }),
    [notesKey]
  )
}

export function useDeleteTeacherNote() {
  return useApiMutation((id: ID) => api(`/teacher/notes/${id}`, { method: "DELETE" }), [notesKey])
}
