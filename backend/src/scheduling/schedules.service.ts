import { ConflictException, Injectable } from '@nestjs/common';

import { badRequest, conflict, notFound } from '../common/errors.js';
import {
  type Prisma,
  SessionStatus,
  Weekday,
} from '../generated/prisma/client.js';
import {
  formatDateAr,
  fromDbDate,
  toDbDate,
  toLocalDateTime,
} from '../common/dates.js';
import { platformTimezone, platformToday } from '../common/platform-clock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  classCalendarSelect,
  toScheduleClass,
} from './class-calendar.select.js';
import { scheduleOfClass } from './participants.js';
import { ScheduleConflictService } from './schedule-conflicts.service.js';
import { SessionsService } from './sessions.service.js';
import type {
  GenerateSessionsResultDto,
  WeeklyScheduleWriteDto,
} from './session.dto.js';
import type {
  CreateWeeklyScheduleDto,
  ProtectionReason,
  StartDateImpactDto,
  StartDateImpactSessionDto,
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
  startDate: true,
  createdAt: true,
  room: { select: { id: true, name: true } },
  groupClass: { select: classCalendarSelect },
  extraClasses: {
    select: { groupClass: { select: classCalendarSelect } },
    orderBy: [
      { groupClass: { group: { name: 'asc' } } },
      { groupClassId: 'asc' },
    ],
  },
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

/** «تاريخ بداية الحصص»: stored, or — a slot created before it existed — its creation day */
const effectiveStartDate = (
  s: { startDate: Date | null; createdAt: Date },
  timezone: string,
) =>
  s.startDate
    ? fromDbDate(s.startDate)
    : toLocalDateTime(s.createdAt, timezone).slice(0, 10);

const toDto = (
  s: Prisma.WeeklyScheduleGetPayload<{ select: typeof select }>,
  timezone: string,
): WeeklyScheduleDto => ({
  id: s.id,
  dayOfWeek: s.dayOfWeek,
  startTime: fromDbTime(s.startTime),
  endTime: fromDbTime(s.endTime),
  room: s.room,
  groupClass: toScheduleClass(s.groupClass),
  additionalClasses: s.extraClasses.map((e) => toScheduleClass(e.groupClass)),
  // Slots created before «تاريخ بداية الحصص» existed: from their creation day
  startDate: effectiveStartDate(s, timezone),
  startDateSet: s.startDate !== null,
});

export { classNotFound } from './scheduling-errors.js';
import {
  classNotFound,
  SLOT_DELETED_REASON,
  SLOT_MOVED_REASON,
} from './scheduling-errors.js';
/** Writes that also (re)generate a year of sessions */
const LONG_TX = { timeout: 30_000 };

/** Several generation runs (re-planned period + rest of the year) as one result; null if none. */
function merge(
  runs: GenerateSessionsResultDto[],
): GenerateSessionsResultDto | null {
  if (runs.length === 0) return null;
  return {
    from: runs.map((r) => r.from).sort()[0],
    to: runs.map((r) => r.to).sort()[runs.length - 1],
    created: runs.reduce((n, r) => n + r.created, 0),
    skippedExisting: runs.reduce((n, r) => n + r.skippedExisting, 0),
    skippedConflicts: runs.flatMap((r) => r.skippedConflicts),
    skippedInactiveSupervisorClassIds: [
      ...new Set(runs.flatMap((r) => r.skippedInactiveSupervisorClassIds)),
    ],
  };
}

/** Why a lesson before a later «تاريخ بداية الحصص» is kept (Arabic, for the refusal) */
const PROTECTION_LABELS: Record<ProtectionReason, string> = {
  COMPLETED: 'منجزة',
  CANCELLED: 'ملغاة',
  STUDENT_ATTENDANCE: 'حضور طلبة مسجّل',
  TEACHER_ATTENDANCE: 'حضور معلمين مسجّل',
  WORK: 'متابعة عمل',
  ATTENDANCE_HISTORY: 'سجل تعديلات الحضور',
  NOTIFICATIONS: 'إشعارات الحضور',
  MODIFIED: 'عُدّلت يدويًا',
};

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
 *
 * «الحصص المشتركة»: a slot may have ADDITIONAL classes (same supervisor, same
 * branch, all active — participants.ts). It stays ONE slot: one room, one
 * team (the supervisor + every participant's assistants); every participant
 * counts for CLASS conflicts. Its generated lessons copy the participants.
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
        // Its own slots and the shared ones it takes part in
        where: scheduleOfClass({ id: groupClassId }),
        select,
      }),
    );
  }

  async list(query: WeeklyScheduleQueryDto): Promise<WeeklyScheduleDto[]> {
    // Class / group / teacher filters match ANY participant of a shared slot
    // (host or additional class); branch and running status are the host's
    const participant: Prisma.GroupClassWhereInput = {
      ...(query.groupClassId ? { id: query.groupClassId } : {}),
      ...(query.groupId ? { groupId: query.groupId } : {}),
      ...(query.teacherId
        ? {
            OR: [
              { supervisorId: query.teacherId },
              { assistants: { some: { teacherId: query.teacherId } } },
            ],
          }
        : {}),
    };
    const where: Prisma.WeeklyScheduleWhereInput = {
      ...(query.dayOfWeek ? { dayOfWeek: query.dayOfWeek } : {}),
      ...(query.roomId ? { roomId: query.roomId } : {}),
      groupClass: {
        ...(query.branchId ? { branchId: query.branchId } : {}),
        ...(query.includeInactive
          ? {}
          : { status: 'ACTIVE', group: { status: 'ACTIVE' } }),
      },
      ...(Object.keys(participant).length ? scheduleOfClass(participant) : {}),
    };
    return this.sorted(
      await this.prisma.weeklySchedule.findMany({ where, select }),
    );
  }

  async create(
    groupClassId: string,
    dto: CreateWeeklyScheduleDto,
  ): Promise<WeeklyScheduleWriteDto> {
    assertTimeRange(dto.startTime, dto.endTime);
    const { id, generation } = await this.prisma.$transaction(async (tx) => {
      await this.conflicts.lockScheduling(tx);
      // Host + additional classes (a shared slot: same supervisor, same branch, all active)
      const current = await this.conflicts.occupancyOf(
        tx,
        groupClassId,
        dto.additionalGroupClassIds ?? [],
      );
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
      const startDate = await this.resolveStartDate(tx, dto.startDate);
      const created = await tx.weeklySchedule.create({
        data: {
          groupClassId,
          roomId: dto.roomId,
          startDate: toDbDate(startDate.date),
          dayOfWeek: dto.dayOfWeek,
          startTime: toDbTime(dto.startTime),
          endTime: toDbTime(dto.endTime),
          extraClasses: {
            create: current.extraIds.map((id) => ({ groupClassId: id })),
          },
        },
        select: { id: true },
      });
      const runs: GenerateSessionsResultDto[] = [];
      // A past start: this slot's past lessons too (pending attendance) —
      // the other slots of the class are left as they are
      if (startDate.date < startDate.today) {
        const yesterday = addDays(startDate.today, -1);
        runs.push(
          await this.sessions.generateInTx(tx, {
            from: startDate.date,
            to: yesterday < startDate.yearEnd ? yesterday : startDate.yearEnd,
            groupClassId,
            weeklyScheduleId: created.id,
          }),
        );
      }
      // Its dated sessions exist at once, until the end of the current academic year
      const upcoming = await this.sessions.generateForCurrentYear(tx, {
        groupClassId,
      });
      if (upcoming) runs.push(upcoming);
      return { id: created.id, generation: merge(runs) };
    }, LONG_TX);
    return Object.assign(await this.get(id), { generation });
  }

  /**
   * «تاريخ بداية الحصص» of a new slot: by default the start of the current
   * academic year; otherwise a date inside it. Without a current year (or
   * once it is over): today — no past lessons can be created then.
   */
  private async resolveStartDate(
    tx: Prisma.TransactionClient,
    requested?: string,
  ) {
    const today = await platformToday(tx);
    const year = await tx.academicYear.findFirst({
      where: { isCurrent: true },
      select: { startDate: true, endDate: true },
    });
    // An ended year counts as none (no lesson is generated in it any more)
    if (!year || fromDbDate(year.endDate) < today) {
      if (requested && requested < today)
        throw conflict(
          'SCHEDULE_START_NO_ACADEMIC_YEAR',
          'لا توجد سنة دراسية حالية: لا يمكن إنشاء حصص بتاريخ سابق',
        );
      return { date: requested ?? today, today, yearEnd: today };
    }
    const [yearStart, yearEnd] = [
      fromDbDate(year.startDate),
      fromDbDate(year.endDate),
    ];
    const date = requested ?? yearStart;
    if (date < yearStart || date > yearEnd)
      throw badRequest(
        'SCHEDULE_START_OUTSIDE_YEAR',
        'يجب أن يكون تاريخ بداية الحصص داخل السنة الدراسية الحالية',
      );
    return { date, today, yearEnd };
  }

  /**
   * The slot's EXISTING lessons before a proposed «تاريخ بداية الحصص»: each
   * removable (unused) or protected, with the reasons. Unused = still
   * SCHEDULED, no student / teacher attendance, attendance audit trail,
   * attendance notification or «متابعة العمل», and never modified since it
   * was generated (updatedAt = createdAt: no reschedule, room change for one
   * date, cancel / restore, completion / reopening). Memorization and
   * teacher notes are per student, never linked to a lesson.
   */
  private async lessonsBefore(
    db: Prisma.TransactionClient,
    slotId: string,
    date: string,
  ): Promise<{
    removable: StartDateImpactSessionDto[];
    protected: StartDateImpactSessionDto[];
  }> {
    const rows = await db.session.findMany({
      where: { weeklyScheduleId: slotId, date: { lt: toDbDate(date) } },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        date: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            studentAttendance: true,
            teacherAttendance: true,
            workPrograms: true,
            attendanceChanges: true,
            notifications: true,
          },
        },
      },
    });
    const lessons = rows.map((r) => {
      const reasons: ProtectionReason[] = [];
      if (r.status === SessionStatus.COMPLETED) reasons.push('COMPLETED');
      if (r.status === SessionStatus.CANCELLED) reasons.push('CANCELLED');
      if (r._count.studentAttendance) reasons.push('STUDENT_ATTENDANCE');
      if (r._count.teacherAttendance) reasons.push('TEACHER_ATTENDANCE');
      if (r._count.workPrograms) reasons.push('WORK');
      if (r._count.attendanceChanges) reasons.push('ATTENDANCE_HISTORY');
      if (r._count.notifications) reasons.push('NOTIFICATIONS');
      if (r.updatedAt.getTime() !== r.createdAt.getTime())
        reasons.push('MODIFIED');
      return { id: r.id, date: fromDbDate(r.date), reasons };
    });
    return {
      removable: lessons.filter((l) => l.reasons.length === 0),
      protected: lessons.filter((l) => l.reasons.length > 0),
    };
  }

  /** «تعديل الموعد الأسبوعي»: what a new start date would do, before saving (read-only). */
  async startDateImpact(
    groupClassId: string,
    scheduleId: string,
    startDate: string,
  ): Promise<StartDateImpactDto> {
    const slot = await this.prisma.weeklySchedule.findFirst({
      where: { id: scheduleId, groupClassId },
      select: { id: true, startDate: true, createdAt: true },
    });
    if (!slot) throw scheduleNotFound();
    const { date } = await this.resolveStartDate(this.prisma, startDate);
    return {
      startDate: date,
      previousStartDate: effectiveStartDate(
        slot,
        await platformTimezone(this.prisma),
      ),
      ...(await this.lessonsBefore(this.prisma, slot.id, date)),
    };
  }

  /**
   * A new «تاريخ بداية الحصص» for an existing slot (null: unchanged). Same
   * bounds as at creation. Its lessons before the new date — locked first, so
   * no attendance or work can be written to them meanwhile — must ALL be
   * unused and EXACTLY the ones the administrator confirmed
   * (`removeSessionIds`); they are then removed (`remove`). Earlier: the
   * period to fill — from the new date to the day before the previous
   * effective start (a slot created before this field: its creation day),
   * within the year.
   */
  private async startDateChange(
    tx: Prisma.TransactionClient,
    slot: {
      id: string;
      startDate: Date | null;
      createdAt: Date;
    },
    requested?: string,
    confirmed?: string[],
  ): Promise<{
    date: string;
    fill: { from: string; to: string } | null;
    remove: string[];
  } | null> {
    if (!requested) return null;
    if (slot.startDate && fromDbDate(slot.startDate) === requested) return null;
    const previous = effectiveStartDate(slot, await platformTimezone(tx));
    const { date, yearEnd } = await this.resolveStartDate(tx, requested);
    // Attendance and work writers lock (or reference) these same rows: they
    // wait for this transaction, and what is read below is final
    await tx.$queryRaw`SELECT id FROM sessions
      WHERE "weeklyScheduleId" = ${slot.id}::uuid AND date < ${date}::date
      FOR UPDATE`;
    const lessons = await this.lessonsBefore(tx, slot.id, date);
    const target = formatDateAr(date);
    if (lessons.protected.length > 0) {
      const listed = lessons.protected
        .slice(0, 5)
        .map(
          (l) =>
            `${formatDateAr(l.date)} (${l.reasons.map((r) => PROTECTION_LABELS[r]).join('، ')})`,
        )
        .join('؛ ');
      const more = lessons.protected.length - 5;
      throw new ConflictException({
        code: 'SCHEDULE_START_PROTECTED_SESSIONS',
        message: `لا يمكن تأخير تاريخ بداية الحصص إلى ${target}: ${
          lessons.protected.length === 1
            ? 'حصة سابقة لهذا الموعد فيها نشاط'
            : `${lessons.protected.length} حصص سابقة لهذا الموعد فيها نشاط`
        } ولا تُحذف — ${listed}${more > 0 ? ` و${more} أخرى` : ''}. اختر تاريخًا لا يتجاوز ${formatDateAr(lessons.protected[0].date)}.`,
        sessions: lessons.protected,
      });
    }
    const ids = lessons.removable.map((l) => l.id).sort();
    const asked = [...new Set(confirmed ?? [])].sort();
    if (ids.length > 0 && confirmed === undefined)
      throw new ConflictException({
        code: 'SCHEDULE_START_HAS_SESSIONS',
        message: `تأخير تاريخ بداية الحصص إلى ${target} يحذف ${
          ids.length === 1 ? 'حصة سابقة واحدة' : `${ids.length} حصص سابقة`
        } لم يُسجَّل فيها أي نشاط: يجب تأكيد حذفها.`,
        sessions: lessons.removable,
      });
    if (ids.join() !== asked.join())
      throw new ConflictException({
        code: 'SCHEDULE_START_CONFIRMATION_STALE',
        message:
          'تغيّرت حصص هذا الموعد منذ عرض التأكيد: أعد فتح النافذة وراجع الحصص التي ستُحذف ثم أعد المحاولة.',
        sessions: lessons.removable,
      });
    const last = addDays(previous, -1);
    const to = last < yearEnd ? last : yearEnd;
    return {
      date,
      fill: date <= to ? { from: date, to } : null,
      remove: ids,
    };
  }

  /**
   * The slot being edited is excluded from its own conflict check. A new
   * room must belong to the class's branch; the slot's upcoming scheduled
   * sessions (no attendance yet) move to it after their own conflict check —
   * history keeps the room it had.
   *
   * Additional classes (`additionalGroupClassIds`, full replacement): the
   * slot's upcoming lessons without attendance take the new participants and
   * team (an added class must be free then — CLASS / TEACHER conflicts; the
   * admin first moves its own conflicting lessons). A removed class gets no
   * replacement lesson; lessons with attendance keep their participants.
   */
  async update(
    groupClassId: string,
    scheduleId: string,
    dto: UpdateWeeklyScheduleDto,
  ): Promise<WeeklyScheduleWriteDto> {
    const generated: GenerateSessionsResultDto[] = [];
    await this.prisma.$transaction(async (tx) => {
      await this.conflicts.lockScheduling(tx);
      const existing = await tx.weeklySchedule.findFirst({
        where: { id: scheduleId, groupClassId },
        include: { extraClasses: true },
      });
      if (!existing) throw scheduleNotFound();
      const currentExtras = existing.extraClasses.map((e) => e.groupClassId);
      const extraIds = dto.additionalGroupClassIds ?? currentExtras;
      const removedClasses = currentExtras.filter((c) => !extraIds.includes(c));
      const participantsChanged =
        removedClasses.length > 0 ||
        extraIds.some((c) => !currentExtras.includes(c));
      const slot = {
        dayOfWeek: dto.dayOfWeek ?? existing.dayOfWeek,
        start: dto.startTime ?? fromDbTime(existing.startTime),
        end: dto.endTime ?? fromDbTime(existing.endTime),
        roomId: dto.roomId ?? existing.roomId,
      };
      assertTimeRange(slot.start, slot.end);
      // «تاريخ بداية الحصص»: checked before any write (a refusal changes nothing)
      const start = await this.startDateChange(
        tx,
        existing,
        dto.startDate,
        dto.removeSessionIds,
      );
      const current = (await this.conflicts.occupancyOf(
        tx,
        groupClassId,
        extraIds,
      ))!;
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
      if (start && start.remove.length > 0) {
        // The confirmed unused lessons before a later start date (locked
        // above). The same conditions again: a mismatch undoes everything
        const removed = await tx.session.deleteMany({
          where: {
            id: { in: start.remove },
            weeklyScheduleId: scheduleId,
            status: SessionStatus.SCHEDULED,
            date: { lt: toDbDate(start.date) },
            studentAttendance: { none: {} },
            teacherAttendance: { none: {} },
            workPrograms: { none: {} },
            attendanceChanges: { none: {} },
            notifications: { none: {} },
          },
        });
        if (removed.count !== start.remove.length)
          throw conflict(
            'SCHEDULE_START_CONFIRMATION_STALE',
            'تغيّرت حصص هذا الموعد منذ عرض التأكيد: أعد فتح النافذة وراجع الحصص التي ستُحذف ثم أعد المحاولة.',
          );
      }
      const rooms = new Map([[scheduleId, slot.roomId]]);
      if (roomChanged) {
        // Its upcoming sessions will take the new room: they must fit there too
        await this.conflicts.assertClassOccupancyFree(
          tx,
          { groupClassId, teacherIds: current.occupancy.teacherIds },
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
      // Participants changed in place: the slot's upcoming lessons that never
      // took place follow (a moved slot re-plans them below with the new ones)
      if (participantsChanged && !moved) {
        const upcoming = await tx.session.findMany({
          where: {
            weeklyScheduleId: scheduleId,
            status: SessionStatus.SCHEDULED,
            date: { gte: toDbDate(today) },
            studentAttendance: { none: {} },
            teacherAttendance: { none: {} },
          },
          select: { id: true, date: true, startTime: true, endTime: true },
        });
        const ids = upcoming.map((u) => u.id);
        await this.conflicts.assertNoWorkForRemovedClasses(
          tx,
          ids,
          removedClasses,
        );
        const team = (await this.conflicts.sessionTeamOf(
          tx,
          groupClassId,
          extraIds,
        ))!;
        this.conflicts.throwIfAny(
          await this.conflicts.sessionConflicts(
            tx,
            team.occupancy,
            upcoming.map((u) => ({
              date: fromDbDate(u.date),
              start: fromDbTime(u.startTime),
              end: fromDbTime(u.endTime),
              roomId: slot.roomId,
            })),
            { excludeSessionIds: ids, includeSameClass: true },
          ),
          'SESSION',
        );
        await this.conflicts.writeSessionExtras(tx, ids, extraIds);
        await this.conflicts.writeSessionTeams(tx, ids, team);
      }
      await tx.weeklySchedule.update({
        where: { id: scheduleId },
        data: {
          dayOfWeek: slot.dayOfWeek,
          startTime: toDbTime(slot.start),
          endTime: toDbTime(slot.end),
          roomId: slot.roomId,
          ...(start ? { startDate: toDbDate(start.date) } : {}),
        },
      });
      if (participantsChanged) {
        await tx.weeklyScheduleClass.deleteMany({
          where: { weeklyScheduleId: scheduleId },
        });
        await tx.weeklyScheduleClass.createMany({
          data: extraIds.map((id) => ({
            weeklyScheduleId: scheduleId,
            groupClassId: id,
          })),
        });
      }
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
            generated.push(
              await this.sessions.generateInTx(tx, {
                from,
                to: to < replannedUntil ? to : replannedUntil,
                groupClassId,
              }),
            );
          }
        const year = await this.sessions.generateForCurrentYear(tx, {
          groupClassId,
        });
        if (year) generated.push(year);
      } else if (roomChanged)
        await this.conflicts.syncSlotRooms(tx, rooms, today);
      // An earlier start: this slot's missing lessons before its previous
      // start (existing ones are skipped, never rewritten)
      if (start?.fill)
        generated.push(
          await this.sessions.generateInTx(tx, {
            ...start.fill,
            groupClassId,
            weeklyScheduleId: scheduleId,
          }),
        );
    }, LONG_TX);
    return Object.assign(await this.get(scheduleId), {
      generation: merge(generated),
    });
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
      await platformTimezone(this.prisma),
    );
  }

  private async sorted(
    rows: Prisma.WeeklyScheduleGetPayload<{ select: typeof select }>[],
  ) {
    const timezone = await platformTimezone(this.prisma);
    return rows
      .map((row) => toDto(row, timezone))
      .sort(
        (a, b) =>
          DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek) ||
          a.startTime.localeCompare(b.startTime),
      );
  }
}
