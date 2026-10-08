import { Injectable } from '@nestjs/common';

import { fromDbDate, toDbDate } from '../common/dates.js';
import { badRequest, conflict, notFound } from '../common/errors.js';
import { PageSizeService } from '../common/page-size.service.js';
import { paginationMeta } from '../common/pagination.js';
import { platformToday } from '../common/platform-clock.js';
import {
  type Prisma,
  AttendanceStatus,
  SessionStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SessionsService } from '../scheduling/sessions.service.js';
import { fromDbTime } from '../scheduling/time.js';
import { TeacherAccessService } from '../teaching/teacher-access.service.js';
import type {
  AttendanceSummaryDto,
  RosterStudentDto,
  SaveAttendanceDto,
  SessionAttendanceDto,
  StudentAttendanceListDto,
  StudentAttendanceQueryDto,
  SummaryQueryDto,
} from './attendance.dto.js';

type Tx = Prisma.TransactionClient;

/** Who is calling: an admin (any session) or a teacher (assignment-checked). */
export type AttendanceActor =
  { kind: 'admin'; userId: string } | { kind: 'teacher'; userId: string };

/** Teachers record / correct attendance of their sessions dated within the last N days (today included). */
export const TEACHER_ATTENDANCE_WINDOW_DAYS = 7;

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const personSelect = {
  select: { firstName: true, lastName: true, photoUrl: true },
} as const;

