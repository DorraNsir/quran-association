import { Injectable } from '@nestjs/common';

import { fromDbDate, toDbDate } from '../common/dates.js';
import { badRequest, conflict, notFound } from '../common/errors.js';
import { PageSizeService } from '../common/page-size.service.js';
import { paginationMeta } from '../common/pagination.js';
import { platformToday } from '../common/platform-clock.js';
import { type Prisma, SessionStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  classCalendarSelect,
  toScheduleClass,
} from './class-calendar.select.js';
import { ScheduleConflictService } from './schedule-conflicts.service.js';
import { classNotFound } from './schedules.service.js';
import type {
  CreateSessionDto,
  GenerateSessionsDto,
  GenerateSessionsResultDto,
  SessionCalendarQueryDto,
  SessionDto,
  SessionListDto,
  SessionListQueryDto,
  SetSessionStatusDto,
  SkippedSessionDto,
  UpdateSessionDto,
} from './session.dto.js';
import {
  daysBetween,
  eachDate,
  fromDbTime,
  overlaps,
  toDbTime,
  weekdayOf,
} from './time.js';

type Tx = Prisma.TransactionClient;

const select = {
  id: true,
  date: true,
  startTime: true,
  endTime: true,
  status: true,
  cancellationReason: true,
  weeklyScheduleId: true,
  groupClass: { select: classCalendarSelect },
} satisfies Prisma.SessionSelect;

const toDto = (
  s: Prisma.SessionGetPayload<{ select: typeof select }>,
): SessionDto => ({
  id: s.id,
  date: fromDbDate(s.date),
  startTime: fromDbTime(s.startTime),
  endTime: fromDbTime(s.endTime),
  status: s.status,
  cancellationReason: s.cancellationReason,
  weeklyScheduleId: s.weeklyScheduleId,
  groupClass: toScheduleClass(s.groupClass),
});

const sessionNotFound = () => notFound('SESSION_NOT_FOUND', 'الحصة غير موجودة');
const MAX_CALENDAR_DAYS = 62;
const MAX_GENERATION_DAYS = 366;

function assertTimeRange(start: string, end: string) {
  if (!(start < end))
    throw badRequest(
      'SESSION_TIME_INVALID',
      'يجب أن يكون وقت نهاية الحصة بعد وقت بدايتها',
    );
}

function assertRange(from: string, to: string, maxDays: number) {
  if (to < from)
    throw badRequest(
      'DATE_RANGE_INVALID',
      'يجب أن يكون تاريخ النهاية بعد تاريخ البداية أو يساويه',
    );
  if (daysBetween(from, to) > maxDays)
    throw badRequest(
      'DATE_RANGE_TOO_LONG',
      `الفترة طويلة جدًا (${maxDays} يومًا على الأكثر)`,
    );
}

