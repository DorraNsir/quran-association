import type { Page } from '@/services/api';

import type { AppNotification } from '../notification-types';

/** Test-only NotificationDto shapes (never used by the running app). */
export function notificationFixture(id: string, extra: Partial<AppNotification> = {}): AppNotification {
  const isRead = extra.isRead ?? false;
  return {
    id,
    type: 'RESOURCE_PUBLISHED',
    title: 'مورد جديد',
    message: `نشر الأستاذ أحمد موردًا جديدًا: «${id}»`,
    entityType: 'RESOURCE',
    entityId: `res-${id}`,
    available: true,
    createdAt: '2026-11-18T09:00:00.000Z',
    readAt: isRead ? '2026-11-18T10:00:00.000Z' : null,
    isRead,
    ...extra,
  };
}

export const notificationPage = (data: AppNotification[], page = 1, totalPages = 1, total = data.length): Page<AppNotification> => ({
  data,
  meta: { page, pageSize: 20, total, totalPages },
});
