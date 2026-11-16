import type { CurrentAcademicYear } from '@/features/preferences/preferences';

import { attendanceState, type AttendanceState } from './attendance-model';
import type { PlatformClock } from './dashboard-model';
import type { Session, SessionStatus } from './types';

/*
 * «الحصص» of the signed-in teacher: GET /teacher/sessions (the backend keeps
 * only sessions whose TEAM SNAPSHOT includes me, paginated, ≤ 100 per page).
 * Every filter below is a real query parameter of SessionListQueryDto.
 */

/* ---------------------------------- tabs ---------------------------------- */

/**
 * The web's teacher tabs (frontend sessions-view.tsx). One difference, on
 * purpose: the mobile «القادمة» starts TODAY (the web's starts tomorrow, next
 * to its «اليوم» tab) so the default view never hides today's lessons.
 */
export type SessionTab = 'upcoming' | 'today' | 'pending' | 'done' | 'cancelled' | 'all';
export const SESSION_TABS: readonly SessionTab[] = ['today','upcoming', 'pending', 'done', 'cancelled', 'all'];
export const DEFAULT_SESSION_TAB: SessionTab = 'today';

export interface SessionQuery {
  from?: string;
  to?: string;
  status?: SessionStatus;
  order: 'asc' | 'desc';
  groupClassId?: string;
}

/** Each tab is a server query: status + date bounds + order. Cancelled lessons only in «الملغاة» and «الكل». */
export function tabQuery(tab: SessionTab, today: string): SessionQuery {
  switch (tab) {
    case 'upcoming':
      return { from: today, status: 'SCHEDULED', order: 'asc' };
    case 'today':
      return { from: today, to: today, order: 'asc' };
    // «حضور غير مكتمل» — the web's exact query: lessons up to today still
    // SCHEDULED (a session completes when its whole roster is recorded)
    case 'pending':
      return { to: today, status: 'SCHEDULED', order: 'desc' };
    case 'done':
      return { status: 'COMPLETED', order: 'desc' };
    case 'cancelled':
      return { status: 'CANCELLED', order: 'desc' };
    case 'all':
      return { order: 'desc' };
  }
}

/* --------------------------------- periods --------------------------------- */

export type PeriodPreset = 'all' | 'week' | 'month' | 'year';
export const PERIOD_PRESETS: readonly PeriodPreset[] = ['all', 'week', 'month', 'year'];

export function addDays(date: string, days: number): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week (the web's startOfWeek). */
export function startOfWeek(date: string): string {
  const day = new Date(`${date.slice(0, 10)}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

/** The web's resolvePeriod presets (week = Monday→Sunday, calendar month, current academic year). */
export function periodRange(
  preset: PeriodPreset,
  today: string,
  year: CurrentAcademicYear | null,
): { from?: string; to?: string } {
  switch (preset) {
    case 'week': {
      const from = startOfWeek(today);
      return { from, to: addDays(from, 6) };
    }
    case 'month': {
      const from = `${today.slice(0, 8)}01`;
      const next = new Date(`${from}T00:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      return { from, to: addDays(next.toISOString().slice(0, 10), -1) };
    }
    case 'year':
      return year ? { from: year.startDate, to: year.endDate } : {};
    case 'all':
      return {};
  }
}

/**
 * Tab ∩ period ∩ class (web combine): the tighter bound wins. null when the
 * intersection is empty — then nothing is requested (an empty list is shown).
 */
export function combineQuery(
  tab: SessionQuery,
  range: { from?: string; to?: string },
  groupClassId?: string,
): SessionQuery | null {
  const from = [tab.from, range.from].filter((d): d is string => Boolean(d)).sort().at(-1);
  const to = [tab.to, range.to].filter((d): d is string => Boolean(d)).sort()[0];
  if (from && to && from > to) return null;
  return {
    ...tab,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(groupClassId ? { groupClassId } : {}),
  };
}

/* ------------------------------- view models ------------------------------- */

export interface SessionItem {
  id: string;
  date: string;
  start: string;
  end: string;
  status: SessionStatus;
  isToday: boolean;
  isExtra: boolean;
  /** Host first, then the other classes of a shared lesson */
  groupNames: string[];
  isShared: boolean;
  /** THIS session's room and branch (snapshot), never the class's usual ones */
  roomName: string;
  branchName: string;
  cancellationReason: string | null;
  /** Attendance progress (web sessionProgress) from the session's own counts */
  progress: AttendanceState;
  expected: number;
  recorded: number;
}

export function toSessionItem(s: Session, clock: PlatformClock): SessionItem {
  const groups = [s.groupClass, ...s.additionalClasses].map((c) => c.group.name);
  return {
    id: s.id,
    date: s.date,
    start: s.startTime,
    end: s.endTime,
    status: s.status,
    isToday: s.date === clock.today,
    isExtra: s.isExtra,
    groupNames: groups,
    isShared: s.additionalClasses.length > 0,
    roomName: s.room.name,
    branchName: s.room.branch.name,
    cancellationReason: s.status === 'CANCELLED' ? s.cancellationReason : null,
    progress: attendanceState(s, s.attendance, clock),
    expected: s.attendance.expected,
    recorded: s.attendance.recorded,
  };
}

export interface SessionDay {
  date: string;
  items: SessionItem[];
}

/** Consecutive sessions of the same date under one day header (keeps the API's order). */
export function groupByDay(items: readonly SessionItem[]): SessionDay[] {
  const days: SessionDay[] = [];
  for (const item of items) {
    const last = days[days.length - 1];
    if (last && last.date === item.date) last.items.push(item);
    else days.push({ date: item.date, items: [item] });
  }
  return days;
}

/** The team of a session, me marked (role as it was snapshotted for THIS session). */
export function sessionTeam(s: Session, myTeacherId: string) {
  return s.teachers.map((t) => ({
    id: t.id,
    name: `${t.firstName} ${t.lastName}`,
    role: t.role,
    isMe: t.id === myTeacherId,
  }));
}

/** My role in THIS session (null if the snapshot does not list me — the API would not return it). */
export function myRoleIn(s: Session, myTeacherId: string): 'SUPERVISOR' | 'ASSISTANT' | null {
  return s.teachers.find((t) => t.id === myTeacherId)?.role ?? null;
}
