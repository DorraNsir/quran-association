"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { tunisDateOf } from "@/lib/dates"
import type { RegistrationFields } from "@/lib/registration"
import type { Gender, RegistrationRequest } from "@/types/domain"

import { api, keys } from "../academic"
import type { Page } from "../client"
import { uploadFile } from "../client"
import type { PhotoChange, StoredFileInfo } from "./people"

/** RegistrationRequestDto (API). */
export interface RegistrationRequestDto {
  id: string
  firstName: string
  lastName: string
  gender: Gender | null
  birthDate: string | null
  age: number | null
  phone: string
  guardianPhone: string | null
  address: string | null
  hasStudiedQuranBefore: boolean
  previousExperience: string | null
  notes: string | null
  source: "PUBLIC_WEBSITE" | "ADMIN"
  status: "PENDING" | "ACCEPTED" | "REFUSED"
  submittedAt: string
  createdBy: { id: string; username: string } | null
  reviewedAt: string | null
  reviewedBy: { id: string; username: string } | null
  rejectionReason: string | null
  createdStudent: { id: string; firstName: string; lastName: string } | null
  interestedGroup: { id: string; name: string } | null
  interestedProgramLabel: string | null
}

/** To the UI shape (instants → Africa/Tunis calendar days). */
export const toRegistrationRequest = (r: RegistrationRequestDto): RegistrationRequest & {
  guardianPhone?: string
  rejectionReason?: string
  createdStudentName?: string
} => ({
  id: r.id,
  firstName: r.firstName,
  lastName: r.lastName,
  birthDate: r.birthDate ?? undefined,
  age: r.age ?? undefined,
  phone: r.phone,
  guardianPhone: r.guardianPhone ?? undefined,
  hasStudiedQuranBefore: r.hasStudiedQuranBefore,
  previousExperience: r.previousExperience ?? undefined,
  notes: r.notes ?? undefined,
  source: r.source,
  status: r.status,
  submittedAt: tunisDateOf(r.submittedAt),
  reviewedAt: r.reviewedAt ? tunisDateOf(r.reviewedAt) : undefined,
  reviewedByUserId: r.reviewedBy?.id,
  createdStudentId: r.createdStudent?.id,
  createdStudentName: r.createdStudent ? `${r.createdStudent.firstName} ${r.createdStudent.lastName}` : undefined,
  interestedGroupId: r.interestedGroup?.id,
  interestedProgramLabel: r.interestedProgramLabel ?? r.interestedGroup?.name ?? undefined,
  rejectionReason: r.rejectionReason ?? undefined,
})

const registrationKey = ["registration-requests"] as const

/** The form's fields → the API body (only fields the backend accepts). */
export function toRequestBody(fields: RegistrationFields & { guardianPhone?: string }) {
  return {
    firstName: fields.firstName,
    lastName: fields.lastName,
    birthDate: fields.birthDate,
    age: fields.age,
    phone: fields.phone,
    guardianPhone: fields.guardianPhone,
    hasStudiedQuranBefore: fields.hasStudiedQuranBefore,
    previousExperience: fields.previousExperience,
    notes: fields.notes,
    interestedGroupId: fields.interestedGroupId,
    interestedProgramLabel: fields.interestedProgramLabel,
  }
}

/** Public submission (no account): PENDING, source PUBLIC_WEBSITE — rate-limited by the API. */
export function useSubmitPublicRegistration() {
  return useMutation({
    mutationFn: (fields: RegistrationFields & { guardianPhone?: string }) =>
      api<{ message: string; receivedAt: string }>("/public/registration-requests", {
        method: "POST",
        body: toRequestBody(fields),
        auth: false,
      }),
  })
}

export interface RegistrationFilters {
  status?: string
  source?: string
  search?: string
  page: number
  pageSize?: number
}

export function useRegistrationRequests(filters: RegistrationFilters) {
  return useQuery({
    queryKey: [...registrationKey, "list", filters],
    queryFn: ({ signal }) =>
      api<Page<RegistrationRequestDto>>("/admin/registration-requests", {
        query: { ...filters },
        signal,
      }),
    placeholderData: (previous) => previous,
  })
}

/** Pending requests count (header of the page and the dashboard). */
export function usePendingRegistrationCount() {
  return useQuery({
    queryKey: [...registrationKey, "pending-count"],
    queryFn: ({ signal }) =>
      api<Page<RegistrationRequestDto>>("/admin/registration-requests", {
        query: { status: "PENDING", page: 1, pageSize: 1 },
        signal,
      }),
    select: (page) => page.meta.total,
  })
}

export function useRegistrationRequest(id: string) {
  return useQuery({
    queryKey: [...registrationKey, "detail", id],
    queryFn: ({ signal }) => api<RegistrationRequestDto>(`/admin/registration-requests/${id}`, { signal }),
  })
}

export function useAddRegistrationRequest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (fields: RegistrationFields & { guardianPhone?: string }) =>
      api<RegistrationRequestDto>("/admin/registration-requests", { method: "POST", body: toRequestBody(fields) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: registrationKey }),
  })
}

export interface AcceptInput {
  groupClassId: string
  registrationDate: string
  person?: { firstName: string; lastName: string; gender: Gender; dateOfBirth: string; address: string; phone: string | null }
  personId?: string
  guardianPhone: string | null
  cin: string | null
  confirmNewPerson?: boolean
  photo?: PhotoChange
}

/** A person the API considers a possible duplicate (409 POSSIBLE_DUPLICATE_PERSON). */
export interface DuplicateCandidate {
  personId: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  phone: string | null
  studentId: string | null
}

/**
 * Acceptance is ONE backend transaction (Person + Student + first
 * enrollment + request ACCEPTED); the frontend never creates the student
 * itself. A chosen photo is attached to the new student afterwards.
 */
export function useAcceptRegistration(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ photo, ...input }: AcceptInput) => {
      const result = await api<{ studentId: string; linkedExistingPerson: boolean }>(
        `/admin/registration-requests/${id}/accept`,
        { method: "POST", body: input }
      )
      if (photo) {
        const file = await uploadFile<StoredFileInfo>("/files", { purpose: "PROFILE_PHOTO" }, photo)
        await api(`/admin/students/${result.studentId}/photo`, { method: "PUT", body: { fileId: file.id } })
      }
      return result
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: registrationKey }),
        queryClient.invalidateQueries({ queryKey: keys.students }),
        queryClient.invalidateQueries({ queryKey: keys.groupClasses }),
      ])
    },
  })
}

export function useRejectRegistration(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reason: string | null) =>
      api<RegistrationRequestDto>(`/admin/registration-requests/${id}/reject`, { method: "POST", body: { reason } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: registrationKey }),
  })
}
