import { Injectable } from '@nestjs/common';

import { badRequest, conflict, notFound } from '../common/errors.js';
import {
  type Prisma,
  SessionStatus,
  Weekday,
} from '../generated/prisma/client.js';
import { fromDbDate, toDbDate } from '../common/dates.js';
import { platformToday } from '../common/platform-clock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  classCalendarSelect,
  toScheduleClass,
} from './class-calendar.select.js';
import { ScheduleConflictService } from './schedule-conflicts.service.js';
import { SessionsService } from './sessions.service.js';
import type {
  CreateWeeklyScheduleDto,
  UpdateWeeklyScheduleDto,
  WeeklyScheduleDto,
  WeeklyScheduleQueryDto,
} from './schedule.dto.js';
import { addDays, fromDbTime, toDbTime } from './time.js';

const select = {
  id: true,
  dayOfWeek: true,
  startTime: true,
  endTime: true,
  room: { select: { id: true, name: true } },
  groupClass: { select: classCalendarSelect },
} satisfies Prisma.WeeklyScheduleSelect;

const DAY_ORDER: Weekday[] = [
  Weekday.MON,
  Weekday.TUE,
  Weekday.WED,
  Weekday.THU,
  Weekday.FRI,
  Weekday.SAT,
  Weekday.SUN,
];

const toDto = (
  s: Prisma.WeeklyScheduleGetPayload<{ select: typeof select }>,
): WeeklyScheduleDto => ({
  id: s.id,
  dayOfWeek: s.dayOfWeek,
  startTime: fromDbTime(s.startTime),
  endTime: fromDbTime(s.endTime),
  room: s.room,
  groupClass: toScheduleClass(s.groupClass),
});

export { classNotFound } from './scheduling-errors.js';
import {
  classNotFound,
  SLOT_DELETED_REASON,
  SLOT_MOVED_REASON,
} from './scheduling-errors.js';
/** Writes that also (re)generate a year of sessions */
const LONG_TX = { timeout: 30_000 };

const scheduleNotFound = () =>
  notFound('SCHEDULE_NOT_FOUND', 'الموعد الأسبوعي غير موجود');

function assertTimeRange(start: string, end: string) {
  // "HH:MM" zero-padded 24h: lexical order = chronological order
  if (!(start < end))
    throw badRequest(
      'SCHEDULE_TIME_INVALID',
      'يجب أن يكون وقت النهاية بعد وقت البداية',
    );
}

/**
 * Weekly (recurring) slots of a class. Every write runs in a transaction that
 * holds the scheduling lock, then checks CLASS / ROOM / TEACHER conflicts
 * (other classes only when this class is running). Editing or deleting a slot
 * never touches sessions already generated from it.
 */
