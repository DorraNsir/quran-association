"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import type { Gender } from "@/types/domain"

import { api, useApiMutation } from "./academic"
import type { Page, Query } from "./client"

/**
 * TEMPORARY «استكمال بيانات الطلبة» (backend STUDENT_ONBOARDING_ENABLED).
 * Isolated: removing this file, its components and routes leaves student
 * management untouched.
 */
export const onboardingKeys = {
  all: ["student-onboarding"] as const,
  status: ["student-onboarding", "status"] as const,
  links: (status?: string) => ["student-onboarding", "links", status ?? "all"] as const,
  submissions: (filters: object, page: number, pageSize: number) => ["student-onboarding", "submissions", filters, page, pageSize] as const,
  submission: (id: string) => ["student-onboarding", "submission", id] as const,
}

const BASE = "/admin/student-onboarding"

export type LinkStatus = "ACTIVE" | "EXPIRED" | "REVOKED"
export type SubmissionStatus = "PENDING" | "APPROVED" | "REJECTED"
export type Submitter = "STUDENT" | "GUARDIAN"

export interface OnboardingClass {
  id: string
  group: { id: string; name: string }
  branch: { id: string; name: string }
  supervisorName: string | null
}

export interface OnboardingLink {
  id: string
  groupClass: OnboardingClass
  status: LinkStatus
  expiresAt: string
  revokedAt: string | null
  createdAt: string
  submissions: { total: number; pending: number; approved: number; rejected: number }
}

/** The student fields (the admin student form's, nothing more). */
export interface OnboardingStudentFields {
  firstName: string
  lastName: string
  gender: Gender
  dateOfBirth: string
  address: string
  phone: string | null
  email?: string | null
  guardianPhone: string | null
  cin: string | null
}

export interface OnboardingSubmission extends OnboardingStudentFields {
  id: string
  version: number
  status: SubmissionStatus
  submittedBy: Submitter
  groupClass: OnboardingClass
  createdAt: string
  reviewedAt: string | null
  reviewedBy: string | null
  rejectionReason: string | null
  approvedStudentId: string | null
  linkedExisting: boolean
  edited: boolean
}

export interface PossibleMatch {
  studentId: string
  firstName: string
  lastName: string
  dateOfBirth: string | null
  guardianPhone: string | null
  groupClassLabel: string | null
  reasons: ("NAME" | "BIRTH_DATE" | "GUARDIAN_PHONE" | "PHONE")[]
}

export interface OnboardingSubmissionDetail extends OnboardingSubmission {
  originalData: Partial<OnboardingStudentFields> & { submittedBy?: Submitter }
  possibleMatches: PossibleMatch[]
}

export interface SubmissionFilters {
  q?: string
  status?: SubmissionStatus
  branchId?: string
  groupId?: string
  groupClassId?: string
  from?: string
  to?: string
}

const clean = (q: object): Query =>
  Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== "")) as Query

/** Whether the temporary module is on (admin menu visibility). */
export function useOnboardingStatus(enabled = true) {
  return useQuery({
    queryKey: onboardingKeys.status,
    queryFn: ({ signal }) => api<{ enabled: boolean }>(`${BASE}/status`, { signal }),
    enabled,
    staleTime: 5 * 60_000,
  })
}

export function useOnboardingLinks(status?: LinkStatus) {
  return useQuery({
    queryKey: onboardingKeys.links(status),
    queryFn: ({ signal }) => api<OnboardingLink[]>(`${BASE}/links`, { query: clean({ status }), signal }),
  })
}

/** The shareable URL — fetched only when the admin asks for it (copy / QR). */
export const fetchLinkUrl = (id: string) => api<{ url: string }>(`${BASE}/links/${id}/url`)

export function useCreateOnboardingLink() {
  return useApiMutation(
    (body: { groupClassId: string; expiresAt: string }) =>
      api<OnboardingLink & { url: string }>(`${BASE}/links`, { method: "POST", body }),
    [onboardingKeys.all]
  )
}

export function useExtendOnboardingLink() {
  return useApiMutation(
    ({ id, expiresAt }: { id: string; expiresAt: string }) =>
      api<OnboardingLink>(`${BASE}/links/${id}`, { method: "PATCH", body: { expiresAt } }),
    [onboardingKeys.all]
  )
}

export function useRevokeOnboardingLink() {
  return useApiMutation((id: string) => api<OnboardingLink>(`${BASE}/links/${id}/revoke`, { method: "POST" }), [onboardingKeys.all])
}

export function useReplaceOnboardingLink() {
  return useApiMutation(
    ({ id, expiresAt }: { id: string; expiresAt: string }) =>
      api<OnboardingLink & { url: string }>(`${BASE}/links/${id}/replace`, { method: "POST", body: { expiresAt } }),
    [onboardingKeys.all]
  )
}

export function useOnboardingSubmissions(filters: SubmissionFilters, page: number, pageSize: number) {
  return useQuery({
    queryKey: onboardingKeys.submissions(clean(filters), page, pageSize),
    queryFn: ({ signal }) =>
      api<Page<OnboardingSubmission>>(`${BASE}/submissions`, { query: { ...clean(filters), page, pageSize }, signal }),
    placeholderData: keepPreviousData,
  })
}

export function useOnboardingSubmission(id: string | null) {
  return useQuery({
    queryKey: onboardingKeys.submission(id ?? ""),
    queryFn: ({ signal }) => api<OnboardingSubmissionDetail>(`${BASE}/submissions/${id}`, { signal }),
    enabled: Boolean(id),
  })
}

type Decision =
  | { kind: "edit"; id: string; version: number; fields: OnboardingStudentFields }
  | { kind: "approve"; id: string; version: number; confirmNoDuplicate?: boolean; registrationDate?: string }
  | { kind: "link"; id: string; version: number; studentId: string }
  | { kind: "reject"; id: string; version: number; reason?: string }

/** Every review action — each refused (409) when the submission changed or was already decided. */
export function useReviewOnboardingSubmission() {
  return useApiMutation((d: Decision) => {
    const path = `${BASE}/submissions/${d.id}`
    switch (d.kind) {
      case "edit":
        return api<OnboardingSubmissionDetail>(path, { method: "PATCH", body: { version: d.version, ...d.fields } })
      case "approve":
        return api<OnboardingSubmissionDetail>(`${path}/approve`, {
          method: "POST",
          body: { version: d.version, confirmNoDuplicate: d.confirmNoDuplicate, registrationDate: d.registrationDate },
        })
      case "link":
        return api<OnboardingSubmissionDetail>(`${path}/link`, { method: "POST", body: { version: d.version, studentId: d.studentId } })
      case "reject":
        return api<OnboardingSubmissionDetail>(`${path}/reject`, { method: "POST", body: { version: d.version, reason: d.reason } })
    }
  }, [onboardingKeys.all, ["students"]])
}

// ───────────────────────── public (no account) ─────────────────────────

export interface OnboardingLinkInfo {
  branchName: string
  groupName: string
  supervisorName: string | null
}

/** The token travels in the request BODY (never in a URL the API logs). */
export function useResolveOnboardingLink(token: string) {
  return useQuery({
    queryKey: ["student-onboarding", "public", token],
    queryFn: ({ signal }) => api<OnboardingLinkInfo>("/public/student-onboarding/resolve", { method: "POST", body: { token }, signal }),
    retry: false,
    staleTime: Infinity,
  })
}

export function submitOnboarding(body: OnboardingStudentFields & { token: string; submittedBy: Submitter; consent: boolean; website?: string }) {
  return api<{ received: true }>("/public/student-onboarding/submissions", { method: "POST", body })
}
