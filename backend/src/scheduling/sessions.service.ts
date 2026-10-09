import { Injectable } from '@nestjs/common';

import { fromDbDate, toDbDate } from '../common/dates.js';
import { badRequest, conflict, notFound } from '../common/errors.js';
import { PageSizeService } from '../common/page-size.service.js';
import { paginationMeta } from '../common/pagination.js';
import { platformToday } from '../common/platform-clock.js';
import {
  Prisma,
  CompletionSource,
  SessionStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { expectedOnDate } from './roster.sql.js';
import { ScheduleConflictService } from './schedule-conflicts.service.js';
import { classNotFound } from './schedules.service.js';
import type {
  AttentionFlag,
  CreateSessionDto,
  GenerateSessionsDto,
  GenerateSessionsResultDto,
  SessionAttendanceCountsDto,
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
  completedAt: true,
  completionSource: true,
  completedBy: { select: { username: true } },
  groupClass: {
    select: {
      id: true,
      status: true,
      group: { select: { id: true, name: true, status: true } },
    },
  },
  room: {
    select: {
      id: true,
      name: true,
      status: true,
      branch: { select: { id: true, name: true, status: true } },
    },
  },
  teachers: {
    select: {
      role: true,
      teacher: {
        select: {
          id: true,
          status: true,
          person: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { role: 'asc' },
  },
} satisfies Prisma.SessionSelect;

type Row = Prisma.SessionGetPayload<{ select: typeof select }>;

/** Why an upcoming SCHEDULED session needs an admin decision (never auto-cancelled). */
function attentionOf(s: Row, today: string): AttentionFlag[] {
  if (s.status !== SessionStatus.SCHEDULED || fromDbDate(s.date) < today)
    return [];
  const flags: AttentionFlag[] = [];
  if (s.groupClass.status !== 'ACTIVE') flags.push('CLASS_INACTIVE');
  if (s.groupClass.group.status !== 'ACTIVE') flags.push('GROUP_INACTIVE');
  if (s.room.status !== 'ACTIVE') flags.push('ROOM_INACTIVE');
  if (s.room.branch.status !== 'ACTIVE') flags.push('BRANCH_INACTIVE');
  const supervisor = s.teachers.find((t) => t.role === 'SUPERVISOR');
  if (!supervisor) flags.push('NO_SUPERVISOR');
  else if (supervisor.teacher.status !== 'ACTIVE')
    flags.push('SUPERVISOR_INACTIVE');
  if (
    s.teachers.some(
      (t) => t.role === 'ASSISTANT' && t.teacher.status !== 'ACTIVE',
    )
  )
    flags.push('ASSISTANT_INACTIVE');
  return flags;
}

const NO_ATTENDANCE: SessionAttendanceCountsDto = {
  expected: 0,
  recorded: 0,
  present: 0,
  absent: 0,
  late: 0,
  excused: 0,
};

const toDto = (
  s: Row,
  today: string,
  attendance: SessionAttendanceCountsDto = NO_ATTENDANCE,
): SessionDto => ({
  id: s.id,
  date: fromDbDate(s.date),
  startTime: fromDbTime(s.startTime),
  endTime: fromDbTime(s.endTime),
  status: s.status,
  cancellationReason: s.cancellationReason,
  weeklyScheduleId: s.weeklyScheduleId,
  completion:
    s.completedAt && s.completionSource
      ? {
          completedAt: s.completedAt,
          source: s.completionSource,
          completedBy: s.completedBy?.username ?? null,
        }
      : null,
  groupClass: s.groupClass,
  room: s.room,
  teachers: s.teachers.map((t) => ({
    id: t.teacher.id,
    ...t.teacher.person,
    role: t.role,
    status: t.teacher.status,
  })),
  attention: attentionOf(s, today),
  attendance,
});

/** Prisma filter equivalent of attentionOf (for ?needsAttention=true). */
export const needsAttentionWhere = (
  today: string,
): Prisma.SessionWhereInput => ({
  status: SessionStatus.SCHEDULED,
  date: { gte: toDbDate(today) },
  OR: [
    { groupClass: { status: { not: 'ACTIVE' } } },
    { groupClass: { group: { status: { not: 'ACTIVE' } } } },
    { room: { status: 'INACTIVE' } },
    { room: { branch: { status: 'INACTIVE' } } },
    { teachers: { some: { teacher: { status: 'INACTIVE' } } } },
    { teachers: { none: { role: 'SUPERVISOR' } } },
  ],
});

const sessionNotFound = () => notFound('SESSION_NOT_FOUND', 'الحصة غير موجودة');
const supervisorInactive = () =>
  conflict(
    'SUPERVISOR_INACTIVE',
    'المعلم المشرف على القسم غير نشط: عيّن مشرفًا بديلًا قبل برمجة حصص جديدة',
  );
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
 * Dated sessions (the real lessons).
 *
 * Integrity: no two non-cancelled sessions overlap in the same class, room or
 * teacher (CANCELLED never blocks). Each session carries its own room and
 * team snapshot; only upcoming SCHEDULED sessions are re-snapshotted when the
 * class changes — past, completed and cancelled sessions are never rewritten.
 *
 * Completion rules:
 *  - NORMAL: a SCHEDULED session (date ≤ today) becomes COMPLETED when the
 *    attendance of its class roster is saved successfully — Part 10.6 calls
 *    `completeFromAttendance` inside the attendance transaction
 *    (completionSource = ATTENDANCE, completedBy = the saving teacher/admin).
 *  - ADMIN OVERRIDE: `PATCH /admin/sessions/:id/status` with
 *    { status: COMPLETED, adminOverride: true } (completionSource =
 *    ADMIN_OVERRIDE), for lessons held without attendance being recorded.
 *  - Never inferred from the clock; never for a future date. Reopening
 *    (COMPLETED → SCHEDULED) clears the completion data.
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
    const [pageSize, today] = await Promise.all([
      this.pageSizes.resolve(query.pageSize),
      platformToday(this.prisma),
    ]);
    const where = this.where(query, today);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.session.count({ where }),
      this.prisma.session.findMany({
        where,
        select,
        orderBy: [
          { date: query.order ?? 'asc' },
          { startTime: query.order ?? 'asc' },
          { id: query.order ?? 'asc' },
        ],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    const counts = await this.attendanceCounts(rows.map((r) => r.id));
    return {
      data: rows.map((r) => toDto(r, today, counts.get(r.id))),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  /** Every session of a bounded range — what the calendar renders. */
  async calendar(query: SessionCalendarQueryDto): Promise<SessionDto[]> {
    assertRange(query.from, query.to, MAX_CALENDAR_DAYS);
    const today = await platformToday(this.prisma);
    const rows = await this.prisma.session.findMany({
      where: this.where(query, today),
      select,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }],
    });
    const counts = await this.attendanceCounts(rows.map((r) => r.id));
    return rows.map((r) => toDto(r, today, counts.get(r.id)));
  }

  async get(id: string): Promise<SessionDto> {
    const [session, today] = await Promise.all([
      this.prisma.session.findUnique({ where: { id }, select }),
      platformToday(this.prisma),
    ]);
    if (!session) throw sessionNotFound();
    const counts = await this.attendanceCounts([id]);
    return toDto(session, today, counts.get(id));
  }

  /** Manual (ad-hoc) session in the given room of the class's branch, with the class's active team; the weekly schedule is NOT modified. */
  async create(
    dto: CreateSessionDto,
    actorUserId?: string,
  ): Promise<SessionDto> {
    assertTimeRange(dto.startTime, dto.endTime);
    const id = await this.prisma.$transaction(async (tx) => {
      await this.conflicts.lockScheduling(tx);
      const team = await this.conflicts.sessionTeamOf(tx, dto.groupClassId);
      if (!team) throw classNotFound();
      if (!team.classActive)
        throw conflict('GROUP_CLASS_INACTIVE', 'القسم غير نشط');
      if (!team.supervisorActive) throw supervisorInactive();
      await this.conflicts.assertRoomForClass(tx, dto.roomId, team.branchId, {
        requireActive: true,
      });
      const status = dto.status ?? SessionStatus.SCHEDULED;
      if (status === SessionStatus.COMPLETED)
        await this.assertNotFuture(tx, dto.date);
      this.conflicts.throwIfAny(
        await this.conflicts.sessionConflicts(
          tx,
          team.occupancy,
          [
            {
              date: dto.date,
              start: dto.startTime,
              end: dto.endTime,
              roomId: dto.roomId,
            },
          ],
          {
            includeSameClass: true,
          },
        ),
        'SESSION',
      );
      const created = await tx.session.create({
        data: {
          groupClassId: dto.groupClassId,
          roomId: dto.roomId,
          date: toDbDate(dto.date),
          startTime: toDbTime(dto.startTime),
          endTime: toDbTime(dto.endTime),
          status,
          ...(status === SessionStatus.COMPLETED
            ? this.completion(CompletionSource.ADMIN_OVERRIDE, actorUserId)
            : {}),
        },
        select: { id: true },
      });
      await this.conflicts.writeSessionTeams(tx, [created.id], team);
      return created.id;
    });
    return this.get(id);
  }

  /**
   * Reschedule a SCHEDULED session (date, times and/or ROOM); it is excluded
   * from its own check. It keeps its own room unless a new one (of the
   * class's branch) is given. A session moved to today or later takes the
   * class's active team; one kept in the past keeps its snapshot.
   */
  async update(id: string, dto: UpdateSessionDto): Promise<SessionDto> {
    await this.prisma.$transaction(async (tx) => {
      await this.conflicts.lockScheduling(tx);
      const session = await tx.session.findUnique({
        where: { id },
        include: { teachers: true },
      });
      if (!session) throw sessionNotFound();
      if (session.status !== SessionStatus.SCHEDULED) {
        throw conflict(
          'SESSION_NOT_EDITABLE',
          'لا يمكن تعديل موعد حصة ملغاة أو منجزة',
        );
      }
      // Attendance was taken for THIS date and roster: the lesson cannot move
      await this.assertNoAttendance(tx, id);
      const slot = {
        date: dto.date ?? fromDbDate(session.date),
        start: dto.startTime ?? fromDbTime(session.startTime),
        end: dto.endTime ?? fromDbTime(session.endTime),
        roomId: dto.roomId ?? session.roomId,
      };
      assertTimeRange(slot.start, slot.end);
      if (slot.roomId !== session.roomId) {
        const { branchId } = await tx.groupClass.findUniqueOrThrow({
          where: { id: session.groupClassId },
          select: { branchId: true },
        });
        await this.conflicts.assertRoomForClass(tx, slot.roomId, branchId, {
          requireActive: true,
        });
      }
      const refresh = await this.refreshSnapshotIfUpcoming(
        tx,
        session.groupClassId,
        slot.date,
      );
      const occupancy = refresh?.occupancy ?? this.snapshotOccupancy(session);
      this.conflicts.throwIfAny(
        await this.conflicts.sessionConflicts(tx, occupancy, [slot], {
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
          roomId: slot.roomId,
        },
      });
      if (refresh) await this.conflicts.writeSessionTeams(tx, [id], refresh);
    });
    return this.get(id);
  }

  /**
   * SCHEDULED → CANCELLED (optional reason) | COMPLETED (adminOverride, not in the future);
   * CANCELLED → SCHEDULED (restore: snapshot refreshed if upcoming, conflicts re-checked);
   * COMPLETED → SCHEDULED (reopen: completion data cleared).
   */
  async setStatus(
    id: string,
    dto: SetSessionStatusDto,
    actorUserId?: string,
  ): Promise<SessionDto> {
    await this.prisma.$transaction(async (tx) => {
      await this.conflicts.lockScheduling(tx);
      const session = await tx.session.findUnique({
        where: { id },
        include: { teachers: true },
      });
      if (!session) throw sessionNotFound();
      const from = session.status;
      const to = dto.status;
      if (dto.cancellationReason && to !== SessionStatus.CANCELLED) {
        throw badRequest(
          'CANCELLATION_REASON_UNEXPECTED',
          'سبب الإلغاء يخص الحصص الملغاة فقط',
        );
      }
      if (dto.adminOverride && to !== SessionStatus.COMPLETED) {
        throw badRequest(
          'ADMIN_OVERRIDE_UNEXPECTED',
          'التجاوز الإداري يخص إنهاء الحصة فقط',
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
      // A lesson with recorded attendance took place: it cannot be cancelled
      if (to === SessionStatus.CANCELLED && from !== SessionStatus.CANCELLED) {
        await this.assertNoAttendance(tx, id);
      }

      if (to === SessionStatus.COMPLETED) {
        if (!dto.adminOverride) {
          throw badRequest(
            'COMPLETION_REQUIRES_ATTENDANCE',
            'تُنهى الحصة عادةً بتسجيل حضور طلبتها؛ لإنهائها دون ذلك أرسل adminOverride: true',
          );
        }
        await this.assertNotFuture(tx, fromDbDate(session.date));
      }

      let refresh: Awaited<
        ReturnType<SessionsService['refreshSnapshotIfUpcoming']>
      >;
      let roomId = session.roomId;
      if (from === SessionStatus.CANCELLED && to === SessionStatus.SCHEDULED) {
        // A cancelled session freed its slot: restoring must not double-book
        const date = fromDbDate(session.date);
        refresh = await this.refreshSnapshotIfUpcoming(
          tx,
          session.groupClassId,
          date,
        );
        // An upcoming lesson of a weekly slot takes the slot's CURRENT room
        if (refresh && session.weeklyScheduleId) {
          const slot = await tx.weeklySchedule.findUnique({
            where: { id: session.weeklyScheduleId },
            select: { roomId: true },
          });
          if (slot) roomId = slot.roomId;
        }
        this.conflicts.throwIfAny(
          await this.conflicts.sessionConflicts(
            tx,
            refresh?.occupancy ?? this.snapshotOccupancy(session),
            [
              {
                date,
                start: fromDbTime(session.startTime),
                end: fromDbTime(session.endTime),
                roomId,
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
          ...(to === SessionStatus.COMPLETED
            ? this.completion(CompletionSource.ADMIN_OVERRIDE, actorUserId)
            : {
                completedAt: null,
                completedByUserId: null,
                completionSource: null,
              }),
          roomId,
        },
      });
      if (refresh) await this.conflicts.writeSessionTeams(tx, [id], refresh);
    });
    return this.get(id);
  }

  /**
   * Part 10.6 hook — NORMAL completion: call inside the transaction that saves
   * the attendance of the session's class roster. Idempotent for an already
   * attendance-completed session; refuses cancelled and future sessions.
   */
  async completeFromAttendance(tx: Tx, sessionId: string, userId: string) {
    const session = await tx.session.findUnique({
      where: { id: sessionId },
      select: { status: true, date: true },
    });
    if (!session) throw sessionNotFound();
    if (session.status === SessionStatus.CANCELLED) {
      throw conflict('SESSION_CANCELLED', 'لا يمكن تسجيل الحضور لحصة ملغاة');
    }
    await this.assertNotFuture(tx, fromDbDate(session.date));
    await tx.session.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.COMPLETED,
        ...this.completion(CompletionSource.ATTENDANCE, userId),
      },
    });
  }

  /**
   * Explicit, idempotent generation of SCHEDULED sessions from the weekly
   * slots of RUNNING classes over [from, to]. An occurrence is created only if
   *  - no session exists yet for that weekly slot and date (any status — a
   *    cancelled one is never recreated; also guaranteed by the unique
   *    (weeklyScheduleId, date) index), and
   *  - the class has no other session (any status) overlapping it that day
   *    (manual, rescheduled, or generated from a deleted-and-recreated slot), and
   *  - it does not collide with a non-cancelled session of another class in
   *    the same room or with a shared teacher (reported, not created).
   * Classes whose supervisor is inactive are skipped (reported). Each new
   * session takes the room of its weekly slot and the class's active team. Existing sessions
   * are never modified.
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
            supervisor: { select: { id: true, status: true } },
            assistants: {
              select: { teacher: { select: { id: true, status: true } } },
            },
            schedules: {
              select: {
                id: true,
                dayOfWeek: true,
                startTime: true,
                endTime: true,
                roomId: true,
              },
            },
          },
        });
        const skippedInactiveSupervisorClassIds = classes
          .filter(
            (c) => c.supervisor.status !== 'ACTIVE' && c.schedules.length > 0,
          )
          .map((c) => c.id);
        const plannable = classes.filter(
          (c) => c.supervisor.status === 'ACTIVE',
        );
        const team = new Map(
          plannable.map((c) => [
            c.id,
            {
              supervisorId: c.supervisor.id,
              assistantIds: c.assistants
                .map((a) => a.teacher)
                .filter((t) => t.status === 'ACTIVE')
                .map((t) => t.id),
            },
          ]),
        );
        const existing = await this.sessionsInRange(tx, dto.from, dto.to);

        type Planned = Prisma.SessionCreateManyInput & { teamOf: string };
        const planned: Planned[] = [];
        const skippedConflicts: SkippedSessionDto[] = [];
        let skippedExisting = 0;
        for (const date of eachDate(dto.from, dto.to)) {
          const weekday = weekdayOf(date);
          const sameDay = existing.filter((s) => s.date === date);
          for (const c of plannable) {
            const t = team.get(c.id)!;
            const teachers = [t.supervisorId, ...t.assistantIds];
            for (const ws of c.schedules.filter(
              (s) => s.dayOfWeek === weekday,
            )) {
              const slot = {
                start: fromDbTime(ws.startTime),
                end: fromDbTime(ws.endTime),
              };
              if (
                sameDay.some(
                  (s) =>
                    s.weeklyScheduleId === ws.id ||
                    (s.groupClassId === c.id && overlaps(s, slot)),
                )
              ) {
                skippedExisting++;
                continue;
              }
              const blocking = sameDay.find(
                (s) =>
                  s.status !== SessionStatus.CANCELLED &&
                  s.groupClassId !== c.id &&
                  overlaps(s, slot) &&
                  (s.roomId === ws.roomId ||
                    s.teachers.some((x) => teachers.includes(x))),
              );
              if (blocking) {
                skippedConflicts.push({
                  groupClassId: c.id,
                  weeklyScheduleId: ws.id,
                  date,
                  startTime: slot.start,
                  endTime: slot.end,
                  reason: blocking.roomId === ws.roomId ? 'ROOM' : 'TEACHER',
                  conflictingSessionId: blocking.id,
                });
                continue;
              }
              planned.push({
                groupClassId: c.id,
                weeklyScheduleId: ws.id,
                // Each occurrence takes the room of ITS weekly slot
                roomId: ws.roomId,
                date: toDbDate(date),
                startTime: ws.startTime,
                endTime: ws.endTime,
                status: SessionStatus.SCHEDULED,
                teamOf: c.id,
              });
              const added = {
                id: 'planned',
                date,
                ...slot,
                status: SessionStatus.SCHEDULED,
                groupClassId: c.id,
                weeklyScheduleId: ws.id,
                roomId: ws.roomId,
                teachers,
              };
              existing.push(added);
              sameDay.push(added);
            }
          }
        }
        // skipDuplicates: the unique (weeklyScheduleId, date) index is the final idempotency guard
        const created = planned.length
          ? await tx.session.createManyAndReturn({
              data: planned.map(({ teamOf: _teamOf, ...row }) => row),
              skipDuplicates: true,
              select: { id: true, groupClassId: true },
            })
          : [];
        await tx.sessionTeacher.createMany({
          data: created.flatMap((s) => {
            const t = team.get(s.groupClassId)!;
            return [
              {
                sessionId: s.id,
                teacherId: t.supervisorId,
                role: 'SUPERVISOR' as const,
              },
              ...t.assistantIds.map((teacherId) => ({
                sessionId: s.id,
                teacherId,
                role: 'ASSISTANT' as const,
              })),
            ];
          }),
        });
        return {
          from: dto.from,
          to: dto.to,
          created: created.length,
          skippedExisting: skippedExisting + (planned.length - created.length),
          skippedConflicts,
          skippedInactiveSupervisorClassIds,
        };
      },
      { timeout: 30_000 },
    );
  }

  // ───────────────────────── helpers ─────────────────────────

  private completion(source: CompletionSource, userId?: string) {
    return {
      completedAt: new Date(),
      completionSource: source,
      completedByUserId: userId ?? null,
    };
  }

  /** A session dated today or later takes the class's current active team (it keeps its own room). */
  private async refreshSnapshotIfUpcoming(
    tx: Tx,
    groupClassId: string,
    date: string,
  ) {
    if (date < (await platformToday(tx))) return undefined;
    const team = (await this.conflicts.sessionTeamOf(tx, groupClassId))!;
    if (!team.supervisorActive) throw supervisorInactive();
    return team;
  }

  private snapshotOccupancy(session: {
    groupClassId: string;
    roomId: string;
    teachers: { teacherId: string }[];
  }) {
    return {
      groupClassId: session.groupClassId,
      roomId: session.roomId,
      teacherIds: session.teachers.map((t) => t.teacherId),
    };
  }

  private where(
    query: SessionListQueryDto,
    today: string,
  ): Prisma.SessionWhereInput {
    const and: Prisma.SessionWhereInput[] = [];
    if (query.groupClassId) and.push({ groupClassId: query.groupClassId });
    if (query.groupId) and.push({ groupClass: { groupId: query.groupId } });
    if (query.branchId) and.push({ room: { branchId: query.branchId } });
    if (query.roomId) and.push({ roomId: query.roomId });
    if (query.teacherId)
      and.push({ teachers: { some: { teacherId: query.teacherId } } });
    if (query.status) and.push({ status: query.status });
    if (query.from) and.push({ date: { gte: toDbDate(query.from) } });
    if (query.to) and.push({ date: { lte: toDbDate(query.to) } });
    if (query.needsAttention) and.push(needsAttentionWhere(today));
    return and.length ? { AND: and } : {};
  }

  /**
   * Expected / recorded / per-status counts of many sessions in ONE query
   * (the roster rule is shared with the attendance service).
   */
  private async attendanceCounts(
    ids: string[],
  ): Promise<Map<string, SessionAttendanceCountsDto>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<
      (SessionAttendanceCountsDto & { sessionId: string })[]
    >`
      SELECT s.id AS "sessionId",
        (SELECT count(*) FROM student_enrollments e
          WHERE e."groupClassId" = s."groupClassId"
            AND ${expectedOnDate('e', Prisma.sql`s.date`)})::int AS expected,
        count(a.id)::int AS recorded,
        (count(a.id) FILTER (WHERE a.status = 'PRESENT'))::int AS present,
        (count(a.id) FILTER (WHERE a.status = 'ABSENT'))::int AS absent,
        (count(a.id) FILTER (WHERE a.status = 'LATE'))::int AS late,
        (count(a.id) FILTER (WHERE a.status = 'EXCUSED'))::int AS excused
      FROM sessions s
      LEFT JOIN student_attendance a ON a."sessionId" = s.id
      WHERE s.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
      GROUP BY s.id`;
    return new Map(rows.map(({ sessionId, ...counts }) => [sessionId, counts]));
  }

  /** All sessions of the range with THEIR room and team snapshot (bounded by the range). */
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
        roomId: true,
        teachers: { select: { teacherId: true } },
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
      roomId: s.roomId,
      teachers: s.teachers.map((t) => t.teacherId),
    }));
  }

  private async assertNoAttendance(tx: Tx, sessionId: string) {
    if (await tx.studentAttendance.count({ where: { sessionId } })) {
      throw conflict(
        'SESSION_HAS_ATTENDANCE',
        'سُجّل حضور هذه الحصة: لا يمكن إلغاؤها أو تغيير موعدها',
      );
    }
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
