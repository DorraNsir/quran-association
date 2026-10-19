import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../generated/prisma/client.js';
import type { Weekday } from '../generated/prisma/enums.js';
import {
  extraClassIds as extraClassIdsSelect,
  loadParticipants,
  participantIds,
  scheduleClassIdsSql,
  scheduleOfClass,
  sessionClassIdsSql,
  sessionOfClass,
} from './participants.js';

type Tx = Prisma.TransactionClient;

/**
 * The occupancy a slot / session brings to a time: its participating classes
 * (host + additional classes of a shared lesson — see participants.ts) and
 * its whole teaching team (supervisor + assistants — availability is per
 * teacher, whatever the assignment type). The ROOM belongs to each slot.
 */
export interface ClassOccupancy {
  groupClassIds: string[];
  teacherIds: string[];
}

/** A class whose team / rooms / activation change (its own new team). */
export interface ClassTeamChange {
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
 * - CLASS:   a class in two overlapping slots/sessions — as host OR as an
 *            additional class of a shared lesson (participant sets intersect);
 * - ROOM:    another lesson in the SAME ROOM (each weekly slot and each
 *            session carries its own room — a shared lesson books it once);
 * - TEACHER: another lesson whose team shares a teacher (a shared lesson's
 *            team is its participants' union — booked once).
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
    const mine = occupancy.groupClassIds;
    const rows = await tx.$queryRaw<Row[]>`
      SELECT ws.id AS "otherId", ws."dayOfWeek"::text AS day, NULL::text AS date,
             to_char(ws."startTime", 'HH24:MI') AS start, to_char(ws."endTime", 'HH24:MI') AS "end",
             gc.id AS "groupClassId", g.name AS "groupName", b.name AS "branchName", r.name AS "roomName",
             (p.ids && ${mine}::uuid[]) AS "sameClass",
             (ws."roomId" = c.room) AS "sameRoom",
             ARRAY(
               SELECT DISTINCT x FROM unnest(t.team) x WHERE x = ANY(${occupancy.teacherIds}::uuid[])
             )::text[] AS "sharedTeacherIds"
      FROM unnest(${slots.map((s) => s.dayOfWeek)}::text[], ${slots.map((s) => s.start)}::text[], ${slots.map((s) => s.end)}::text[], ${slots.map((s) => s.roomId)}::uuid[])
           AS c(day, start, "end", room)
      JOIN weekly_schedules ws
        ON ws."dayOfWeek"::text = c.day AND ws."startTime" < c."end"::time AND ws."endTime" > c.start::time
      JOIN group_classes gc ON gc.id = ws."groupClassId"
      JOIN groups g ON g.id = gc."groupId"
      JOIN branches b ON b.id = gc."branchId"
      JOIN rooms r ON r.id = ws."roomId"
      -- Participants of the other slot (host + additional classes) and their assigned team
      CROSS JOIN LATERAL (SELECT ARRAY${scheduleClassIdsSql('ws')} AS ids) p
      CROSS JOIN LATERAL (
        SELECT ARRAY(
          SELECT pc."supervisorId" FROM group_classes pc WHERE pc.id = ANY(p.ids)
          UNION SELECT a."teacherId" FROM group_class_assistants a WHERE a."groupClassId" = ANY(p.ids)
        ) AS team
      ) t
      WHERE ws.id <> ALL(${options.excludeScheduleIds ?? []}::uuid[])
        AND (
          (${options.includeSameClass} AND p.ids && ${mine}::uuid[])
          OR (
            ${options.checkOtherClasses} AND NOT (p.ids && ${mine}::uuid[])
            AND gc.status = 'ACTIVE' AND g.status = 'ACTIVE'
            AND (ws."roomId" = c.room OR t.team && ${occupancy.teacherIds}::uuid[])
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
    const mine = occupancy.groupClassIds;
    const rows = await tx.$queryRaw<Row[]>`
      SELECT s.id AS "otherId", NULL::text AS day, to_char(s.date, 'YYYY-MM-DD') AS date,
             to_char(s."startTime", 'HH24:MI') AS start, to_char(s."endTime", 'HH24:MI') AS "end",
             gc.id AS "groupClassId", g.name AS "groupName", b.name AS "branchName", r.name AS "roomName",
             (p.ids && ${mine}::uuid[]) AS "sameClass",
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
      -- Participants of the other session (host + additional classes, its snapshot)
      CROSS JOIN LATERAL (SELECT ARRAY${sessionClassIdsSql('s')} AS ids) p
      WHERE s.status <> 'CANCELLED'
        AND s.id <> ALL(${options.excludeSessionIds ?? []}::uuid[])
        AND (
          (${options.includeSameClass} AND p.ids && ${mine}::uuid[])
          OR (
            NOT (p.ids && ${mine}::uuid[])
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
   * (when running) and its UPCOMING SCHEDULED sessions — those it hosts and
   * the shared ones it takes part in — must stay free of ROOM and TEACHER
   * conflicts (the other participants' teams were already checked). Each slot is checked in its own room — the
   * proposed one from `roomOverrides` (scheduleId → roomId) when given — and
   * each upcoming session in the room it will have: its slot's (new) room for
   * a generated session, its own room for an ad-hoc one. Teams are the ACTIVE
   * members of the new team — exactly what the sync below snapshots.
   */
  async assertClassOccupancyFree(
    tx: Tx,
    change: ClassTeamChange,
    today: string,
    options: { checkWeekly: boolean; roomOverrides?: Map<string, string> },
  ) {
    const overrides = options.roomOverrides ?? new Map<string, string>();
    const occupancy: ClassOccupancy = {
      groupClassIds: [change.groupClassId],
      teacherIds: change.teacherIds,
    };
    const [schedules, sessions, active] = await Promise.all([
      tx.weeklySchedule.findMany({
        where: scheduleOfClass({ id: change.groupClassId }),
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
          ...sessionOfClass({ id: change.groupClassId }),
          status: 'SCHEDULED',
          date: { gte: new Date(`${today}T00:00:00.000Z`) },
          // A lesson with attendance already happened where it happened
          studentAttendance: { none: {} },
          teacherAttendance: { none: {} },
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

  /**
   * Branch and assigned team of a weekly slot's participants (weekly
   * occupancy: the common supervisor + every participant's assistants). A
   * shared slot (additional classes) is validated (participants.ts).
   */
  async occupancyOf(tx: Tx, groupClassId: string, extraIds: string[] = []) {
    const p = await loadParticipants(tx, groupClassId, extraIds);
    if (!p) return undefined;
    return {
      occupancy: {
        groupClassIds: p.groupClassIds,
        teacherIds: [p.supervisorId, ...p.assignedAssistantIds],
      } satisfies ClassOccupancy,
      branchId: p.branchId,
      running: p.running,
      supervisorActive: p.supervisorActive,
      extraIds: p.extraIds,
    };
  }

  /**
   * Team snapshot for a session planned NOW: the common supervisor and the
   * ACTIVE assistants of every participant (the room comes from the weekly
   * slot or the request). An inactive supervisor blocks new sessions (the
   * admin appoints a replacement first); inactive assistants are left out.
   * A shared session's participants are validated (participants.ts).
   */
  async sessionTeamOf(tx: Tx, groupClassId: string, extraIds: string[] = []) {
    const p = await loadParticipants(tx, groupClassId, extraIds);
    if (!p) return undefined;
    return {
      branchId: p.branchId,
      supervisorId: p.supervisorId,
      supervisorActive: p.supervisorActive,
      assistantIds: p.activeAssistantIds,
      extraIds: p.extraIds,
      occupancy: {
        groupClassIds: p.groupClassIds,
        teacherIds: [p.supervisorId, ...p.activeAssistantIds],
      } satisfies ClassOccupancy,
      classActive: p.classActive,
      running: p.running,
    };
  }

  /** Replaces the additional classes (snapshot) of the given sessions. */
  async writeSessionExtras(tx: Tx, sessionIds: string[], extraIds: string[]) {
    if (sessionIds.length === 0) return;
    await tx.sessionClass.deleteMany({
      where: { sessionId: { in: sessionIds } },
    });
    await tx.sessionClass.createMany({
      data: sessionIds.flatMap((sessionId) =>
        extraIds.map((groupClassId) => ({ sessionId, groupClassId })),
      ),
    });
  }

  /**
   * Classes with SHARED participation that must not be broken: weekly slots
   * it hosts with additional classes or attends as one, and upcoming
   * (today onward) SCHEDULED shared sessions. History is not counted.
   */
  async sharedParticipation(tx: Tx, groupClassId: string, today: string) {
    const shared = {
      OR: [
        { groupClassId, extraClasses: { some: {} } },
        { extraClasses: { some: { groupClassId } } },
      ],
    };
    const [schedules, sessions] = await Promise.all([
      tx.weeklySchedule.count({ where: shared }),
      tx.session.count({
        where: {
          ...shared,
          status: 'SCHEDULED',
          date: { gte: new Date(`${today}T00:00:00.000Z`) },
        },
      }),
    ]);
    return { schedules, sessions };
  }

  /**
   * A class leaving shared lessons gets no replacement lesson (the admin
   * plans one). Refused while one of its students has work planned
   * («متابعة العمل») in one of those lessons — the program would point at a
   * lesson the student no longer attends.
   */
  async assertNoWorkForRemovedClasses(
    tx: Tx,
    sessionIds: string[],
    removedClassIds: string[],
  ) {
    if (sessionIds.length === 0 || removedClassIds.length === 0) return;
    const [row] = await tx.$queryRaw<{ found: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM work_programs w
        JOIN sessions s ON s.id = w."sessionId"
        JOIN student_enrollments e ON e."studentId" = w."studentId"
          AND e."startDate" <= s.date AND (e."endDate" IS NULL OR e."endDate" > s.date)
        WHERE w."sessionId" = ANY(${sessionIds}::uuid[])
          AND e."groupClassId" = ANY(${removedClassIds}::uuid[])
      ) AS found`;
    if (row?.found)
      throw new ConflictException({
        code: 'SHARED_CLASS_HAS_WORK',
        message:
          'لطلبة أحد الأقسام المُزالة برامج عمل في حصص قادمة مشتركة: احذفها أو انقلها قبل إزالة القسم',
      });
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
   * onward, no attendance yet) — hosted or shared — take the new active team
   * of THEIR participants. Past, completed and cancelled sessions keep their
   * snapshot — history is never rewritten. Rooms are synced per weekly slot
   * (`syncSlotRooms`).
   */
  async syncUpcomingSessions(tx: Tx, groupClassId: string, today: string) {
    const upcoming = await tx.session.findMany({
      where: {
        ...sessionOfClass({ id: groupClassId }),
        status: 'SCHEDULED',
        date: { gte: new Date(`${today}T00:00:00.000Z`) },
        // Sessions with recorded attendance (e.g. today's) keep their snapshot
        studentAttendance: { none: {} },
        teacherAttendance: { none: {} },
      },
      select: { id: true, groupClassId: true, ...extraClassIdsSelect },
    });
    // One team per participant set
    const bySet = new Map<string, { ids: string[]; sessionIds: string[] }>();
    for (const u of upcoming) {
      const ids = participantIds(u);
      const key = ids.join(',');
      const entry = bySet.get(key) ?? { ids, sessionIds: [] };
      entry.sessionIds.push(u.id);
      bySet.set(key, entry);
    }
    for (const { ids, sessionIds } of bySet.values()) {
      const team = await this.teamForSync(tx, ids[0], ids.slice(1));
      if (team) await this.writeSessionTeams(tx, sessionIds, team);
    }
  }

  /**
   * The team of existing participants (no shared-session validation: an
   * already planned lesson keeps its participants; supervisor / branch
   * changes of shared participants are refused upstream).
   */
  private async teamForSync(tx: Tx, hostId: string, extraIds: string[]) {
    const rows = await tx.groupClass.findMany({
      where: { id: { in: [hostId, ...extraIds] } },
      select: {
        id: true,
        supervisorId: true,
        assistants: {
          select: { teacher: { select: { id: true, status: true } } },
        },
      },
    });
    const host = rows.find((r) => r.id === hostId);
    if (!host) return undefined;
    const assistantIds = [
      ...new Set(
        rows.flatMap((r) =>
          r.assistants
            .map((a) => a.teacher)
            .filter((t) => t.status === 'ACTIVE')
            .map((t) => t.id),
        ),
      ),
    ].filter((id) => id !== host.supervisorId);
    return { supervisorId: host.supervisorId, assistantIds };
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
          teacherAttendance: { none: {} },
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
