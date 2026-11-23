"use client"

import { useQuery } from "@tanstack/react-query"

import { useApiMutation } from "./academic"
import { api, uploadFile, type Page } from "./client"

/*
 * «الملاحظات والاقتراحات» (backend src/feedback): a teacher or a student sends feedback about the
 * application and follows it (their OWN only: /teacher/feedback, /student/feedback); the admins
 * manage and answer it (/admin/feedback). The sender, the date and the status are never sent by
 * the client — the server takes them from the account.
 */

export type FeedbackCategory = "BUG" | "IMPROVEMENT" | "OTHER"
export type FeedbackStatus = "NEW" | "REVIEWING" | "RESOLVED" | "CLOSED"
export type FeedbackSpace = "teacher" | "student"

export const FEEDBACK_CATEGORIES: FeedbackCategory[] = ["BUG", "IMPROVEMENT", "OTHER"]
export const FEEDBACK_STATUSES: FeedbackStatus[] = ["NEW", "REVIEWING", "RESOLVED", "CLOSED"]

export const feedbackCategoryLabel: Record<FeedbackCategory, string> = {
  BUG: "الإبلاغ عن مشكلة",
  IMPROVEMENT: "اقتراح تحسين",
  OTHER: "ملاحظة أخرى",
}

export const feedbackStatusLabel: Record<FeedbackStatus, string> = {
  NEW: "جديد",
  REVIEWING: "قيد المراجعة",
  RESOLVED: "تم الحل",
  CLOSED: "مغلق",
}

export const FEEDBACK_TITLE_MAX = 120
export const FEEDBACK_TEXT_MAX = 3000
/** Screenshots: images the server accepts (FEEDBACK_SCREENSHOT), 5 MB at most. */
export const SCREENSHOT_TYPES = ["image/jpeg", "image/png", "image/webp"]
export const SCREENSHOT_ACCEPT = SCREENSHOT_TYPES.join(",")
export const SCREENSHOT_MAX_BYTES = 5 * 1024 * 1024

export interface Feedback {
  id: string
  category: FeedbackCategory
  title: string
  description: string
  status: FeedbackStatus
  screenshot: { id: string; url: string; mimeType: string; size: number } | null
  response: string | null
  respondedAt: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
  version: number
}

export interface AdminFeedback extends Feedback {
  sender: { userId: string; name: string }
  senderRole: "TEACHER" | "STUDENT"
  respondedBy: { userId: string; name: string } | null
  platform: "WEB" | "ANDROID" | "IOS" | null
  appVersion: string | null
  screenPath: string | null
}

export interface FeedbackDraft {
  category: FeedbackCategory
  title: string
  description: string
  screenshot: File | null
}

/** The Arabic reason a picked file cannot be sent as a screenshot, or null. */
export function screenshotError(file: File) {
  if (!SCREENSHOT_TYPES.includes(file.type)) return "الصيغ المقبولة: JPG أو PNG أو WebP."
  if (file.size > SCREENSHOT_MAX_BYTES) return "حجم الصورة يتجاوز 5 م.ب."
  return null
}

export const feedbackKeys = {
  all: ["feedback"] as const,
  mine: (space: FeedbackSpace) => ["feedback", space] as const,
  admin: ["feedback", "admin"] as const,
}

export function useMyFeedback(space: FeedbackSpace, page: number, pageSize: number) {
  return useQuery({
    queryKey: [...feedbackKeys.mine(space), "list", page, pageSize],
    queryFn: ({ signal }) => api<Page<Feedback>>(`/${space}/feedback`, { query: { page, pageSize }, signal }),
    placeholderData: (previous) => previous,
  })
}

export function useMyFeedbackItem(space: FeedbackSpace, id: string) {
  return useQuery({
    queryKey: [...feedbackKeys.mine(space), "detail", id],
    queryFn: ({ signal }) => api<Feedback>(`/${space}/feedback/${id}`, { signal }),
  })
}

/**
 * «إرسال الملاحظة»: the screenshot (if any) is uploaded first, then the feedback — with the
 * technical context the browser knows (no page contents, no identifiers).
 */
export function useSendFeedback(space: FeedbackSpace) {
  return useApiMutation(async (draft: FeedbackDraft) => {
    const screenshotFileId = draft.screenshot
      ? (await uploadFile<{ id: string }>("/files", { purpose: "FEEDBACK_SCREENSHOT" }, draft.screenshot)).id
      : undefined
    return api<Feedback>(`/${space}/feedback`, {
      method: "POST",
      body: {
        category: draft.category,
        title: draft.title.trim(),
        description: draft.description.trim(),
        screenshotFileId,
        platform: "WEB",
        ...(process.env.NEXT_PUBLIC_APP_VERSION ? { appVersion: process.env.NEXT_PUBLIC_APP_VERSION } : {}),
        screenPath: typeof window !== "undefined" ? window.location.pathname : undefined,
      },
    })
  }, [feedbackKeys.mine(space)])
}

export interface AdminFeedbackFilters {
  page: number
  pageSize: number
  status?: FeedbackStatus
  category?: FeedbackCategory
  search?: string
}

export function useAdminFeedbackList(filters: AdminFeedbackFilters) {
  return useQuery({
    queryKey: [...feedbackKeys.admin, "list", filters],
    queryFn: ({ signal }) =>
      api<Page<AdminFeedback> & { newCount: number }>("/admin/feedback", { query: { ...filters }, signal }),
    placeholderData: (previous) => previous,
  })
}

export function useAdminFeedback(id: string) {
  return useQuery({
    queryKey: [...feedbackKeys.admin, "detail", id],
    queryFn: ({ signal }) => api<AdminFeedback>(`/admin/feedback/${id}`, { signal }),
  })
}

/** A status and / or the response (null removes it); the version read (FEEDBACK_CHANGED otherwise). */
export function useUpdateFeedback(id: string) {
  return useApiMutation(
    (body: { version: number; status?: FeedbackStatus; response?: string | null }) =>
      api<AdminFeedback>(`/admin/feedback/${id}`, { method: "PATCH", body }),
    [feedbackKeys.admin]
  )
}
