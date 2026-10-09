"use client"

import { useQuery } from "@tanstack/react-query"

import type { Gender, RecordStatus } from "@/types/domain"

import { api, keys, useApiMutation, type EnrollmentDto } from "../academic"
import { uploadFile } from "../client"

const affected = [keys.teachers, keys.students, keys.groupClasses, keys.groups] as const

/** undefined = photo unchanged, null = removed, File = replaced (uploaded as PROFILE_PHOTO). */
export type PhotoChange = File | null | undefined

export interface StoredFileInfo {
  id: string
  purpose: string
  mimeType: string
  size: number
  originalName: string
  url: string
}

/** Upload → attach (or remove) the profile photo of a teacher / student (admin endpoints). */
async function applyPhoto(owner: "teachers" | "students", id: string, photo: PhotoChange) {
  if (photo === undefined) return
  if (photo === null) {
    await api(`/admin/${owner}/${id}/photo`, { method: "DELETE" })
    return
  }
  const file = await uploadFile<StoredFileInfo>("/files", { purpose: "PROFILE_PHOTO" }, photo)
  await api(`/admin/${owner}/${id}/photo`, { method: "PUT", body: { fileId: file.id } })
}

export interface TeacherInput {
  person: { firstName: string; lastName: string; gender: Gender; phone: string; email: string | null }
  joinedAt: string
  qualification: string | null
  status: "ACTIVE" | "INACTIVE"
  photo: PhotoChange
}

export function useSaveTeacher() {
  return useApiMutation(async ({ id, input }: { id?: string; input: TeacherInput }) => {
    const { status, photo, ...body } = input
    const saved = id
      ? await api<{ id: string; status: string }>(`/admin/teachers/${id}`, { method: "PATCH", body })
      : await api<{ id: string; status: string }>("/admin/teachers", { method: "POST", body: { ...body, status } })
    if (saved.status !== status) await api(`/admin/teachers/${saved.id}/status`, { method: "PATCH", body: { status } })
    await applyPhoto("teachers", saved.id, photo)
    return saved
  }, affected)
}

export function useSetTeacherStatus() {
  return useApiMutation(
    ({ id, status }: { id: string; status: "ACTIVE" | "INACTIVE" }) =>
      api(`/admin/teachers/${id}/status`, { method: "PATCH", body: { status } }),
    affected
  )
}

export interface StudentInput {
  person: {
    firstName: string
    lastName: string
    gender: Gender
    dateOfBirth: string
    address: string
    phone: string | null
  }
  guardianPhone: string | null
  cin: string | null
  registrationDate: string
  groupClassId: string
  status: RecordStatus
  photo: PhotoChange
}

/**
 * Creates a student (Person + Student + first enrollment, server-side) or
 * edits it. A class change on edit goes through the transfer endpoint so
 * the enrollment history stays correct; a status change through the status
 * endpoint (status history).
 */
export function useSaveStudent() {
  return useApiMutation(
    async ({ id, input, previous }: { id?: string; input: StudentInput; previous?: { groupClassId: string; status: RecordStatus } }) => {
      const { photo, status, groupClassId, ...rest } = input
      if (!id) {
        const created = await api<{ id: string }>("/admin/students", {
          method: "POST",
          body: { ...rest, person: { ...rest.person, phone: rest.person.phone ?? undefined }, groupClassId, status },
        })
        await applyPhoto("students", created.id, photo)
        return created
      }
      await api(`/admin/students/${id}`, { method: "PATCH", body: rest })
      if (previous && previous.groupClassId !== groupClassId && groupClassId)
        await api(`/admin/students/${id}/group-class`, { method: "PATCH", body: { groupClassId } })
      if (previous && previous.status !== status) await api(`/admin/students/${id}/status`, { method: "PATCH", body: { status } })
      await applyPhoto("students", id, photo)
      return { id }
    },
    affected
  )
}

export function useSetStudentStatus() {
  return useApiMutation(
    ({ id, status }: { id: string; status: RecordStatus }) =>
      api(`/admin/students/${id}/status`, { method: "PATCH", body: { status } }),
    affected
  )
}

/** Transfer: closes the current enrollment and opens one in the target class (history kept). */
export function useTransferStudent() {
  return useApiMutation(
    ({ id, groupClassId }: { id: string; groupClassId: string }) =>
      api(`/admin/students/${id}/group-class`, { method: "PATCH", body: { groupClassId } }),
    affected
  )
}

export function useStudentEnrollments(studentId: string) {
  return useQuery({
    queryKey: [...keys.students, studentId, "enrollments"],
    queryFn: ({ signal }) => api<EnrollmentDto[]>(`/admin/students/${studentId}/enrollments`, { signal }),
  })
}