/**
 * Dated sessions (the real lessons). Physical integrity: no two
 * non-cancelled sessions overlap in the same class, room or teacher
 * (CANCELLED never blocks). Cancelling keeps the row (history); completion is
 * an explicit admin action, never inferred from the clock. Attendance is a
 * separate concept (Part 10.6).
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conflicts: ScheduleConflictService,
    private readonly pageSizes: PageSizeService,
  ) {}

  async list(query: SessionListQueryDto): Promise<SessionListDto> {
    if (query.from && query.to && query.to < query.from)
      throw badRequest('DATE_RANGE_INVALID', 'فترة غير صالحة');
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const where = this.where(query);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.session.count({ where }),
      this.prisma.session.findMany({
        where,
        select,
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map(toDto),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  /** Every session of a bounded range — what the calendar renders. */
  async calendar(query: SessionCalendarQueryDto): Promise<SessionDto[]> {
    assertRange(query.from, query.to, MAX_CALENDAR_DAYS);
    const rows = await this.prisma.session.findMany({
      where: this.where(query),
      select,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toDto);
  }

  async get(id: string): Promise<SessionDto> {
    const session = await this.prisma.session.findUnique({
      where: { id },
      select,
    });
    if (!session) throw sessionNotFound();
    return toDto(session);
  }

  /** Manual session: the weekly schedule is NOT modified. */
  async create(dto: CreateSessionDto): Promise<SessionDto> {
    assertTimeRange(dto.startTime, dto.endTime);
    const id = await this.prisma.$transaction(async (tx) => {
      await this.conflicts.lockScheduling(tx);
      const current = await this.conflicts.occupancyOf(tx, dto.groupClassId);
      if (!current) throw classNotFound();
      if (current.status !== 'ACTIVE')
        throw conflict('GROUP_CLASS_INACTIVE', 'الحلقة غير نشطة');
      const status = dto.status ?? SessionStatus.SCHEDULED;
      if (status === SessionStatus.COMPLETED)
        await this.assertNotFuture(tx, dto.date);
      this.conflicts.throwIfAny(
        await this.conflicts.sessionConflicts(
          tx,
          current.occupancy,
          [{ date: dto.date, start: dto.startTime, end: dto.endTime }],
          {
            includeSameClass: true,
          },
        ),
        'SESSION',
      );
      const created = await tx.session.create({
        data: {
          groupClassId: dto.groupClassId,
          date: toDbDate(dto.date),
          startTime: toDbTime(dto.startTime),
          endTime: toDbTime(dto.endTime),
          status,
        },
        select: { id: true },
      });
      return created.id;
    });
    return this.get(id);
  }

  /** Reschedule (SCHEDULED sessions only); the session is excluded from its own check. */
  async update(id: string, dto: UpdateSessionDto): Promise<SessionDto> {
    await this.prisma.$transaction(async (tx) => {
      await this.conflicts.lockScheduling(tx);
      const session = await tx.session.findUnique({ where: { id } });
      if (!session) throw sessionNotFound();
      if (session.status !== SessionStatus.SCHEDULED) {
        throw conflict(
          'SESSION_NOT_EDITABLE',
          'لا يمكن تعديل موعد حصة ملغاة أو منجزة',
        );
      }
      const slot = {
        date: dto.date ?? fromDbDate(session.date),
        start: dto.startTime ?? fromDbTime(session.startTime),
        end: dto.endTime ?? fromDbTime(session.endTime),
      };
      assertTimeRange(slot.start, slot.end);
      const current = (await this.conflicts.occupancyOf(
        tx,
        session.groupClassId,
      ))!;
      this.conflicts.throwIfAny(
        await this.conflicts.sessionConflicts(tx, current.occupancy, [slot], {
          excludeSessionIds: [id],
          includeSameClass: true,
        }),
        'SESSION',
      );
      await tx.session.update({
        where: { id },
        data: {
          date: toDbDate(slot.date),
          startTime: toDbTime(slot.start),
          endTime: toDbTime(slot.end),
        },
      });
    });
    return this.get(id);
  }

  /**
   * SCHEDULED → CANCELLED (optional reason) | COMPLETED (not in the future);
   * CANCELLED → SCHEDULED (restore: conflicts re-checked); COMPLETED → SCHEDULED (reopen).
   */
  async setStatus(id: string, dto: SetSessionStatusDto): Promise<SessionDto> {
    await this.prisma.$transaction(async (tx) => {
      await this.conflicts.lockScheduling(tx);
      const session = await tx.session.findUnique({ where: { id } });
      if (!session) throw sessionNotFound();
      const from = session.status;
      const to = dto.status;
      if (dto.cancellationReason && to !== SessionStatus.CANCELLED) {
        throw badRequest(
          'CANCELLATION_REASON_UNEXPECTED',
          'سبب الإلغاء يخص الحصص الملغاة فقط',
        );
      }
      if (from === to && to !== SessionStatus.CANCELLED) return;
      const allowed =
        (from === SessionStatus.SCHEDULED &&
          (to === SessionStatus.CANCELLED || to === SessionStatus.COMPLETED)) ||
        (from === SessionStatus.CANCELLED && to === SessionStatus.SCHEDULED) ||
        (from === SessionStatus.CANCELLED && to === SessionStatus.CANCELLED) || // update the reason
        (from === SessionStatus.COMPLETED && to === SessionStatus.SCHEDULED);
      if (!allowed)
        throw conflict(
          'INVALID_STATUS_TRANSITION',
          'لا يمكن الانتقال إلى هذه الحالة من الحالة الحالية',
        );

      if (to === SessionStatus.COMPLETED)
        await this.assertNotFuture(tx, fromDbDate(session.date));
      if (from === SessionStatus.CANCELLED && to === SessionStatus.SCHEDULED) {
        // A cancelled session freed its slot: restoring must not double-book
        const current = (await this.conflicts.occupancyOf(
          tx,
          session.groupClassId,
        ))!;
        this.conflicts.throwIfAny(
          await this.conflicts.sessionConflicts(
            tx,
            current.occupancy,
            [
              {
                date: fromDbDate(session.date),
                start: fromDbTime(session.startTime),
                end: fromDbTime(session.endTime),
              },
            ],
            { excludeSessionIds: [id], includeSameClass: true },
          ),
          'SESSION',
        );
      }
      await tx.session.update({
        where: { id },
        data: {
          status: to,
          cancellationReason:
            to === SessionStatus.CANCELLED
              ? (dto.cancellationReason ?? null)
              : null,
        },
      });
    });
    return this.get(id);
  }

  /**
   * Explicit, idempotent generation of SCHEDULED sessions from the weekly
   * slots of RUNNING classes over [from, to]. An occurrence is created only if
   *  - no session exists yet for that weekly slot and date (any status — a
   *    cancelled one is never recreated; also guaranteed by the unique
   *    (weeklyScheduleId, date) index), and
   *  - the class has no other session (any status) overlapping it that day
   *    (e.g. a manual or rescheduled one), and
   *  - it does not collide with a non-cancelled session of another class in
   *    the same room or with a shared teacher (reported, not created).
   * Existing sessions are never modified.
   */
  async generate(dto: GenerateSessionsDto): Promise<GenerateSessionsResultDto> {
    assertRange(dto.from, dto.to, MAX_GENERATION_DAYS);
    return this.prisma.$transaction(
      async (tx) => {
        await this.conflicts.lockScheduling(tx);
        if (
          dto.groupClassId &&
          !(await tx.groupClass.findUnique({
            where: { id: dto.groupClassId },
            select: { id: true },
          }))
        ) {
          throw classNotFound();
        }
        const classes = await tx.groupClass.findMany({
          where: {
            status: 'ACTIVE',
            group: { status: 'ACTIVE' },
            ...(dto.groupClassId ? { id: dto.groupClassId } : {}),
          },
          select: {
            id: true,
            roomId: true,
            supervisorId: true,
            assistants: { select: { teacherId: true } },
            schedules: {
              select: {
                id: true,
                dayOfWeek: true,
                startTime: true,
                endTime: true,
              },
            },
          },
        });
        const existing = await this.sessionsInRange(tx, dto.from, dto.to);
        const occupancy = new Map(
          classes.map((c) => [
            c.id,
            {
              roomId: c.roomId,
              teachers: [
                c.supervisorId,
                ...c.assistants.map((a) => a.teacherId),
              ],
            },
          ]),
        );

        const toCreate: Prisma.SessionCreateManyInput[] = [];
        const skippedConflicts: SkippedSessionDto[] = [];
        let skippedExisting = 0;
        for (const date of eachDate(dto.from, dto.to)) {
          const weekday = weekdayOf(date);
          const sameDay = existing.filter((s) => s.date === date);
          for (const c of classes) {
            const occ = occupancy.get(c.id)!;
            for (const ws of c.schedules.filter(
              (s) => s.dayOfWeek === weekday,
            )) {
              const slot = {
                start: fromDbTime(ws.startTime),
                end: fromDbTime(ws.endTime),
              };
              const already = sameDay.some(
                (s) =>
                  s.weeklyScheduleId === ws.id ||
                  (s.groupClassId === c.id && overlaps(s, slot)),
              );
              if (already) {
                skippedExisting++;
                continue;
              }
              const blocking = sameDay.find(
                (s) =>
                  s.status !== SessionStatus.CANCELLED &&
                  s.groupClassId !== c.id &&
                  overlaps(s, slot) &&
                  (s.roomId === occ.roomId ||
                    s.teachers.some((t) => occ.teachers.includes(t))),
              );
              if (blocking) {
                skippedConflicts.push({
                  groupClassId: c.id,
                  weeklyScheduleId: ws.id,
                  date,
                  startTime: slot.start,
                  endTime: slot.end,
                  reason: blocking.roomId === occ.roomId ? 'ROOM' : 'TEACHER',
                  conflictingSessionId: blocking.id,
                });
                continue;
              }
              toCreate.push({
                groupClassId: c.id,
                weeklyScheduleId: ws.id,
                date: toDbDate(date),
                startTime: ws.startTime,
                endTime: ws.endTime,
                status: SessionStatus.SCHEDULED,
              });
              // Later occurrences of this run see the new session too
              existing.push({
                id: 'new',
                date,
                ...slot,
                status: SessionStatus.SCHEDULED,
                groupClassId: c.id,
                weeklyScheduleId: ws.id,
                roomId: occ.roomId,
                teachers: occ.teachers,
              });
              sameDay.push(existing[existing.length - 1]);
            }
          }
        }
        // skipDuplicates: the unique (weeklyScheduleId, date) index is the final idempotency guard
        const { count } = toCreate.length
          ? await tx.session.createMany({
              data: toCreate,
              skipDuplicates: true,
            })
          : { count: 0 };
        return {
          from: dto.from,
          to: dto.to,
          created: count,
          skippedExisting: skippedExisting + (toCreate.length - count),
          skippedConflicts,
        };
      },
      { timeout: 30_000 },
    );
  }

  // ───────────────────────── helpers ─────────────────────────

  private where(query: SessionListQueryDto): Prisma.SessionWhereInput {
    const classWhere: Prisma.GroupClassWhereInput = {
      ...(query.groupId ? { groupId: query.groupId } : {}),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.roomId ? { roomId: query.roomId } : {}),
      ...(query.teacherId
        ? {
            OR: [
              { supervisorId: query.teacherId },
              { assistants: { some: { teacherId: query.teacherId } } },
            ],
          }
        : {}),
    };
    return {
      ...(query.groupClassId ? { groupClassId: query.groupClassId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            date: {
              ...(query.from ? { gte: toDbDate(query.from) } : {}),
              ...(query.to ? { lte: toDbDate(query.to) } : {}),
            },
          }
        : {}),
      ...(Object.keys(classWhere).length ? { groupClass: classWhere } : {}),
    };
  }

  /** All sessions of the range with their class's room and team (bounded by the range). */
  private async sessionsInRange(tx: Tx, from: string, to: string) {
    const rows = await tx.session.findMany({
      where: { date: { gte: toDbDate(from), lte: toDbDate(to) } },
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        status: true,
        groupClassId: true,
        weeklyScheduleId: true,
        groupClass: {
          select: {
            roomId: true,
            supervisorId: true,
            assistants: { select: { teacherId: true } },
          },
        },
      },
    });
    return rows.map((s) => ({
      id: s.id,
      date: fromDbDate(s.date),
      start: fromDbTime(s.startTime),
      end: fromDbTime(s.endTime),
      status: s.status,
      groupClassId: s.groupClassId,
      weeklyScheduleId: s.weeklyScheduleId,
      roomId: s.groupClass.roomId,
      teachers: [
        s.groupClass.supervisorId,
        ...s.groupClass.assistants.map((a) => a.teacherId),
      ],
    }));
  }

  private async assertNotFuture(tx: Tx, date: string) {
    if (date > (await platformToday(tx))) {
      throw badRequest(
        'SESSION_IN_FUTURE',
        'لا يمكن اعتبار حصة مستقبلية منجزة',
      );
    }
  }
}
