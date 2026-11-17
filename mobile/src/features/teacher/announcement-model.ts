import type { PillTone } from '@/components/ui';
import { ApiError } from '@/services/api';

import type { Announcement, AnnouncementState, TeacherAnnouncementBody } from './announcement-types';
import { platformDateOf } from './memorization-model';

/*
 * «الإعلانات» rules — backend announcements.service / announcement.dto (the
 * web's labels). The server stays the authority on visibility, ownership,
 * classes, dates and the publication lock.
 */
export const TITLE_MAX = 200;
export const CONTENT_MAX = 10000;
export const TARGETS_MAX = 50;

/** The web's state badges (green live, amber draft, neutral otherwise). */
export const STATE_TONE: Record<AnnouncementState, PillTone> = {
  ACTIVE: 'success',
  DRAFT: 'warning',
  SCHEDULED: 'info',
  EXPIRED: 'muted',
  ARCHIVED: 'muted',
};

/** The publication day (platform calendar): published, else scheduled, else created. */
export function dayOf(a: Pick<Announcement, 'publishedAt' | 'scheduledFor' | 'createdAt'>, timeZone: string | undefined): string {
  return platformDateOf(a.publishedAt ?? a.scheduledFor ?? a.createdAt, timeZone);
}

/** Who it is addressed to beyond its audience label: the classes («group — branch») or the branches. */
export function audienceTargets(a: Pick<Announcement, 'audience' | 'groupClasses' | 'branches'>): string[] {
  if (a.audience === 'SPECIFIC_GROUP_CLASSES') return a.groupClasses.map((c) => `${c.group.name} — ${c.branch.name}`);
  if (a.audience === 'SPECIFIC_BRANCHES') return a.branches.map((b) => b.name);
  return [];
}

export const authorName = (a: Pick<Announcement, 'publishedBy'>) => `${a.publishedBy.firstName} ${a.publishedBy.lastName}`;

/** A real calendar day "YYYY-MM-DD". */
export function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// ───────────────────────── form ─────────────────────────

export interface AnnouncementDraft {
  title: string;
  content: string;
  classIds: string[];
  /** "" = no end date */
  expiresAt: string;
}

export type AnnouncementInputError =
  | 'titleRequired'
  | 'titleTooLong'
  | 'contentRequired'
  | 'contentTooLong'
  | 'classesRequired'
  | 'tooManyClasses'
  | 'expiryInvalid'
  | 'expiryPast';

/**
 * The DTO's rules before sending. `today` (platform day) only checks a NEW
 * announcement's end date; for an existing one the server compares it with
 * the publication day (INVALID_DATE_RANGE).
 */
export function validateAnnouncement(d: AnnouncementDraft, today: string | null, lockedTargets = false): AnnouncementInputError | null {
  const title = d.title.trim();
  if (!title) return 'titleRequired';
  if (title.length > TITLE_MAX) return 'titleTooLong';
  const content = d.content.trim();
  if (!content) return 'contentRequired';
  if (content.length > CONTENT_MAX) return 'contentTooLong';
  if (!lockedTargets) {
    if (d.classIds.length === 0) return 'classesRequired';
    if (d.classIds.length > TARGETS_MAX) return 'tooManyClasses';
  }
  const expiry = d.expiresAt.trim();
  if (expiry) {
    if (!isDay(expiry)) return 'expiryInvalid';
    if (today && expiry < today) return 'expiryPast';
  }
  return null;
}

export const draftOfAnnouncement = (a: Announcement | undefined, allowed: ReadonlySet<string>, initialClassId?: string): AnnouncementDraft => ({
  title: a?.title ?? '',
  content: a?.content ?? '',
  // A teacher keeps targets only among their own current classes
  // No default audience (as on the web): a new announcement starts with no class;
  // an existing one keeps only targets among my current classes
  classIds: a
    ? a.groupClasses.map((c) => c.id).filter((id) => allowed.has(id))
    : initialClassId && allowed.has(initialClassId)
      ? [initialClassId]
      : [],
  expiresAt: a?.expiresAt ?? '',
});

/** POST body (TeacherAnnouncementDto). */
export function createBody(d: AnnouncementDraft, mode: 'PUBLISH_NOW' | 'DRAFT'): TeacherAnnouncementBody {
  const expiry = d.expiresAt.trim();
  return {
    title: d.title.trim(),
    content: d.content.trim(),
    groupClassIds: d.classIds,
    ...(expiry ? { expiresAt: expiry } : {}),
    mode,
  };
}

/**
 * PATCH body: only what changed. After publication only title, content and
 * the end date may change (the server answers ANNOUNCEMENT_PUBLISHED_LOCKED
 * otherwise), so the classes are never sent for a published one.
 */
export function updateBody(a: Announcement, d: AnnouncementDraft): Partial<Omit<TeacherAnnouncementBody, 'mode'>> {
  const body: Partial<Omit<TeacherAnnouncementBody, 'mode'>> = {};
  if (d.title.trim() !== a.title) body.title = d.title.trim();
  if (d.content.trim() !== a.content) body.content = d.content.trim();
  const expiry = d.expiresAt.trim() || null;
  if (expiry !== (a.expiresAt ?? null)) body.expiresAt = expiry;
  const saved = a.groupClasses.map((c) => c.id);
  const sameClasses = saved.length === d.classIds.length && saved.every((id) => d.classIds.includes(id));
  if (a.status !== 'PUBLISHED' && !sameClasses) body.groupClassIds = d.classIds;
  return body;
}

export type AnnouncementErrorKind = 'offline' | 'notFound' | 'forbidden' | 'conflict' | 'invalid' | 'unknown';

/** Every failure keeps the form; offline is never shown as «denied». */
export function classifyAnnouncementError(error: unknown): AnnouncementErrorKind {
  if (!(error instanceof ApiError)) return 'unknown';
  if (error.isNetwork) return 'offline';
  if (error.isNotFound) return 'notFound';
  if (error.isForbidden) return 'forbidden';
  if (error.status === 409) return 'conflict';
  if (error.status === 400) return 'invalid';
  return 'unknown';
}
