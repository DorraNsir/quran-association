import { teacherClasses, WEEK_ORDER, type TeachingRole } from './dashboard-model';
import type { TeacherWorkspace, Weekday } from './types';

/*
 * «جدولي»: the RECURRING weekly timetable (prisma WeeklySchedule), from the
 * cached GET /teacher/workspace bundle — the web's teacherWeeklySlots rule
 * (frontend lib/domain.ts):
 *  - only RUNNING classes of mine: the class AND its group ACTIVE (archived
 *    classes never reach the bundle; inactive ones are skipped);
 *  - each class meets in its own slots and in the shared slots it joins;
 *  - a SHARED slot is listed ONCE, under the first of my classes taking part
 *    (supervisor assignments first);
 *  - each slot has ITS OWN room (a class may meet in different rooms).
 * A slot is NOT a dated lesson: whether a lesson takes place on a given date
 * (cancelled, extra, not yet generated…) is only known from the sessions.
 */

export interface WeeklySlotView {
  id: string;
  day: Weekday;
  /** "HH:mm", platform local time */
  start: string;
  end: string;
  minutes: number;
  /** Every participating group, host first (one name for a normal slot) */
  groupNames: string[];
  shared: boolean;
  /** My role in the class this slot is listed under */
  role: TeachingRole;
  /** That class of mine (to open it) */
  classId: string;
  /** THIS slot's room; null when the bundle does not carry it */
  roomName: string | null;
  /** The room's own branch; null when the bundle does not carry it (never guessed) */
  branchName: string | null;
}

/** "17:00" → minutes since midnight. */
const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Slot length in minutes (never negative). */
export function minutesBetween(start: string, end: string): number {
  return Math.max(0, toMinutes(end) - toMinutes(start));
}

export function teacherWeeklySlots(ws: TeacherWorkspace): WeeklySlotView[] {
  const groups = new Map(ws.groups.map((g) => [g.id, g]));
  const rooms = new Map(ws.rooms.map((r) => [r.id, r]));
  const branches = new Map(ws.branches.map((b) => [b.id, b]));
  const rawClasses = new Map(ws.groupClasses.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const slots: WeeklySlotView[] = [];

  // teacherClasses: mine, not archived, supervisor assignments first, by group name
  for (const c of teacherClasses(ws)) {
    const raw = rawClasses.get(c.id);
    const running = c.status === 'ACTIVE' && raw !== undefined && groups.get(raw.groupId)?.status === 'ACTIVE';
    if (!running) continue;
    for (const s of ws.schedules) {
      const participates = s.groupClassId === c.id || s.additionalGroupClassIds.includes(c.id);
      if (!participates || seen.has(s.id)) continue;
      seen.add(s.id);
      const room = rooms.get(s.roomId);
      slots.push({
        id: s.id,
        day: s.dayOfWeek,
        start: s.startTime,
        end: s.endTime,
        minutes: minutesBetween(s.startTime, s.endTime),
        groupNames: s.participants.length ? s.participants.map((p) => p.group.name) : [c.groupName],
        shared: s.additionalGroupClassIds.length > 0 || s.participants.length > 1,
        role: c.role,
        classId: c.id,
        roomName: room?.name ?? null,
        branchName: room ? (branches.get(room.branchId)?.name ?? null) : null,
      });
    }
  }
  return slots.sort(
    (a, b) => WEEK_ORDER.indexOf(a.day) - WEEK_ORDER.indexOf(b.day) || a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
  );
}

export interface ScheduleDay {
  day: Weekday;
  slots: WeeklySlotView[];
}

/** All seven days in the project's week order (Monday first, as the web), empty days included. */
export function weekDays(slots: readonly WeeklySlotView[]): ScheduleDay[] {
  return WEEK_ORDER.map((day) => ({ day, slots: slots.filter((s) => s.day === day) }));
}

export function weeklyMinutes(slots: readonly WeeklySlotView[]): number {
  return slots.reduce((total, s) => total + s.minutes, 0);
}

/** "4 س 30 د" — the web's formatDuration. */
export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!minutes) return `${hours} س`;
  if (!hours) return `${minutes} د`;
  return `${hours} س ${minutes} د`;
}
