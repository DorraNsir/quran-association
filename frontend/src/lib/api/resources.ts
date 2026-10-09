"use client"

import { useQuery } from "@tanstack/react-query"

import { tunisDateOf } from "@/lib/dates"
import type { ID, ISODate, ResourceType, ResourceVisibilityType } from "@/types/domain"

import { api, useApiMutation } from "./academic"
import { fetchPrivateBlob, uploadFile, type Page, type Query } from "./client"
import type { StoredFileInfo } from "./hooks/people"
import { notificationKeys } from "./notifications"

/** GET /api/{admin|teacher|student}/resources… */
export interface ResourceDto {
  id: string
  title: string
  description: string
  type: ResourceType
  externalUrl: string | null
  file: { id: string; fileName: string; mimeType: string; size: number; url: string } | null
  visibility: ResourceVisibilityType
  groups: { id: string; name: string }[]
  groupClasses: { id: string; group: { id: string; name: string }; branch: { id: string; name: string } }[]
  publishedBy: { id: string; firstName: string; lastName: string }
  canManage: boolean
  createdAt: string
  updatedAt: string
}

/** What the resource screens show (targets as labels, publication day in Tunis). */
export interface ResourceView {
  id: ID
  title: string
  description: string
  type: ResourceType
  externalUrl?: string
  file?: ResourceDto["file"] & {}
  visibility: ResourceVisibilityType
  groupIds: ID[]
  groupClassIds: ID[]
  /** "جميع الطلاب", group names or "group — branch" (staff only) */
  targets: string[]
  publisher: string
  createdAt: ISODate
  canManage: boolean
}

export const toResourceView = (r: ResourceDto): ResourceView => ({
  id: r.id,
  title: r.title,
  description: r.description,
  type: r.type,
  externalUrl: r.externalUrl ?? undefined,
  file: r.file ?? undefined,
  visibility: r.visibility,
  groupIds: r.groups.map((g) => g.id),
  groupClassIds: r.groupClasses.map((c) => c.id),
  targets:
    r.visibility === "ALL_STUDENTS"
      ? ["جميع الطلاب"]
      : r.visibility === "GROUP"
        ? r.groups.map((g) => g.name)
        : r.groupClasses.map((c) => `${c.group.name} — ${c.branch.name}`),
  publisher: `${r.publishedBy.firstName} ${r.publishedBy.lastName}`,
  createdAt: tunisDateOf(r.createdAt),
  canManage: r.canManage,
})

export type ResourceScope = "admin" | "teacher" | "student"
export const resourcesKey = ["resources"] as const
const clean = (q: object): Query => Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined && v !== "")) as Query

export interface ResourceFilters {
  search?: string
  type?: ResourceType
  visibility?: ResourceVisibilityType
  groupClassId?: string
  /** Teacher management list: only what I published */
  mine?: boolean
}

export function useResources(scope: ResourceScope, filters: ResourceFilters, page: number, pageSize: number) {
  return useQuery({
    queryKey: [...resourcesKey, scope, "list", clean(filters), page, pageSize],
    queryFn: ({ signal }) => api<Page<ResourceDto>>(`/${scope}/resources`, { query: { ...clean(filters), page, pageSize }, signal }),
    placeholderData: (previous) => previous,
  })
}

export function useResource(scope: ResourceScope, id: ID) {
  return useQuery({
    queryKey: [...resourcesKey, scope, "one", id],
    queryFn: ({ signal }) => api<ResourceDto>(`/${scope}/resources/${id}`, { signal }),
  })
}

export interface ResourceInput {
  title: string
  description: string
  type: ResourceType
  externalUrl?: string
  visibility: ResourceVisibilityType
  groupIds: ID[]
  groupClassIds: ID[]
}

/** Accepted files per type (the API checks the real content too). */
export const RESOURCE_FILE_RULES: Partial<Record<ResourceType, { accept: string; mimes: string[]; label: string }>> = {
  PDF: { accept: "application/pdf", mimes: ["application/pdf"], label: "PDF" },
  IMAGE: { accept: "image/jpeg,image/png,image/webp", mimes: ["image/jpeg", "image/png", "image/webp"], label: "JPG أو PNG أو WebP" },
  AUDIO: { accept: "audio/mpeg,audio/mp4,audio/x-m4a,.mp3,.m4a", mimes: ["audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/m4a"], label: "MP3 أو M4A" },
  FILE: {
    accept: "application/pdf,image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,.mp3,.m4a",
    mimes: ["application/pdf", "image/jpeg", "image/png", "image/webp", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/m4a"],
    label: "PDF أو صورة أو تسجيل صوتي",
  },
}
const MB = 1024 * 1024
/** Size limits of the API (images 5 MB, PDF 15 MB, audio 25 MB). */
export function fileSizeError(file: File) {
  const limit = file.type.startsWith("image/") ? 5 * MB : file.type === "application/pdf" ? 15 * MB : 25 * MB
  return file.size > limit ? `حجم الملف يتجاوز الحد المسموح (${limit / MB} م.ب)` : undefined
}

/**
 * Create / edit: a new file is uploaded first (EDUCATIONAL_RESOURCE, with
 * progress; a teacher's upload is tied to one of the target classes), then
 * the resource is saved with its fileId.
 */
export function useSaveResource(scope: "admin" | "teacher", id?: ID) {
  return useApiMutation(
    async ({ input, file, onProgress }: { input: ResourceInput; file?: File | null; onProgress?: (percent: number) => void }) => {
      let fileId: string | undefined
      if (file) {
        const stored = await uploadFile<StoredFileInfo>(
          "/files",
          { purpose: "EDUCATIONAL_RESOURCE", ...(scope === "teacher" ? { groupClassId: input.groupClassIds[0] } : {}) },
          file,
          { onProgress }
        )
        fileId = stored.id
      }
      const isLink = input.type === "VIDEO_LINK" || input.type === "EXTERNAL_LINK"
      const body = {
        title: input.title,
        description: input.description,
        type: input.type,
        ...(isLink ? { externalUrl: input.externalUrl, fileId: null } : fileId ? { fileId } : {}),
        ...(scope === "admin"
          ? {
              visibility: input.visibility,
              ...(input.visibility === "GROUP" ? { groupIds: input.groupIds } : {}),
              ...(input.visibility === "GROUP_CLASS" ? { groupClassIds: input.groupClassIds } : {}),
            }
          : { groupClassIds: input.groupClassIds }),
      }
      return id
        ? api<ResourceDto>(`/${scope}/resources/${id}`, { method: "PATCH", body })
        : api<ResourceDto>(`/${scope}/resources`, { method: "POST", body })
    },
    [resourcesKey, notificationKeys.all]
  )
}

export function useDeleteResource(scope: "admin" | "teacher") {
  return useApiMutation((id: ID) => api(`/${scope}/resources/${id}`, { method: "DELETE" }), [resourcesKey])
}

/**
 * Opens a private file (Bearer fetch → object URL). The tab is opened
 * synchronously (popup blockers), then pointed at the file; downloads use
 * a temporary link. The object URL is revoked after a minute.
 */
export async function openPrivateFile(file: NonNullable<ResourceView["file"]>, download: boolean) {
  const tab = download ? null : window.open("", "_blank")
  try {
    const blob = await fetchPrivateBlob(file.url)
    const url = URL.createObjectURL(blob)
    if (tab) tab.location.href = url
    else {
      const link = document.createElement("a")
      link.href = url
      link.download = file.fileName
      link.click()
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (error) {
    tab?.close()
    throw error
  }
}
