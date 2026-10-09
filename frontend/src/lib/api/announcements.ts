"use client"

import { useQuery } from "@tanstack/react-query"

import type { AnnouncementAudienceType, ID, ISODate } from "@/types/domain"

import { api, useApiMutation } from "./academic"
import type { Page, Query } from "./client"
import { notificationKeys } from "./notifications"

export type AnnouncementStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED"
/** Derived by the API for today: only ACTIVE reaches readers. */
export type AnnouncementState = "DRAFT" | "SCHEDULED" | "ACTIVE" | "EXPIRED" | "ARCHIVED"
export type PublicationMode = "PUBLISH_NOW" | "SCHEDULE" | "DRAFT"

export interface ClassTarget {
  id: string
  group: { id: string; name: string }
  branch: { id: string; name: string }
}

export interface AnnouncementDto {
  id: string
  title: string
  content: string
  audience: AnnouncementAudienceType
  status: AnnouncementStatus
  state: AnnouncementState
  scheduledFor: string | null
  /** Africa/Tunis wall clock "YYYY-MM-DDTHH:mm" */
  scheduledForLocal: string | null
  publishedAt: string | null
  expiresAt: ISODate | null
  archivedAt: string | null
  groupClasses: ClassTarget[]
  branches: { id: string; name: string }[]
  publishedBy: { id: string; firstName: string; lastName: string }
  canManage: boolean
  createdAt: string
  updatedAt: string
}

export type AnnouncementScope = "admin" | "teacher" | "student"
export const announcementsKey = ["announcements"] as const

const clean = (q: object): Query => Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== "")) as Query

export interface AnnouncementFilters {
  search?: string
  status?: AnnouncementStatus
  audience?: AnnouncementAudienceType
}

/** Admin: every announcement (any status); teacher / student: those addressed to them (and, for teachers, their own). */
export function useAnnouncements(scope: AnnouncementScope, filters: AnnouncementFilters, page: number, pageSize: number) {
  return useQuery({
    queryKey: [...announcementsKey, scope, "list", clean(filters), page, pageSize],
    queryFn: ({ signal }) => api<Page<AnnouncementDto>>(`/${scope}/announcements`, { query: { ...clean(filters), page, pageSize }, signal }),
    placeholderData: (previous) => previous,
  })
}

export function useAnnouncement(scope: AnnouncementScope, id: ID) {
  return useQuery({
    queryKey: [...announcementsKey, scope, "one", id],
    queryFn: ({ signal }) => api<AnnouncementDto>(`/${scope}/announcements/${id}`, { signal }),
  })
}

export interface AnnouncementInput {
  title: string
  content: string
  audience: AnnouncementAudienceType
  groupClassIds: ID[]
  branchIds: ID[]
  expiresAt: ISODate | null
}

const invalidate = [announcementsKey, notificationKeys.all] as const

/** Create with a publication mode: publish now (default), schedule (Africa/Tunis "YYYY-MM-DDTHH:mm") or draft. */
export function useCreateAnnouncement() {
  return useApiMutation(
    ({ input, mode, scheduledAt }: { input: AnnouncementInput; mode: PublicationMode; scheduledAt?: string }) =>
      api<{ announcement: AnnouncementDto; notifiedCount: number }>("/admin/announcements", {
        method: "POST",
        body: {
          ...bodyOf(input),
          mode,
          ...(mode === "SCHEDULE" ? { scheduledAt } : {}),
        },
      }),
    invalidate
  )
}

function bodyOf(input: AnnouncementInput) {
  return {
    title: input.title,
    content: input.content,
    audience: input.audience,
    expiresAt: input.expiresAt,
    ...(input.audience === "SPECIFIC_GROUP_CLASSES" ? { groupClassIds: input.groupClassIds } : {}),
    ...(input.audience === "SPECIFIC_BRANCHES" ? { branchIds: input.branchIds } : {}),
  }
}

/** Edit: DRAFT/SCHEDULED fully; after publication only title, content and expiry (the API enforces it). */
export function useUpdateAnnouncement(id: ID) {
  return useApiMutation(
    ({ input, published }: { input: AnnouncementInput; published: boolean }) =>
      api<AnnouncementDto>(`/admin/announcements/${id}`, {
        method: "PATCH",
        body: published ? { title: input.title, content: input.content, expiresAt: input.expiresAt } : bodyOf(input),
      }),
    invalidate
  )
}

export type AnnouncementAction =
  | { kind: "publish" }
  | { kind: "schedule"; scheduledAt: string }
  | { kind: "cancel-schedule" }
  | { kind: "archive" }
  | { kind: "delete" }

export function useAnnouncementAction(id: ID) {
  return useApiMutation(
    (action: AnnouncementAction) =>
      action.kind === "delete"
        ? api(`/admin/announcements/${id}`, { method: "DELETE" })
        : api(`/admin/announcements/${id}/${action.kind}`, {
            method: "POST",
            body: action.kind === "schedule" ? { scheduledAt: action.scheduledAt } : undefined,
          }),
    invalidate
  )
}
