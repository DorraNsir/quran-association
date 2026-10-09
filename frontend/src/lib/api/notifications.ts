"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { tunisDateOf } from "@/lib/dates"
import type { UserNotification } from "@/types/domain"

import { api, type Page } from "./client"

/** NotificationDto (API): read state is readAt (isRead is derived). */
export interface NotificationDto {
  id: string
  type: "RESOURCE_PUBLISHED" | "ANNOUNCEMENT_PUBLISHED"
  title: string
  message: string
  entityType: "RESOURCE" | "ANNOUNCEMENT"
  entityId: string
  createdAt: string
  readAt: string | null
  isRead: boolean
}

/** Adapted to the existing UI type (createdAt as the Tunis calendar day). */
export function toNotification(n: NotificationDto, userId: string): UserNotification {
  return {
    id: n.id,
    userId,
    type: n.type,
    title: n.title,
    message: n.message,
    entityType: n.entityType,
    entityId: n.entityId,
    isRead: n.readAt !== null,
    createdAt: tunisDateOf(n.createdAt),
  }
}

/** Polling, not push: every 30 s while the tab is visible (no WebSocket by design). */
const POLL_MS = 30_000

export const notificationKeys = {
  all: ["notifications"] as const,
  list: (params: { unreadOnly?: boolean; page?: number; pageSize?: number }) => ["notifications", "list", params] as const,
  unread: ["notifications", "unread-count"] as const,
}

export function useNotifications(params: { unreadOnly?: boolean; page?: number; pageSize?: number } = {}) {
  return useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: ({ signal }) =>
      api<Page<NotificationDto>>("/notifications", {
        query: { page: params.page ?? 1, pageSize: params.pageSize ?? 20, unreadOnly: params.unreadOnly || undefined },
        signal,
      }),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
  })
}

export function useUnreadCount() {
  return useQuery({
    queryKey: notificationKeys.unread,
    queryFn: ({ signal }) => api<{ count: number }>("/notifications/unread-count", { signal }),
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: false,
    select: (r) => r.count,
  })
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<NotificationDto>(`/notifications/${id}/read`, { method: "PATCH" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<{ updated: number }>("/notifications/read-all", { method: "PATCH" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  })
}
