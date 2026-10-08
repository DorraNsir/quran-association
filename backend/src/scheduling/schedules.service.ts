import { Injectable } from '@nestjs/common';

import { badRequest, conflict, notFound } from '../common/errors.js';
import { type Prisma, Weekday } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  classCalendarSelect,
  toScheduleClass,
} from './class-calendar.select.js';
import { ScheduleConflictService } from './schedule-conflicts.service.js';
import type {
  CreateWeeklyScheduleDto,
  UpdateWeeklyScheduleDto,
  WeeklyScheduleDto,
  WeeklyScheduleQueryDto,
} from './schedule.dto.js';
import { fromDbTime, toDbTime } from './time.js';

const select = {
  id: true,
  dayOfWeek: true,
  startTime: true,
  endTime: true,
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
  groupClass: toScheduleClass(s.groupClass),
});

export const classNotFound = () =>
  notFound('GROUP_CLASS_NOT_FOUND', 'الحلقة غير موجودة');
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
      groupClass: {
        ...(query.groupClassId ? { id: query.groupClassId } : {}),
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.roomId ? { roomId: query.roomId } : {}),
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
          'المعلم المشرف على الحلقة غير نشط: عيّن مشرفًا بديلًا قبل إضافة مواعيد',
        );
      }
      this.conflicts.throwIfAny(
        await this.conflicts.weeklyConflicts(
          tx,
          current.occupancy,
          [
            {
              dayOfWeek: dto.dayOfWeek,
              start: dto.startTime,
              end: dto.endTime,
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
          dayOfWeek: dto.dayOfWeek,
          startTime: toDbTime(dto.startTime),
          endTime: toDbTime(dto.endTime),
        },
        select: { id: true },
      });
      return created.id;
    });
    return this.get(id);
  }

  /** The slot being edited is excluded from its own conflict check. */
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
      };
      assertTimeRange(slot.start, slot.end);
      const current = (await this.conflicts.occupancyOf(tx, groupClassId))!;
      this.conflicts.throwIfAny(
        await this.conflicts.weeklyConflicts(tx, current.occupancy, [slot], {
          excludeScheduleIds: [scheduleId],
          checkOtherClasses: current.running,
          includeSameClass: true,
        }),
        'SCHEDULE',
      );
      await tx.weeklySchedule.update({
        where: { id: scheduleId },
        data: {
          dayOfWeek: slot.dayOfWeek,
          startTime: toDbTime(slot.start),
          endTime: toDbTime(slot.end),
        },
      });
    });
    return this.get(scheduleId);
  }

  /** Sessions generated from the slot are kept (their history matters); they just lose the link. */
  async remove(groupClassId: string, scheduleId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.conflicts.lockScheduling(tx);
      const { count } = await tx.weeklySchedule.deleteMany({
        where: { id: scheduleId, groupClassId },
      });
      if (count === 0) throw scheduleNotFound();
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
