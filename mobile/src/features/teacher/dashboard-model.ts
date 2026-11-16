import type { CurrentAcademicYear } from '@/features/preferences/preferences';

import type {
  ClassMemorization,
  RecordStatus,
  Semester,
  TeacherWorkspace,
  Weekday,
} from './types';

/* ------------------------------ platform clock ------------------------------ */

export interface PlatformClock {
  /** YYYY-MM-DD in the platform timezone */
  today: string;
  /** HH:mm in the platform timezone */
  time: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * "Now" in the platform timezone (PlatformPreferences.timezone, e.g.
 * Africa/Tunis) — the backend dates sessions in that zone, not the phone's.
 * Falls back to the device clock if the JS engine lacks that zone.
 */
export function platformClock(timeZone: string | undefined, now: Date = new Date()): PlatformClock {
  if (timeZone) {
    try {
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-GB', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        })
          .formatToParts(now)
          .map((p) => [p.type, p.value]),
      );
      if (parts.year && parts.month && parts.day && parts.hour && parts.minute)
        return {
          today: `${parts.year}-${parts.month}-${parts.day}`,
          time: `${parts.hour}:${parts.minute}`,
        };
    } catch {
      // Unknown zone in this engine: use the device clock below
    }
  }
  return {
    today: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}

/** Semester containing `today`, else the first — the web's defaultPeriod rule. */
export function currentSemester(year: CurrentAcademicYear, today: string): Semester {
  if (today >= year.secondSemester.startDate && today <= year.secondSemester.endDate)
    return 'SECOND';
  return 'FIRST';
}

/* --------------------------------- classes --------------------------------- */

export const WEEK_ORDER: readonly Weekday[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

export interface ClassSlot {
  id: string;
  day: Weekday;
  start: string;
  end: string;
  roomName: string | null;
  /**
   * The room's branch when it is NOT the class's own branch (a shared slot
   * hosted elsewhere) — never assume every lesson is in the class's branch.
   */
  roomBranchName: string | null;
  /** «حصة مشتركة» with other classes */
  shared: boolean;
  /** The other participating groups of a shared slot (empty otherwise) */
  sharedWith: string[];
}

export type TeachingRole = 'SUPERVISOR' | 'ASSISTANT';

export interface TeamMember {
  id: string;
  name: string;
  role: TeachingRole;
  isMe: boolean;
}

export interface TeacherClassSummary {
  id: string;
  groupName: string;
  audience: string | null;
  branchName: string;
  /** Rooms the class meets in: its own slots first, then shared slots (web roomsByClass) */
  rooms: string[];
  role: TeachingRole;
  status: RecordStatus;
  activeStudents: number;
  slots: ClassSlot[];
  /** Supervisor first, then assistants */
  team: TeamMember[];
}

/**
 * «مجموعاتي»: classes where I am supervisor or assistant (the bundle may
 * also carry other classes for shared-slot context), with their current
 * active students and weekly slots — all from GET /teacher/workspace.
 */
export function teacherClasses(ws: TeacherWorkspace): TeacherClassSummary[] {
  const me = ws.teacher.id;
  const groups = new Map(ws.groups.map((g) => [g.id, g]));
  const branches = new Map(ws.branches.map((b) => [b.id, b]));
  const rooms = new Map(ws.rooms.map((r) => [r.id, r]));
  const teachers = new Map(ws.teachers.map((t) => [t.id, t]));
  const nameOf = (id: string) => {
    const t = id === me ? ws.teacher : teachers.get(id);
    return t ? `${t.firstName} ${t.lastName}` : null;
  };
  const byWeek = <T extends { dayOfWeek: Weekday; startTime: string }>(a: T, b: T) =>
    WEEK_ORDER.indexOf(a.dayOfWeek) - WEEK_ORDER.indexOf(b.dayOfWeek) ||
    a.startTime.localeCompare(b.startTime);

  return ws.groupClasses
    .filter((c) => c.status !== 'ARCHIVED')
    .filter((c) => c.supervisorId === me || c.assistantIds.includes(me))
    .map((c) => {
      // Same rule as the web (participatesIn): the host class or an additional one
      const own = ws.schedules.filter((s) => s.groupClassId === c.id).sort(byWeek);
      const joined = ws.schedules
        .filter((s) => s.groupClassId !== c.id && s.additionalGroupClassIds.includes(c.id))
        .sort(byWeek);
      const roomNames = [...own, ...joined]
        .map((s) => rooms.get(s.roomId)?.name)
        .filter((n): n is string => Boolean(n));
      const slots: ClassSlot[] = [...own, ...joined].sort(byWeek).map((s) => {
        const room = rooms.get(s.roomId);
        const sharedWith = s.participants
          .filter((p) => p.groupClassId !== c.id)
          .map((p) => p.group.name);
        return {
          id: s.id,
          day: s.dayOfWeek,
          start: s.startTime,
          end: s.endTime,
          roomName: room?.name ?? null,
          roomBranchName:
            room && room.branchId !== c.branchId ? (branches.get(room.branchId)?.name ?? null) : null,
          shared: s.additionalGroupClassIds.length > 0 || s.participants.length > 1,
          sharedWith,
        };
      });
      const team: TeamMember[] = [
        { id: c.supervisorId, role: 'SUPERVISOR' as const },
        ...c.assistantIds
          .filter((id) => id !== c.supervisorId)
          .map((id) => ({ id, role: 'ASSISTANT' as const })),
      ].flatMap((m) => {
        const name = nameOf(m.id);
        return name ? [{ ...m, name, isMe: m.id === me }] : [];
      });
      const group = groups.get(c.groupId);
      return {
        id: c.id,
        groupName: group?.name ?? '—',
        audience: group?.audience ?? null,
        branchName: branches.get(c.branchId)?.name ?? '—',
        rooms: [...new Set(roomNames)],
        role: c.supervisorId === me ? ('SUPERVISOR' as const) : ('ASSISTANT' as const),
        status: c.status,
        activeStudents: ws.students.filter((s) => s.groupClassId === c.id && s.status === 'ACTIVE')
          .length,
        slots,
        team,
      };
    })
    // The web's order: supervisor assignments first, then by group name
    .sort(
      (a, b) =>
        (a.role === b.role ? 0 : a.role === 'SUPERVISOR' ? -1 : 1) ||
        a.groupName.localeCompare(b.groupName, 'ar'),
    );
}

/** «طلابي»: active students currently placed in my classes. */
export function activeStudentCount(ws: TeacherWorkspace, classIds: ReadonlySet<string>): number {
  return ws.students.filter(
    (s) => s.status === 'ACTIVE' && s.groupClassId !== null && classIds.has(s.groupClassId),
  ).length;
}

/* --------------------------------- sessions --------------------------------- */

/* ------------------------------- memorization ------------------------------- */

export interface MemorizationProgress {
  groupClassId: string;
  groupName: string;
  /** Active students currently in the class */
  total: number;
  /** …whose last memorized surah is recorded for the semester */
  recorded: number;
}

/** Same population as the web dashboard: current, active members of the class. */
export function memorizationProgress(dto: ClassMemorization): MemorizationProgress {
  const roster = dto.students.filter((s) => s.currentMember && s.studentStatus === 'ACTIVE');
  return {
    groupClassId: dto.groupClass.id,
    groupName: dto.groupClass.group.name,
    total: roster.length,
    recorded: roster.filter((s) => s.lastMemorizedSurahNumber !== null).length,
  };
}

/* --------------------------------- formatting -------------------------------- */

// Date and number formatting lives in src/i18n/format.ts (one Arabic formatter)
export { weekdayOf } from '@/i18n/format';
