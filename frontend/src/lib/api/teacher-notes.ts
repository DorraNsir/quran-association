"use client"

import { useQuery } from "@tanstack/react-query"

import { tunisDateOf } from "@/lib/dates"
import type { ID, TeacherNote } from "@/types/domain"

import { api, useApiMutation } from "./academic"
import { fetchAll } from "./client"

interface TeacherNoteDto {
  id: string
  studentId: string
  groupClassId: string
  date: string
  content: string
  createdAt: string
  updatedAt: string
}

export const notesKey = ["teacher-notes"] as const

const toNote = (teacherId: ID) => (n: TeacherNoteDto): TeacherNote => ({
  ...n,
  teacherId,
  createdAt: tunisDateOf(n.createdAt),
  updatedAt: tunisDateOf(n.updatedAt),
})

/** The signed-in teacher's own private notes (the API never returns anyone else's). */
export function useTeacherNotes(teacherId: ID) {
  return useQuery({
    queryKey: notesKey,
    queryFn: async ({ signal }) => (await fetchAll<TeacherNoteDto>("/teacher/notes", {}, signal)).map(toNote(teacherId)),
  })
}

export function useSaveTeacherNote() {
  return useApiMutation(
    ({ id, studentId, date, content }: { id?: ID; studentId: ID; date: string; content: string }) =>
      id
        ? api(`/teacher/notes/${id}`, { method: "PATCH", body: { date, content } })
        : api("/teacher/notes", { method: "POST", body: { studentId, date, content } }),
    [notesKey]
  )
}

export function useDeleteTeacherNote() {
  return useApiMutation((id: ID) => api(`/teacher/notes/${id}`, { method: "DELETE" }), [notesKey])
}

/** Admin, read-only: every teacher's notes about one student (with the author). */
export function useStudentTeacherNotes(studentId: ID) {
  return useQuery({
    queryKey: [...notesKey, "student", studentId],
    queryFn: ({ signal }) =>
      api<(TeacherNoteDto & { teacher: { id: string; firstName: string; lastName: string } })[]>(
        `/admin/students/${studentId}/teacher-notes`,
        { signal }
      ),
  })
}
