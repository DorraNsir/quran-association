import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client.js';
import type { Weekday } from '../generated/prisma/enums.js';

type Tx = Prisma.TransactionClient;

/**
 * The occupancy a class brings to a time slot: its whole teaching team
 * (supervisor + assistants — availability is per teacher, whatever the
 * assignment type). The ROOM belongs to each slot (weekly slot or session).
 */
export interface ClassOccupancy {
  groupClassId: string;
  teacherIds: string[];
}

export interface WeeklySlot {
  dayOfWeek: Weekday;
  start: string;
  end: string;
  /** The room of this slot */
  roomId: string;
}

export interface DatedSlot {
  date: string;
  start: string;
  end: string;
  /** The room this lesson takes place in */
  roomId: string;
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
      'للقسم موعد أسبوعي آخر يتداخل مع هذا التوقيت',
    ],
    ROOM: ['ROOM_SCHEDULE_CONFLICT', 'القاعة مشغولة بقسم آخر في هذا التوقيت'],
    TEACHER: [
      'TEACHER_SCHEDULE_CONFLICT',
      'أحد معلمي القسم يدرّس قسمًا آخر في هذا التوقيت',
    ],
  },
  SESSION: {
    CLASS: [
      'CLASS_SESSION_CONFLICT',
      'للقسم حصة أخرى تتداخل مع هذا التوقيت في اليوم نفسه',
    ],
    ROOM: ['ROOM_SESSION_CONFLICT', 'القاعة مشغولة بحصة أخرى في هذا التوقيت'],
    TEACHER: [
      'TEACHER_SESSION_CONFLICT',
      'أحد معلمي القسم لديه حصة أخرى في هذا التوقيت',
    ],
  },
};

