import type { InfiniteData } from '@tanstack/react-query';
import type { Href } from 'expo-router';

import type { IconName } from '@/components/ui';
import { ar } from '@/i18n/ar';
import { formatDate, formatDayMonth, ltr, sameYear } from '@/i18n/format';
import type { Page } from '@/services/api';

import { platformClock } from '@/features/teacher/dashboard-model';

import type { AppNotification } from './notification-types';

const t = ar.notifications;

/* --------------------------------- badge --------------------------------- */

/** The bell's badge: hidden at 0 (null), "99+" beyond 99. */
export function badgeLabel(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  return count > 99 ? '99+' : String(Math.floor(count));
}

/* --------------------------------- icons --------------------------------- */

/** Same subjects as the web bell (a lesson's change, not its attendance, shows the calendar). */
const ICON_OF: Record<string, IconName> = {
  RESOURCE: 'resources',
  SESSION: 'attendance',
  ANNOUNCEMENT: 'announcements',
  REGISTRATION_REQUEST: 'registered',
  ONBOARDING_SUBMISSION: 'link',
  STUDENT: 'student',
  GROUP_CLASS: 'classes',
  GROUP: 'students',
  FEEDBACK: 'notes',
};

export function notificationIcon(n: Pick<AppNotification, 'type' | 'entityType'>): IconName {
  if (n.type === 'SESSION_CHANGED') return 'calendar';
  return ICON_OF[n.entityType ?? ''] ?? 'bell';
}

/* ------------------------------- timestamps ------------------------------- */

/** The day before a "YYYY-MM-DD" calendar day. */
function previousDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/**
 * «الآن» / «منذ 5 دقائق» within the hour, then «اليوم، 14:05», «أمس، 09:30»,
 * «16 نوفمبر، 08:00» (the year only when it differs) — in the PLATFORM
 * timezone, as every other date of the app.
 */
export function formatNotificationTime(createdAt: string, now: Date, timeZone: string | undefined): string {
  const at = new Date(createdAt);
  if (Number.isNaN(at.getTime())) return '';
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return t.time.now;
  if (minutes < 60) return t.time.minutes(minutes);
  const then = platformClock(timeZone, at);
  const today = platformClock(timeZone, now).today;
  const time = ltr(then.time);
  if (then.today === today) return t.time.today(time);
  if (then.today === previousDay(today)) return t.time.yesterday(time);
  return t.time.on(sameYear(then.today, today) ? formatDayMonth(then.today) : formatDate(then.today), time);
}

/* ------------------------------- navigation ------------------------------- */

/** What must still be true NOW for the teacher to open it (a notification grants no access). */
export type TargetCheck =
  | { kind: 'resource' | 'announcement' | 'session'; id: string }
  | { kind: 'workspace'; list: 'students' | 'groupClasses' | 'groups'; id: string }
  | { kind: 'feedback'; id: string };

export type NotificationTarget =
  /** No linked content: reading it is all there is */
  | { kind: 'none' }
  /** The content was deleted (available: false) */
  | { kind: 'gone' }
  /** A subject the teacher app has no screen for (admin pages, a newer type) */
  | { kind: 'unsupported' }
  | { kind: 'open'; href: Href; check: TargetCheck };

/**
 * Teacher workspace mapping — the web's notificationTarget('teacher')
 * (frontend/src/lib/communication.ts), limited to screens that exist on
 * mobile:
 *  RESOURCE → /teacher/resources/[id]          ANNOUNCEMENT → /teacher/announcements/[id]
 *  SESSION  → /teacher/sessions/[id]           (ATTENDANCE_MODIFIED → …/attendance)
 *  STUDENT  → /teacher/students/[id]           GROUP_CLASS → /teacher/classes/[id]
 *  GROUP    → /teacher/classes (the tab)       FEEDBACK → /feedback/[id] (my own submission)
 *  REGISTRATION_REQUEST / ONBOARDING_SUBMISSION → unsupported
 */
export function teacherNotificationTarget(n: Pick<AppNotification, 'type' | 'entityType' | 'entityId' | 'available'>): NotificationTarget {
  if (!n.entityType || !n.entityId) return { kind: 'none' };
  if (n.available === false) return { kind: 'gone' };
  const id = n.entityId;
  switch (n.entityType) {
    case 'RESOURCE':
      return { kind: 'open', href: { pathname: '/teacher/resources/[id]', params: { id } }, check: { kind: 'resource', id } };
    case 'ANNOUNCEMENT':
      return { kind: 'open', href: { pathname: '/teacher/announcements/[id]', params: { id } }, check: { kind: 'announcement', id } };
    case 'SESSION':
      return {
        kind: 'open',
        href:
          n.type === 'ATTENDANCE_MODIFIED'
            ? { pathname: '/teacher/sessions/[id]/attendance', params: { id } }
            : { pathname: '/teacher/sessions/[id]', params: { id } },
        check: { kind: 'session', id },
      };
    case 'STUDENT':
      return { kind: 'open', href: { pathname: '/teacher/students/[id]', params: { id } }, check: { kind: 'workspace', list: 'students', id } };
    case 'GROUP_CLASS':
      return { kind: 'open', href: { pathname: '/teacher/classes/[id]', params: { id } }, check: { kind: 'workspace', list: 'groupClasses', id } };
    case 'GROUP':
      return { kind: 'open', href: '/teacher/classes', check: { kind: 'workspace', list: 'groups', id } };
    case 'FEEDBACK':
      // «الملاحظات والاقتراحات»: my own submission (its status changed, or the admins answered)
      return { kind: 'open', href: { pathname: '/feedback/[id]', params: { id, space: 'teacher' } }, check: { kind: 'feedback', id } };
    default:
      return { kind: 'unsupported' };
  }
}

/* ------------------------------ cache patches ------------------------------ */

type Pages = InfiniteData<Page<AppNotification>, number>;

/** The server's answer for one notification, put in every loaded page (nothing else changes). */
export function patchPages(data: Pages | undefined, saved: AppNotification): Pages | undefined {
  if (!data) return data;
  return { ...data, pages: data.pages.map((p) => ({ ...p, data: p.data.map((n) => (n.id === saved.id ? saved : n)) })) };
}

/** After a CONFIRMED «read all»: every loaded notification is read. */
export function markPagesRead(data: Pages | undefined, readAt: string): Pages | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((p) => ({ ...p, data: p.data.map((n) => (n.isRead ? n : { ...n, isRead: true, readAt })) })),
  };
}
