/*
 * NotificationDto (backend src/communication/notification.dto.ts), read
 * as is. GET /api/notifications returns ONLY the signed-in account's own
 * notifications, newest first; any role.
 */
export type NotificationType =
  | 'RESOURCE_PUBLISHED'
  | 'ANNOUNCEMENT_PUBLISHED'
  | 'ATTENDANCE_MODIFIED'
  | 'REGISTRATION_REQUEST_SUBMITTED'
  | 'ONBOARDING_SUBMITTED'
  | 'STUDENT_JOINED_CLASS'
  | 'STUDENT_TRANSFERRED'
  | 'STUDENT_LEFT_CLASS'
  | 'GROUP_CHANGED'
  | 'CLASS_CHANGED'
  | 'SESSION_CHANGED';

export type NotificationEntity =
  | 'RESOURCE'
  | 'ANNOUNCEMENT'
  | 'SESSION'
  | 'REGISTRATION_REQUEST'
  | 'ONBOARDING_SUBMISSION'
  | 'STUDENT'
  | 'GROUP_CLASS'
  | 'GROUP';

export interface AppNotification {
  id: string;
  /** A newer server may send a type this version does not know yet */
  type: NotificationType | (string & {});
  /** Arabic, written by the server */
  title: string;
  message: string;
  /** null: nothing to open */
  entityType: NotificationEntity | (string & {}) | null;
  entityId: string | null;
  /** false once the linked content was deleted (the notification stays in the history) */
  available: boolean;
  createdAt: string;
  readAt: string | null;
  isRead: boolean;
}
