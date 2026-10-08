import { ConflictException, Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client.js';
import type { Weekday } from '../generated/prisma/enums.js';

type Tx = Prisma.TransactionClient;

/**
 * The occupancy a class brings to a time slot: its room and its whole
 * teaching team (supervisor + assistants — availability is per teacher,
 * whatever the assignment type).
 */
export interface ClassOccupancy {
  groupClassId: string;
  roomId: string;
  teacherIds: string[];
}

export interface WeeklySlot {
  dayOfWeek: Weekday;
  start: string;
  end: string;
}

export interface DatedSlot {
  date: string;
  start: string;
  end: string;
}

export type ConflictType = 'CLASS' | 'ROOM' | 'TEACHER';

export interface ConflictDetail {
  type: ConflictType;
  /** The other weekly slot / session it collides with */
  scheduleId?: string;
  sessionId?: string;
  dayOfWeek?: string;
  date?: string;
  startTime: string;
  endTime: string;
  groupClassId: string;
  groupName: string;
  branchName: string;
  roomName: string;
  /** Teachers booked in both (TEACHER conflicts) */
  teachers: { id: string; firstName: string; lastName: string }[];
}

interface Row {
  otherId: string;
  day: string | null;
  date: string | null;
  start: string;
  end: string;
  groupClassId: string;
  groupName: string;
  branchName: string;
  roomName: string;
  sameClass: boolean;
  sameRoom: boolean;
  sharedTeacherIds: string[];
}

const MESSAGES: Record<
  'SCHEDULE' | 'SESSION',
  Record<ConflictType, [string, string]>
> = {
  SCHEDULE: {
    CLASS: [
      'CLASS_SCHEDULE_CONFLICT',
      'للحلقة موعد أسبوعي آخر يتداخل مع هذا التوقيت',
    ],
    ROOM: ['ROOM_SCHEDULE_CONFLICT', 'القاعة مشغولة بحلقة أخرى في هذا التوقيت'],
    TEACHER: [
      'TEACHER_SCHEDULE_CONFLICT',
      'أحد معلمي الحلقة يدرّس حلقة أخرى في هذا التوقيت',
    ],
  },
  SESSION: {
    CLASS: [
      'CLASS_SESSION_CONFLICT',
      'للحلقة حصة أخرى تتداخل مع هذا التوقيت في اليوم نفسه',
    ],
    ROOM: ['ROOM_SESSION_CONFLICT', 'القاعة مشغولة بحصة أخرى في هذا التوقيت'],
    TEACHER: [
      'TEACHER_SESSION_CONFLICT',
      'أحد معلمي الحلقة لديه حصة أخرى في هذا التوقيت',
    ],
  },
};

/**
 * Authoritative scheduling-conflict rules (the frontend only mirrors them).
 *
 *   overlap  ⇔  newStart < existingEnd AND newEnd > existingStart   (touching is fine)
 *
 * - CLASS:   the same class twice at overlapping times;
 * - ROOM:    another class using the same room;
 * - TEACHER: another class whose supervisor/assistants share a teacher.
 *
 * Weekly slots: only RUNNING classes (class ACTIVE and group ACTIVE) occupy
 * rooms and teachers. Dated sessions: every non-CANCELLED session does.
 * Rooms/teachers of a session come from its class (single source of truth).
 *
 * All checks are single set-based SQL queries. Callers run them inside a
 * transaction holding `lockScheduling` so check-then-write cannot race.
 */
@Injectable()
export class ScheduleConflictService {
  /**
   * Serializes every scheduling write (weekly slots, sessions, class room /
   * team / activation). Scheduling writes are rare admin actions, so one
   * transaction-scoped advisory lock is simpler and safer than per-row locks.
   */
  async lockScheduling(tx: Tx) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('scheduling'))`;
  }

  /** Conflicts of weekly slots for a class with the given (possibly proposed) room/team. */
  async weeklyConflicts(
    tx: Tx,
    occupancy: ClassOccupancy,
    slots: WeeklySlot[],
    options: {
      excludeScheduleIds?: string[];
      checkOtherClasses: boolean;
      includeSameClass: boolean;
    },
  ): Promise<ConflictDetail[]> {
    if (slots.length === 0) return [];
    const rows = await tx.$queryRaw<Row[]>`
      SELECT ws.id AS "otherId", ws."dayOfWeek"::text AS day, NULL::text AS date,
             to_char(ws."startTime", 'HH24:MI') AS start, to_char(ws."endTime", 'HH24:MI') AS "end",
             gc.id AS "groupClassId", g.name AS "groupName", b.name AS "branchName", r.name AS "roomName",
             (gc.id = ${occupancy.groupClassId}::uuid) AS "sameClass",
             (gc."roomId" = ${occupancy.roomId}::uuid) AS "sameRoom",
             ARRAY(
               SELECT t FROM (
                 SELECT gc."supervisorId" AS t
                 UNION SELECT a."teacherId" FROM group_class_assistants a WHERE a."groupClassId" = gc.id
               ) team WHERE t = ANY(${occupancy.teacherIds}::uuid[])
             )::text[] AS "sharedTeacherIds"
      FROM unnest(${slots.map((s) => s.dayOfWeek)}::text[], ${slots.map((s) => s.start)}::text[], ${slots.map((s) => s.end)}::text[])
           AS c(day, start, "end")
      JOIN weekly_schedules ws
        ON ws."dayOfWeek"::text = c.day AND ws."startTime" < c."end"::time AND ws."endTime" > c.start::time
      JOIN group_classes gc ON gc.id = ws."groupClassId"
      JOIN groups g ON g.id = gc."groupId"
      JOIN branches b ON b.id = gc."branchId"
      JOIN rooms r ON r.id = gc."roomId"
      WHERE ws.id <> ALL(${options.excludeScheduleIds ?? []}::uuid[])
        AND (
          (${options.includeSameClass} AND gc.id = ${occupancy.groupClassId}::uuid)
          OR (
            ${options.checkOtherClasses} AND gc.id <> ${occupancy.groupClassId}::uuid
            AND gc.status = 'ACTIVE' AND g.status = 'ACTIVE'
            AND (
              gc."roomId" = ${occupancy.roomId}::uuid
              OR gc."supervisorId" = ANY(${occupancy.teacherIds}::uuid[])
              OR EXISTS (SELECT 1 FROM group_class_assistants a WHERE a."groupClassId" = gc.id AND a."teacherId" = ANY(${occupancy.teacherIds}::uuid[]))
            )
          )
        )
      ORDER BY ws."dayOfWeek", ws."startTime"
      LIMIT 20`;
    return this.describe(tx, rows, 'schedule');
  }

  /**
   * Conflicts of dated slots against non-cancelled sessions. Other sessions
   * are compared on THEIR snapshot (Session.roomId + session_teachers), i.e.
   * where and with whom they really take place — not their class's current state.
   */
  async sessionConflicts(
    tx: Tx,
    occupancy: ClassOccupancy,
    slots: DatedSlot[],
    options: { excludeSessionIds?: string[]; includeSameClass: boolean },
  ): Promise<ConflictDetail[]> {
    if (slots.length === 0) return [];
    const rows = await tx.$queryRaw<Row[]>`
      SELECT s.id AS "otherId", NULL::text AS day, to_char(s.date, 'YYYY-MM-DD') AS date,
             to_char(s."startTime", 'HH24:MI') AS start, to_char(s."endTime", 'HH24:MI') AS "end",
             gc.id AS "groupClassId", g.name AS "groupName", b.name AS "branchName", r.name AS "roomName",
             (s."groupClassId" = ${occupancy.groupClassId}::uuid) AS "sameClass",
             (s."roomId" = ${occupancy.roomId}::uuid) AS "sameRoom",
             ARRAY(
               SELECT st."teacherId" FROM session_teachers st
               WHERE st."sessionId" = s.id AND st."teacherId" = ANY(${occupancy.teacherIds}::uuid[])
             )::text[] AS "sharedTeacherIds"
      FROM unnest(${slots.map((x) => x.date)}::text[], ${slots.map((x) => x.start)}::text[], ${slots.map((x) => x.end)}::text[])
           AS c(date, start, "end")
      JOIN sessions s
        ON s.date = c.date::date AND s."startTime" < c."end"::time AND s."endTime" > c.start::time
      JOIN group_classes gc ON gc.id = s."groupClassId"
      JOIN groups g ON g.id = gc."groupId"
      JOIN rooms r ON r.id = s."roomId"
      JOIN branches b ON b.id = r."branchId"
      WHERE s.status <> 'CANCELLED'
        AND s.id <> ALL(${options.excludeSessionIds ?? []}::uuid[])
        AND (
          (${options.includeSameClass} AND s."groupClassId" = ${occupancy.groupClassId}::uuid)
          OR (
            s."groupClassId" <> ${occupancy.groupClassId}::uuid
            AND (
              s."roomId" = ${occupancy.roomId}::uuid
              OR EXISTS (
                SELECT 1 FROM session_teachers st
                WHERE st."sessionId" = s.id AND st."teacherId" = ANY(${occupancy.teacherIds}::uuid[])
              )
            )
          )
        )
      ORDER BY s.date, s."startTime"
      LIMIT 20`;
    return this.describe(tx, rows, 'session');
  }

  /**
   * A class's room / team / activation is changing: its weekly slots (when
   * running) and its UPCOMING SCHEDULED sessions must stay free of ROOM and
   * TEACHER conflicts with the new occupancy. Upcoming sessions are checked
   * with the ACTIVE members of the new team — exactly what
   * `syncUpcomingSessions` will snapshot on them.
   */
  async assertClassOccupancyFree(
    tx: Tx,
    occupancy: ClassOccupancy,
    today: string,
    options: { checkWeekly: boolean },
  ) {
    const [schedules, sessions, active] = await Promise.all([
      tx.weeklySchedule.findMany({
        where: { groupClassId: occupancy.groupClassId },
        select: { dayOfWeek: true, startTime: true, endTime: true },
      }),
      tx.session.findMany({
        where: {
          groupClassId: occupancy.groupClassId,
          status: 'SCHEDULED',
          date: { gte: new Date(`${today}T00:00:00.000Z`) },
          // A lesson with attendance already happened where it happened
          studentAttendance: { none: {} },
        },
        select: { date: true, startTime: true, endTime: true },
      }),
      tx.teacher.findMany({
        where: { id: { in: occupancy.teacherIds }, status: 'ACTIVE' },
        select: { id: true },
      }),
    ]);
    const time = (d: Date) => d.toISOString().slice(11, 16);
    // Weekly slots occupy rooms/teachers only while the class is running (assignment-based team)
    if (options.checkWeekly) {
      this.throwIfAny(
        await this.weeklyConflicts(
          tx,
          occupancy,
          schedules.map((s) => ({
            dayOfWeek: s.dayOfWeek,
            start: time(s.startTime),
            end: time(s.endTime),
          })),
          { checkOtherClasses: true, includeSameClass: false },
        ),
        'SCHEDULE',
      );
    }
    this.throwIfAny(
      await this.sessionConflicts(
        tx,
        { ...occupancy, teacherIds: active.map((t) => t.id) },
        sessions.map((s) => ({
          date: s.date.toISOString().slice(0, 10),
          start: time(s.startTime),
          end: time(s.endTime),
        })),
        { includeSameClass: false },
      ),
      'SESSION',
    );
  }

  /** Current room and assigned team of a class (weekly occupancy: supervisor + assistants). */
  async occupancyOf(tx: Tx, groupClassId: string) {
    const c = await tx.groupClass.findUnique({
      where: { id: groupClassId },
      select: {
        roomId: true,
        supervisorId: true,
        status: true,
        group: { select: { status: true } },
        assistants: { select: { teacherId: true } },
        supervisor: { select: { status: true } },
      },
    });
    if (!c) return undefined;
    return {
      occupancy: {
        groupClassId,
        roomId: c.roomId,
        teacherIds: [c.supervisorId, ...c.assistants.map((a) => a.teacherId)],
      },
      running: c.status === 'ACTIVE' && c.group.status === 'ACTIVE',
      status: c.status,
      supervisorActive: c.supervisor.status === 'ACTIVE',
    };
  }

  /**
   * Team snapshot for a session planned NOW: the class's room, its supervisor
   * and its ACTIVE assistants. An inactive supervisor blocks new sessions
   * (the admin appoints a replacement first); inactive assistants are left out.
   */
  async sessionTeamOf(tx: Tx, groupClassId: string) {
    const c = await tx.groupClass.findUnique({
      where: { id: groupClassId },
      select: {
        roomId: true,
        status: true,
        group: { select: { status: true } },
        supervisor: { select: { id: true, status: true } },
        assistants: {
          select: { teacher: { select: { id: true, status: true } } },
        },
      },
    });
    if (!c) return undefined;
    const assistantIds = c.assistants
      .map((a) => a.teacher)
      .filter((t) => t.status === 'ACTIVE')
      .map((t) => t.id);
    return {
      roomId: c.roomId,
      supervisorId: c.supervisor.id,
      supervisorActive: c.supervisor.status === 'ACTIVE',
      assistantIds,
      occupancy: {
        groupClassId,
        roomId: c.roomId,
        teacherIds: [c.supervisor.id, ...assistantIds],
      } satisfies ClassOccupancy,
      classActive: c.status === 'ACTIVE',
      running: c.status === 'ACTIVE' && c.group.status === 'ACTIVE',
    };
  }

  /** Replaces the team snapshot of the given sessions. */
  async writeSessionTeams(
    tx: Tx,
    sessionIds: string[],
    team: { supervisorId: string; assistantIds: string[] },
  ) {
    if (sessionIds.length === 0) return;
    await tx.sessionTeacher.deleteMany({
      where: { sessionId: { in: sessionIds } },
    });
    await tx.sessionTeacher.createMany({
      data: sessionIds.flatMap((sessionId) => [
        {
          sessionId,
          teacherId: team.supervisorId,
          role: 'SUPERVISOR' as const,
        },
        ...team.assistantIds.map((teacherId) => ({
          sessionId,
          teacherId,
          role: 'ASSISTANT' as const,
        })),
      ]),
    });
  }

  /**
   * After a class is moved / re-staffed: its UPCOMING SCHEDULED sessions
   * (today onward) take the new room and active team. Past, completed and
   * cancelled sessions keep their snapshot — history is never rewritten.
   */
  async syncUpcomingSessions(tx: Tx, groupClassId: string, today: string) {
    const team = await this.sessionTeamOf(tx, groupClassId);
    if (!team) return;
    const upcoming = await tx.session.findMany({
      where: {
        groupClassId,
        status: 'SCHEDULED',
        date: { gte: new Date(`${today}T00:00:00.000Z`) },
        // Sessions with recorded attendance (e.g. today's) keep their snapshot
        studentAttendance: { none: {} },
      },
      select: { id: true },
    });
    const ids = upcoming.map((u) => u.id);
    if (ids.length === 0) return;
    await tx.session.updateMany({
      where: { id: { in: ids } },
      data: { roomId: team.roomId },
    });
    await this.writeSessionTeams(tx, ids, team);
  }

  /** 409 with a stable code (worst kind first: CLASS, ROOM, TEACHER) and the colliding entries. */
  throwIfAny(conflicts: ConflictDetail[], kind: 'SCHEDULE' | 'SESSION') {
    if (conflicts.length === 0) return;
    const type = (['CLASS', 'ROOM', 'TEACHER'] as const).find((t) =>
      conflicts.some((c) => c.type === t),
    )!;
    const [code, message] = MESSAGES[kind][type];
    throw new ConflictException({ code, message, conflicts });
  }

  /** Rows → typed details (one per conflict type) with teacher names resolved in one query. */
  private async describe(
    tx: Tx,
    rows: Row[],
    kind: 'schedule' | 'session',
  ): Promise<ConflictDetail[]> {
    const teacherIds = [...new Set(rows.flatMap((r) => r.sharedTeacherIds))];
    const teachers = teacherIds.length
      ? await tx.teacher.findMany({
          where: { id: { in: teacherIds } },
          select: {
            id: true,
            person: { select: { firstName: true, lastName: true } },
          },
        })
      : [];
    const byId = new Map(
      teachers.map((t) => [t.id, { id: t.id, ...t.person }]),
    );
    return rows.flatMap((r) => {
      const base = {
        ...(kind === 'schedule'
          ? { scheduleId: r.otherId, dayOfWeek: r.day ?? undefined }
          : { sessionId: r.otherId, date: r.date ?? undefined }),
        startTime: r.start,
        endTime: r.end,
        groupClassId: r.groupClassId,
        groupName: r.groupName,
        branchName: r.branchName,
        roomName: r.roomName,
      };
      if (r.sameClass)
        return [{ ...base, type: 'CLASS' as const, teachers: [] }];
      const found: ConflictDetail[] = [];
      if (r.sameRoom) found.push({ ...base, type: 'ROOM', teachers: [] });
      if (r.sharedTeacherIds.length) {
        found.push({
          ...base,
          type: 'TEACHER',
          teachers: r.sharedTeacherIds
            .map((id) => byId.get(id))
            .filter((t) => t !== undefined),
        });
      }
      return found;
    });
  }
}
