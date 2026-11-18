import { api, type Page } from '@/services/api';

import type { AppNotification } from './notification-types';

/*
 * The shared notification endpoints (any signed-in role; the account comes
 * from the access token). No new endpoint: the same ones as the web bell.
 */
const BASE = '/notifications';

/** GET /api/notifications?page&pageSize[&unreadOnly=true] — newest first. */
export const fetchNotifications = (query: { page: number; pageSize: number; unreadOnly?: boolean }, signal?: AbortSignal) =>
  api<Page<AppNotification>>(BASE, {
    query: { page: query.page, pageSize: query.pageSize, ...(query.unreadOnly ? { unreadOnly: true } : {}) },
    signal,
  });

/** GET /api/notifications/unread-count → { count } */
export const fetchUnreadCount = (signal?: AbortSignal) => api<{ count: number }>(`${BASE}/unread-count`, { signal });

/** PATCH /api/notifications/:id/read — idempotent; 404 NOTIFICATION_NOT_FOUND (also another account's). */
export const markNotificationRead = (id: string) =>
  api<AppNotification>(`${BASE}/${encodeURIComponent(id)}/read`, { method: 'PATCH' });

/** PATCH /api/notifications/read-all → { updated } */
export const markAllNotificationsRead = () => api<{ updated: number }>(`${BASE}/read-all`, { method: 'PATCH' });