/**
 * Attendance of a session's students (one record per session + student).
 *
 * ROSTER (who is expected): students ENROLLED in the session's class ON THE
 * SESSION DATE (StudentEnrollment history, not today's class) and currently
 * ACTIVE — plus anyone who already has a record for the session, so recorded
 * history is never hidden. Missing record = "not recorded", never "absent".
 *
 * SAVE (bulk, all-or-nothing, session row locked): only roster students; a
 * listed student is created or updated (corrections keep createdAt, set
 * updatedAt and the recorder); unlisted records are untouched. Not for
 * CANCELLED or future sessions.
 *
 * COMPLETION: in the same transaction, a SCHEDULED session becomes COMPLETED
 * (source ATTENDANCE) once every expected student has a status. Partial saves
 * never complete it; an empty roster never completes it (admin override
 * instead). Corrections on a COMPLETED session keep it COMPLETED (never
 * reopened). Teachers may record/correct within TEACHER_ATTENDANCE_WINDOW_DAYS
 * of the session date; admins at any time.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly access: TeacherAccessService,
    private readonly pageSizes: PageSizeService,
  ) {}

  async sessionAttendance(
    sessionId: string,
    actor: AttendanceActor,
  ): Promise<SessionAttendanceDto> {
    if (actor.kind === 'teacher')
      await this.access.assertSessionAccess(actor.userId, sessionId);
    return this.build(this.prisma, sessionId, actor);
  }

  async save(
    sessionId: string,
    dto: SaveAttendanceDto,
    actor: AttendanceActor,
  ): Promise<SessionAttendanceDto> {
    const ids = dto.records.map((r) => r.studentId);
    const duplicates = [
      ...new Set(ids.filter((id, i) => ids.indexOf(id) !== i)),
    ];
    if (duplicates.length) {
      throw badRequest(
        'ATTENDANCE_DUPLICATE_STUDENT',
        'الطالب نفسه مكرر في الطلب',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      // One writer per session at a time: no duplicate rows, consistent completion
      await tx.$queryRaw`SELECT id FROM sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;
      if (actor.kind === 'teacher')
        await this.access.assertSessionAccess(actor.userId, sessionId, tx);
      const session = await tx.session.findUnique({
        where: { id: sessionId },
        select: { status: true, date: true },
      });
      if (!session) throw notFound('SESSION_NOT_FOUND', 'الحصة غير موجودة');
      await this.assertEditable(tx, session, actor);

      const date = fromDbDate(session.date);
      const roster = await this.rosterIds(tx, sessionId, date);
      const outside = ids.filter((id) => !roster.allowed.has(id));
      if (outside.length) {
        throw badRequest(
          'ATTENDANCE_STUDENT_NOT_IN_SESSION',
          'بعض الطلبة لا ينتمون إلى حلقة هذه الحصة في تاريخها',
        );
      }

      const existing = new Map(
        (
          await tx.studentAttendance.findMany({
            where: { sessionId, studentId: { in: ids } },
          })
        ).map((r) => [r.studentId, r]),
      );
      for (const record of dto.records) {
        const current = existing.get(record.studentId);
        const note =
          record.note === undefined ? (current?.note ?? null) : record.note;
        if (!current) {
          await tx.studentAttendance.create({
            data: {
              sessionId,
              studentId: record.studentId,
              status: record.status,
              note,
              recordedByUserId: actor.userId,
            },
          });
        } else if (current.status !== record.status || current.note !== note) {
          // Correction: same row (createdAt kept), new value, new recorder
          await tx.studentAttendance.update({
            where: { id: current.id },
            data: {
              status: record.status,
              note,
              recordedByUserId: actor.userId,
            },
          });
        }
      }

      if (
        session.status === SessionStatus.SCHEDULED &&
        roster.expected.size > 0
      ) {
        const recordedExpected = await tx.studentAttendance.count({
          where: { sessionId, studentId: { in: [...roster.expected] } },
        });
        if (recordedExpected === roster.expected.size) {
          await this.sessions.completeFromAttendance(
            tx,
            sessionId,
            actor.userId,
          );
        }
      }
      return this.build(tx, sessionId, actor);
    });
  }

  /** A student's records, newest first (admin). */
  async studentRecords(
    studentId: string,
    query: StudentAttendanceQueryDto,
  ): Promise<StudentAttendanceListDto> {
    await this.assertStudent(studentId);
    const range = await this.range(query);
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const where = this.recordWhere(studentId, range, false);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.studentAttendance.count({ where }),
      this.prisma.studentAttendance.findMany({
        where,
        orderBy: [
          { session: { date: 'desc' } },
          { session: { startTime: 'desc' } },
        ],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
        select: {
          status: true,
          note: true,
          updatedAt: true,
          session: {
            select: {
              id: true,
              date: true,
              startTime: true,
              endTime: true,
              status: true,
              groupClass: {
                select: {
                  id: true,
                  group: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      }),
    ]);
    return {
      data: rows.map((r) => ({
        sessionId: r.session.id,
        date: fromDbDate(r.session.date),
        startTime: fromDbTime(r.session.startTime),
        endTime: fromDbTime(r.session.endTime),
        sessionStatus: r.session.status,
        groupClass: r.session.groupClass,
        status: r.status,
        note: r.note,
        updatedAt: r.updatedAt,
      })),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  /**
   * Counts of RECORDED statuses over non-cancelled sessions in the range.
   * Unrecorded sessions are not absences; sessions never held have no records.
   *   rate = (PRESENT + LATE) / (recorded − EXCUSED) × 100   (same rule as the frontend)
   */
  async summary(
    studentId: string,
    query: SummaryQueryDto,
  ): Promise<AttendanceSummaryDto> {
    await this.assertStudent(studentId);
    const range = await this.range(query);
    const groups = await this.prisma.studentAttendance.groupBy({
      by: ['status'],
      where: this.recordWhere(studentId, range, true),
      _count: { _all: true },
    });
    const count = (s: AttendanceStatus) =>
      groups.find((g) => g.status === s)?._count._all ?? 0;
    const present = count(AttendanceStatus.PRESENT);
    const absent = count(AttendanceStatus.ABSENT);
    const late = count(AttendanceStatus.LATE);
    const excused = count(AttendanceStatus.EXCUSED);
    const recorded = present + absent + late + excused;
    const denominator = recorded - excused;
    return {
      recorded,
      present,
      absent,
      late,
      excused,
      rate:
        denominator > 0
          ? Math.round(((present + late) / denominator) * 1000) / 10
          : null,
      from: range.from ?? null,
      to: range.to ?? null,
    };
  }

  // ───────────────────────── helpers ─────────────────────────

  private async assertEditable(
    tx: Tx,
    session: { status: SessionStatus; date: Date },
    actor: AttendanceActor,
  ) {
    const reason = await this.notEditableReason(tx, session, actor);
    if (reason) throw reason;
  }

  private async notEditableReason(
    tx: Tx | PrismaService,
    session: { status: SessionStatus; date: Date },
    actor: AttendanceActor,
  ) {
    if (session.status === SessionStatus.CANCELLED) {
      return conflict(
        'ATTENDANCE_SESSION_CANCELLED',
        'الحصة ملغاة: لا يُسجَّل حضورها',
      );
    }
    const today = await platformToday(tx);
    const date = fromDbDate(session.date);
    if (date > today)
      return conflict(
        'ATTENDANCE_SESSION_FUTURE',
        'لا يمكن تسجيل حضور حصة لم يحن موعدها',
      );
    if (
      actor.kind === 'teacher' &&
      date < addDays(today, -(TEACHER_ATTENDANCE_WINDOW_DAYS - 1))
    ) {
      return conflict(
        'ATTENDANCE_CORRECTION_WINDOW_CLOSED',
        `انتهت مهلة تسجيل الحضور أو تعديله (${TEACHER_ATTENDANCE_WINDOW_DAYS} أيام): تواصل مع الإدارة`,
      );
    }
    return undefined;
  }

  /** Expected = enrolled on the date + ACTIVE; allowed = expected ∪ already recorded. */
  private async rosterIds(
    db: Tx | PrismaService,
    sessionId: string,
    date: string,
  ) {
    const session = await db.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: { groupClassId: true },
    });
    const [enrolled, recorded] = await Promise.all([
      db.studentEnrollment.findMany({
        where: {
          groupClassId: session.groupClassId,
          startDate: { lte: toDbDate(date) },
          OR: [{ endDate: null }, { endDate: { gt: toDbDate(date) } }],
          student: { status: 'ACTIVE' },
        },
        select: { studentId: true },
      }),
      db.studentAttendance.findMany({
        where: { sessionId },
        select: { studentId: true },
      }),
    ]);
    const expected = new Set(enrolled.map((e) => e.studentId));
    return {
      expected,
      allowed: new Set([...expected, ...recorded.map((r) => r.studentId)]),
    };
  }

  private async build(
    db: Tx | PrismaService,
    sessionId: string,
    actor: AttendanceActor,
  ): Promise<SessionAttendanceDto> {
    const session = await db.session.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        status: true,
        completionSource: true,
        groupClass: {
          select: { id: true, group: { select: { id: true, name: true } } },
        },
        room: {
          select: {
            id: true,
            name: true,
            branch: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!session) throw notFound('SESSION_NOT_FOUND', 'الحصة غير موجودة');
    const date = fromDbDate(session.date);
    const roster = await this.rosterIds(db, sessionId, date);
    const ids = [...roster.allowed];
    const [students, records] = await Promise.all([
      db.student.findMany({
        where: { id: { in: ids } },
        select: { id: true, person: personSelect },
      }),
      db.studentAttendance.findMany({
        where: { sessionId },
        select: {
          studentId: true,
          status: true,
          note: true,
          updatedAt: true,
          recordedBy: { select: { username: true } },
        },
      }),
    ]);
    const bySid = new Map(records.map((r) => [r.studentId, r]));
    const rows: RosterStudentDto[] = students
      .map((s) => {
        const r = bySid.get(s.id);
        return {
          studentId: s.id,
          ...s.person,
          expected: roster.expected.has(s.id),
          recorded: Boolean(r),
          status: r?.status ?? null,
          note: r?.note ?? null,
          recordedAt: r?.updatedAt ?? null,
          recordedBy: r?.recordedBy?.username ?? null,
        };
      })
      .sort(
        (a, b) =>
          a.lastName.localeCompare(b.lastName, 'ar') ||
          a.firstName.localeCompare(b.firstName, 'ar'),
      );
    const recordedCount = rows.filter((r) => r.expected && r.recorded).length;
    return {
      sessionId: session.id,
      date,
      startTime: fromDbTime(session.startTime),
      endTime: fromDbTime(session.endTime),
      sessionStatus: session.status,
      completionSource: session.completionSource,
      groupClass: {
        id: session.groupClass.id,
        group: session.groupClass.group,
        room: { id: session.room.id, name: session.room.name },
        branch: session.room.branch,
      },
      expectedCount: roster.expected.size,
      recordedCount,
      complete:
        roster.expected.size > 0 && recordedCount === roster.expected.size,
      editable: !(await this.notEditableReason(db, session, actor)),
      students: rows,
    };
  }

  private recordWhere(
    studentId: string,
    range: { from?: string; to?: string },
    excludeCancelled: boolean,
  ): Prisma.StudentAttendanceWhereInput {
    return {
      studentId,
      session: {
        ...(excludeCancelled
          ? { status: { not: SessionStatus.CANCELLED } }
          : {}),
        ...(range.from || range.to
          ? {
              date: {
                ...(range.from ? { gte: toDbDate(range.from) } : {}),
                ...(range.to ? { lte: toDbDate(range.to) } : {}),
              },
            }
          : {}),
      },
    };
  }

  /** academicYearId → the year's dates, intersected with from/to. */
  private async range(query: {
    academicYearId?: string;
    from?: string;
    to?: string;
  }) {
    let from = query.from;
    let to = query.to;
    if (query.academicYearId) {
      const year = await this.prisma.academicYear.findUnique({
        where: { id: query.academicYearId },
      });
      if (!year)
        throw notFound('ACADEMIC_YEAR_NOT_FOUND', 'السنة الدراسية غير موجودة');
      const ys = fromDbDate(year.startDate);
      const ye = fromDbDate(year.endDate);
      from = from && from > ys ? from : ys;
      to = to && to < ye ? to : ye;
    }
    if (from && to && to < from)
      throw badRequest('DATE_RANGE_INVALID', 'فترة غير صالحة');
    return { from, to };
  }

  private async assertStudent(studentId: string) {
    if (
      !(await this.prisma.student.findUnique({
        where: { id: studentId },
        select: { id: true },
      }))
    ) {
      throw notFound('STUDENT_NOT_FOUND', 'الطالب غير موجود');
    }
  }
}