/**
 * Authoritative scheduling-conflict rules (the frontend only mirrors them).
 *
 *   overlap  ⇔  newStart < existingEnd AND newEnd > existingStart   (touching is fine)
 *
 * - CLASS:   the same class twice at overlapping times;
 * - ROOM:    another class's slot/session in the SAME ROOM (each weekly slot
 *            and each session carries its own room);
 * - TEACHER: another class whose supervisor/assistants share a teacher.
 *
 * Weekly slots: only RUNNING classes (class ACTIVE and group ACTIVE) occupy
 * rooms and teachers. Dated sessions: every non-CANCELLED session does.
 * A weekly slot's room is its own; a session's room and team are its snapshot.
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

  /** Conflicts of weekly slots (each with its own room) for a class with the given (possibly proposed) team. */
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
             (ws."roomId" = c.room) AS "sameRoom",
             ARRAY(
               SELECT t FROM (
                 SELECT gc."supervisorId" AS t
                 UNION SELECT a."teacherId" FROM group_class_assistants a WHERE a."groupClassId" = gc.id
               ) team WHERE t = ANY(${occupancy.teacherIds}::uuid[])
             )::text[] AS "sharedTeacherIds"
      FROM unnest(${slots.map((s) => s.dayOfWeek)}::text[], ${slots.map((s) => s.start)}::text[], ${slots.map((s) => s.end)}::text[], ${slots.map((s) => s.roomId)}::uuid[])
           AS c(day, start, "end", room)
      JOIN weekly_schedules ws
        ON ws."dayOfWeek"::text = c.day AND ws."startTime" < c."end"::time AND ws."endTime" > c.start::time
      JOIN group_classes gc ON gc.id = ws."groupClassId"
      JOIN groups g ON g.id = gc."groupId"
      JOIN branches b ON b.id = gc."branchId"
      JOIN rooms r ON r.id = ws."roomId"
      WHERE ws.id <> ALL(${options.excludeScheduleIds ?? []}::uuid[])
        AND (
          (${options.includeSameClass} AND gc.id = ${occupancy.groupClassId}::uuid)
          OR (
            ${options.checkOtherClasses} AND gc.id <> ${occupancy.groupClassId}::uuid
            AND gc.status = 'ACTIVE' AND g.status = 'ACTIVE'
            AND (
              ws."roomId" = c.room
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
             (s."roomId" = c.room) AS "sameRoom",
             ARRAY(
               SELECT st."teacherId" FROM session_teachers st
               WHERE st."sessionId" = s.id AND st."teacherId" = ANY(${occupancy.teacherIds}::uuid[])
             )::text[] AS "sharedTeacherIds"
      FROM unnest(${slots.map((x) => x.date)}::text[], ${slots.map((x) => x.start)}::text[], ${slots.map((x) => x.end)}::text[], ${slots.map((x) => x.roomId)}::uuid[])
           AS c(date, start, "end", room)
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
              s."roomId" = c.room
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
   * A class's team / activation / slot rooms are changing: its weekly slots
   * (when running) and its UPCOMING SCHEDULED sessions must stay free of
   * ROOM and TEACHER conflicts. Each slot is checked in its own room — the
   * proposed one from `roomOverrides` (scheduleId → roomId) when given — and
   * each upcoming session in the room it will have: its slot's (new) room for
   * a generated session, its own room for an ad-hoc one. Teams are the ACTIVE
   * members of the new team — exactly what the sync below snapshots.
   */
  async assertClassOccupancyFree(
    tx: Tx,
    occupancy: ClassOccupancy,
    today: string,
    options: { checkWeekly: boolean; roomOverrides?: Map<string, string> },
  ) {
    const overrides = options.roomOverrides ?? new Map<string, string>();
    const [schedules, sessions, active] = await Promise.all([
      tx.weeklySchedule.findMany({
        where: { groupClassId: occupancy.groupClassId },
        select: {
          id: true,
          dayOfWeek: true,
          startTime: true,
          endTime: true,
          roomId: true,
        },
      }),
      tx.session.findMany({
        where: {
          groupClassId: occupancy.groupClassId,
          status: 'SCHEDULED',
          date: { gte: new Date(`${today}T00:00:00.000Z`) },
          // A lesson with attendance already happened where it happened
          studentAttendance: { none: {} },
        },
        select: {
          date: true,
          startTime: true,
          endTime: true,
          roomId: true,
          weeklyScheduleId: true,
        },
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
            roomId: overrides.get(s.id) ?? s.roomId,
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
          roomId:
            (s.weeklyScheduleId && overrides.get(s.weeklyScheduleId)) ||
            s.roomId,
        })),
        { includeSameClass: false },
      ),
      'SESSION',
    );
  }

  /** Branch and assigned team of a class (weekly occupancy: supervisor + assistants). */
  async occupancyOf(tx: Tx, groupClassId: string) {
    const c = await tx.groupClass.findUnique({
      where: { id: groupClassId },
      select: {
        branchId: true,
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
        teacherIds: [c.supervisorId, ...c.assistants.map((a) => a.teacherId)],
      },
      branchId: c.branchId,
      running: c.status === 'ACTIVE' && c.group.status === 'ACTIVE',
      status: c.status,
      supervisorActive: c.supervisor.status === 'ACTIVE',
    };
  }

  /**
   * Team snapshot for a session planned NOW: the class's supervisor and its
   * ACTIVE assistants (the room comes from the weekly slot or the request). An inactive supervisor blocks new sessions
   * (the admin appoints a replacement first); inactive assistants are left out.
   */
  async sessionTeamOf(tx: Tx, groupClassId: string) {
    const c = await tx.groupClass.findUnique({
      where: { id: groupClassId },
      select: {
        branchId: true,
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
      branchId: c.branchId,
      supervisorId: c.supervisor.id,
      supervisorActive: c.supervisor.status === 'ACTIVE',
      assistantIds,
      occupancy: {
        groupClassId,
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
   * After a class is re-staffed: its UPCOMING SCHEDULED sessions (today
   * onward, no attendance yet) take the new active team. Past, completed and
   * cancelled sessions keep their snapshot — history is never rewritten.
   * Rooms are synced per weekly slot (`syncSlotRooms`).
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
    await this.writeSessionTeams(tx, ids, team);
  }

  /**
   * A weekly slot changed room: its UPCOMING SCHEDULED sessions (today
   * onward, no attendance yet) move with it. Past / completed / cancelled
   * sessions and lessons with recorded attendance keep the room they had.
   * Callers check the conflicts first (assertClassOccupancyFree).
   */
  async syncSlotRooms(tx: Tx, rooms: Map<string, string>, today: string) {
    for (const [weeklyScheduleId, roomId] of rooms) {
      await tx.session.updateMany({
        where: {
          weeklyScheduleId,
          status: 'SCHEDULED',
          date: { gte: new Date(`${today}T00:00:00.000Z`) },
          studentAttendance: { none: {} },
        },
        data: { roomId },
      });
    }
  }

  /**
   * The room of a weekly slot / session: it exists and belongs to the
   * class's branch; a slot that will occupy it (running class, new slot)
   * needs an active room in an active branch.
   */
  async assertRoomForClass(
    tx: Tx,
    roomId: string,
    branchId: string,
    options: { requireActive: boolean },
  ) {
    const room = await tx.room.findUnique({
      where: { id: roomId },
      select: {
        branchId: true,
        status: true,
        branch: { select: { status: true } },
      },
    });
    if (!room)
      throw new NotFoundException({
        code: 'ROOM_NOT_FOUND',
        message: 'القاعة غير موجودة',
      });
    if (room.branchId !== branchId)
      throw new BadRequestException({
        code: 'ROOM_NOT_IN_BRANCH',
        message: 'القاعة المختارة لا تنتمي إلى فرع هذا القسم',
      });
    if (
      options.requireActive &&
      (room.status !== 'ACTIVE' || room.branch.status !== 'ACTIVE')
    )
      throw new ConflictException({
        code: 'ROOM_INACTIVE',
        message: 'القاعة غير مفعّلة',
      });
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
