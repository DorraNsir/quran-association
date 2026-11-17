/*
 * «الإعلانات» DTOs — backend communication/announcement.dto.ts (teacher routes).
 */
export type AnnouncementAudience = 'EVERYONE' | 'TEACHERS' | 'STUDENTS' | 'SPECIFIC_GROUP_CLASSES' | 'SPECIFIC_BRANCHES';
export type AnnouncementStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';
/** Derived by the server for today: only ACTIVE reaches readers. */
export type AnnouncementState = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'EXPIRED' | 'ARCHIVED';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  audience: AnnouncementAudience;
  status: AnnouncementStatus;
  state: AnnouncementState;
  scheduledFor: string | null;
  scheduledForLocal: string | null;
  publishedAt: string | null;
  /** Last day shown (platform calendar, inclusive) */
  expiresAt: string | null;
  archivedAt: string | null;
  groupClasses: { id: string; group: { id: string; name: string }; branch: { id: string; name: string } }[];
  branches: { id: string; name: string }[];
  publishedBy: { id: string; firstName: string; lastName: string };
  /** The server's answer: I wrote it (only then edit / publish / archive / delete) */
  canManage: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementFilters {
  search?: string;
  status?: AnnouncementStatus;
  groupClassId?: string;
  /** Only announcements I wrote */
  mine?: boolean;
}

/** TeacherAnnouncementDto: always SPECIFIC_GROUP_CLASSES, toward my current classes; no scheduling. */
export interface TeacherAnnouncementBody {
  title: string;
  content: string;
  groupClassIds: string[];
  expiresAt?: string | null;
  mode?: 'PUBLISH_NOW' | 'DRAFT';
}

export interface PublishResult {
  announcement: Announcement;
  /** Accounts notified by this request (0 for a draft) */
  notifiedCount: number;
}