@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conflicts: ScheduleConflictService,
    private readonly sessions: SessionsService,
  ) {}

  async listForClass(groupClassId: string): Promise<WeeklyScheduleDto[]> {
    const exists = await this.prisma.groupClass.findUnique({
      where: { id: groupClassId },
      select: { id: true },
    });
    if (!exists) throw classNotFound();
    return this.sorted(
      await this.prisma.weeklySchedule.findMany({
        where: { groupClassId },
        select,
      }),
    );
  }

  async list(query: WeeklyScheduleQueryDto): Promise<WeeklyScheduleDto[]> {
    const where: Prisma.WeeklyScheduleWhereInput = {
      ...(query.dayOfWeek ? { dayOfWeek: query.dayOfWeek } : {}),
      ...(query.roomId ? { roomId: query.roomId } : {}),
      groupClass: {
        ...(query.groupClassId ? { id: query.groupClassId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.groupId ? { groupId: query.groupId } : {}),
        ...(query.teacherId
          ? {
              OR: [
                { supervisorId: query.teacherId },
                { assistants: { some: { teacherId: query.teacherId } } },
              ],
            }
          : {}),
        ...(query.includeInactive
          ? {}
          : { status: 'ACTIVE', group: { status: 'ACTIVE' } }),
      },
    };
    return this.sorted(
      await this.prisma.weeklySchedule.findMany({ where, select }),
    );
  }

  async create(
    groupClassId: string,
    dto: CreateWeeklyScheduleDto,
  ): Promise<WeeklyScheduleDto> {
    assertTimeRange(dto.startTime, dto.endTime);
    const id = await this.prisma.$transaction(async (tx) => {
      await this.conflicts.lockScheduling(tx);
      const current = await this.conflicts.occupancyOf(tx, groupClassId);
      if (!current) throw classNotFound();
      if (!current.supervisorActive) {
        throw conflict(
          'SUPERVISOR_INACTIVE',
          'المعلم المشرف على القسم غير نشط: عيّن مشرفًا بديلًا قبل إضافة مواعيد',
        );
      }
      await this.conflicts.assertRoomForClass(
        tx,
        dto.roomId,
        current.branchId,
        {
          requireActive: true,
        },
      );
      this.conflicts.throwIfAny(
        await this.conflicts.weeklyConflicts(
          tx,
          current.occupancy,
          [
            {
              dayOfWeek: dto.dayOfWeek,
              start: dto.startTime,
              end: dto.endTime,
              roomId: dto.roomId,
            },
          ],
          {
            checkOtherClasses: current.running,
            includeSameClass: true,
          },
        ),
        'SCHEDULE',
      );
      const created = await tx.weeklySchedule.create({
        data: {
          groupClassId,
          roomId: dto.roomId,
          dayOfWeek: dto.dayOfWeek,
          startTime: toDbTime(dto.startTime),
          endTime: toDbTime(dto.endTime),
        },
        select: { id: true },
      });
      // Its dated sessions exist at once, until the end of the current academic year
      await this.sessions.generateForCurrentYear(tx, { groupClassId });
      return created.id;
    }, LONG_TX);
    return this.get(id);
  }

  /**
   * The slot being edited is excluded from its own conflict check. A new
   * room must belong to the class's branch; the slot's upcoming scheduled
   * sessions (no attendance yet) move to it after their own conflict check —
   * history keeps the room it had.
   */
  async update(
    groupClassId: string,
    scheduleId: string,
    dto: UpdateWeeklyScheduleDto,
  ): Promise<WeeklyScheduleDto> {
    await this.prisma.$transaction(async (tx) => {
      await this.conflicts.lockScheduling(tx);
      const existing = await tx.weeklySchedule.findFirst({
        where: { id: scheduleId, groupClassId },
      });
      if (!existing) throw scheduleNotFound();
      const slot = {
        dayOfWeek: dto.dayOfWeek ?? existing.dayOfWeek,
        start: dto.startTime ?? fromDbTime(existing.startTime),
        end: dto.endTime ?? fromDbTime(existing.endTime),
        roomId: dto.roomId ?? existing.roomId,
      };
      assertTimeRange(slot.start, slot.end);
      const current = (await this.conflicts.occupancyOf(tx, groupClassId))!;
      const roomChanged = slot.roomId !== existing.roomId;
      if (roomChanged)
        await this.conflicts.assertRoomForClass(
          tx,
          slot.roomId,
          current.branchId,
          { requireActive: true },
        );
      this.conflicts.throwIfAny(
        await this.conflicts.weeklyConflicts(tx, current.occupancy, [slot], {
          excludeScheduleIds: [scheduleId],
          checkOtherClasses: current.running,
          includeSameClass: true,
        }),
        'SCHEDULE',
      );
      const today = await platformToday(tx);
      const rooms = new Map([[scheduleId, slot.roomId]]);
      if (roomChanged) {
        // Its upcoming sessions will take the new room: they must fit there too
        await this.conflicts.assertClassOccupancyFree(
          tx,
          current.occupancy,
          today,
          { checkWeekly: false, roomOverrides: rooms },
        );
      }
      const moved =
        slot.dayOfWeek !== existing.dayOfWeek ||
        slot.start !== fromDbTime(existing.startTime) ||
        slot.end !== fromDbTime(existing.endTime);
      // Its upcoming lessons that never took place (still scheduled, no
      // attendance) are planned again at the new day/time below — history
      // (past, attended, completed or cancelled lessons) is never touched
      let replannedUntil: string | null = null;
      if (moved) {
        const neverHeld = {
          weeklyScheduleId: scheduleId,
          status: SessionStatus.SCHEDULED,
          date: { gte: toDbDate(today) },
          studentAttendance: { none: {} },
          teacherAttendance: { none: {} },
        } satisfies Prisma.SessionWhereInput;
        const last = await tx.session.findFirst({
          where: neverHeld,
          orderBy: { date: 'desc' },
          select: { date: true },
        });
        replannedUntil = last ? fromDbDate(last.date) : null;
        // A lesson with work planned («متابعة العمل») is kept, cancelled:
        // its work programs are history and are never deleted with it
        await tx.session.updateMany({
          where: { ...neverHeld, workPrograms: { some: {} } },
          // Unlinked like a deleted slot's lessons: the slot plans its new
          // lesson on that date (one session per slot and date)
          data: {
            status: SessionStatus.CANCELLED,
            cancellationReason: SLOT_MOVED_REASON,
            weeklyScheduleId: null,
          },
        });
        await tx.session.deleteMany({
          where: { ...neverHeld, workPrograms: { none: {} } },
        });
      }
      await tx.weeklySchedule.update({
        where: { id: scheduleId },
        data: {
          dayOfWeek: slot.dayOfWeek,
          startTime: toDbTime(slot.start),
          endTime: toDbTime(slot.end),
          roomId: slot.roomId,
        },
      });
      if (moved) {
        // The same period as the removed lessons (even without a current
        // year), then the rest of the current academic year
        if (replannedUntil)
          for (
            let from = today;
            from <= replannedUntil;
            from = addDays(from, 366)
          ) {
            const to = addDays(from, 365);
            await this.sessions.generateInTx(tx, {
              from,
              to: to < replannedUntil ? to : replannedUntil,
              groupClassId,
            });
          }
        await this.sessions.generateForCurrentYear(tx, { groupClassId });
      } else if (roomChanged)
        await this.conflicts.syncSlotRooms(tx, rooms, today);
    }, LONG_TX);
    return this.get(scheduleId);
  }

  /**
   * Removes a weekly slot. Its UPCOMING lessons (today onward, still
   * scheduled, no attendance recorded) are cancelled with it, so no orphan
   * lesson stays in the session lists; past lessons, attended ones and their
   * attendance are kept as history (they just lose the link to the slot).
   */
  async remove(groupClassId: string, scheduleId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.conflicts.lockScheduling(tx);
      const slot = await tx.weeklySchedule.findFirst({
        where: { id: scheduleId, groupClassId },
        select: { id: true },
      });
      if (!slot) throw scheduleNotFound();
      const today = await platformToday(tx);
      await tx.session.updateMany({
        where: {
          weeklyScheduleId: scheduleId,
          status: SessionStatus.SCHEDULED,
          date: { gte: toDbDate(today) },
          studentAttendance: { none: {} },
          teacherAttendance: { none: {} },
        },
        data: {
          status: SessionStatus.CANCELLED,
          cancellationReason: SLOT_DELETED_REASON,
        },
      });
      await tx.weeklySchedule.delete({ where: { id: scheduleId } });
    });
  }

  private async get(id: string) {
    return toDto(
      await this.prisma.weeklySchedule.findUniqueOrThrow({
        where: { id },
        select,
      }),
    );
  }

  private sorted(
    rows: Prisma.WeeklyScheduleGetPayload<{ select: typeof select }>[],
  ) {
    return rows
      .map(toDto)
      .sort(
        (a, b) =>
          DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek) ||
          a.startTime.localeCompare(b.startTime),
      );
  }
}
