import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { fromDbDate, toDbDate } from '../common/dates.js';
import { badRequest, conflict, notFound } from '../common/errors.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { PageSizeService } from '../common/page-size.service.js';
import { paginationMeta } from '../common/pagination.js';
import { platformToday } from '../common/platform-clock.js';
import {
  Prisma,
  AttendanceChangeKind,
  AttendanceStatus,
  NotificationType,
  SessionStatus,
  TeachingRole,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  participantIds,
  sessionClassIdsSql,
  sessionOfClass,
} from '../scheduling/participants.js';
import { expectedOnDate } from '../scheduling/roster.sql.js';
import { SessionsService } from '../scheduling/sessions.service.js';
import { fromDbTime } from '../scheduling/time.js';
import { TeacherAccessService } from '../teaching/teacher-access.service.js';
import {
  attendanceTotals,
  emptyCounts,
  type StatusCounts,
} from './attendance-rate.js';
import type {
  AttendanceChangeDto,
  TeacherAttendanceGroupDto,
  TeacherAttendanceListDto,
  TeachersSummaryQueryDto,
  TeacherSummaryLineDto,
  StudentsSummaryQueryDto,
  StudentSummaryLineDto,
  AttendanceSummaryDto,
  RosterStudentDto,
  RosterTeacherDto,
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

/** Arabic count agreement (same forms as the frontend's pluralize). */
function pluralAr(
  count: number,
  forms: { one: string; two: string; few: string; many: string },
) {
  if (count === 1) return forms.one;
  if (count === 2) return forms.two;
  if (count >= 3 && count <= 10) return `${count} ${forms.few}`;
  return `${count} ${forms.many}`;
}

/** "15 أكتوبر 2026" — the frontend's locale (date-only, no timezone shift). */
const arabicDate = new Intl.DateTimeFormat('ar-TN-u-nu-latn', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const formatDateAr = (date: string) =>
  arabicDate.format(new Date(`${date}T00:00:00Z`));

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Teachers CORRECT attendance (change a saved status or note) of their
 * sessions dated within the last `windowDays` days, today included
 * (TEACHER_ATTENDANCE_WINDOW_DAYS, default 7). Recording a status for the
 * first time has no time limit. Admins are never limited.
 */
export function withinTeacherWindow(
  sessionDate: string,
  today: string,
  windowDays: number,
) {
  return sessionDate >= addDays(today, -(windowDays - 1));
}

const personSelect = {
  select: { firstName: true, lastName: true, photoUrl: true },
} as const;

const classLabelSelect = {
  id: true,
  group: { select: { id: true, name: true } },
} as const;

/** Whose students the caller sees / manages in one session. */
interface StudentScope {
  allStudents: boolean;
  groupClassIds: string[];
}

const studentNotAllowed = () =>
  new ForbiddenException({
    code: 'ATTENDANCE_STUDENT_NOT_ALLOWED',
    message:
      'لست مكلّفًا بقسم بعض هؤلاء الطلبة في هذه الحصة المشتركة: يسجّل حضورهم المشرف أو معلمو أقسامهم',
  });

/**
 * Attendance of a session's students (one record per session + student).
 *
 * ROSTER (who is expected): students ENROLLED in one of the session's classes
 * ON THE SESSION DATE (StudentEnrollment history, not today's class) whose
 * status ON THAT DATE was ACTIVE (StudentStatusChange history, not today's
 * status) — plus anyone who already has a record for the session, so
 * recorded history is never hidden. Missing record = "not recorded", never
 * "absent". A SHARED session («الحصص المشتركة») has several classes (host +
 * additional ones): one combined roster, each student with their own class.
 *
 * WHO: admins and the teachers of a normal session see the whole roster; in a
 * shared session the supervisor sees it all, an assistant only the students
 * of the participating classes they are assigned to — for reading, saving
 * and the change history (TeacherAccessService.sessionStudentScope).
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
 * reopened). Teachers may record a first status at any time (past sessions
 * included) but correct a saved one only within TEACHER_ATTENDANCE_WINDOW_DAYS
 * (config) of the session date; admins at any time.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly access: TeacherAccessService,
    private readonly pageSizes: PageSizeService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.teacherWindowDays = config.get('TEACHER_ATTENDANCE_WINDOW_DAYS', {
      infer: true,
    });
  }

  private readonly teacherWindowDays: number;

  async sessionAttendance(
    sessionId: string,
    actor: AttendanceActor,
  ): Promise<SessionAttendanceDto> {
    return this.build(this.prisma, sessionId, actor);
  }

  async save(
    sessionId: string,
    dto: SaveAttendanceDto,
    actor: AttendanceActor,
  ): Promise<SessionAttendanceDto> {
    const studentInputs = dto.records ?? [];
    const teacherInputs = dto.teachers ?? [];
    if (studentInputs.length === 0 && teacherInputs.length === 0)
      throw badRequest('ATTENDANCE_EMPTY', 'لا يوجد أي حضور لحفظه');
    const ids = studentInputs.map((r) => r.studentId);
    const teacherIds = teacherInputs.map((t) => t.teacherId);
    if (new Set(ids).size !== ids.length) {
      throw badRequest(
        'ATTENDANCE_DUPLICATE_STUDENT',
        'الطالب نفسه مكرر في الطلب',
      );
    }
    if (new Set(teacherIds).size !== teacherIds.length)
      throw badRequest(
        'ATTENDANCE_DUPLICATE_TEACHER',
        'المعلم نفسه مكرر في الطلب',
      );
    return this.prisma.$transaction(async (tx) => {
      // One writer per session at a time: no duplicate rows, consistent completion
      await tx.$queryRaw`SELECT id FROM sessions WHERE id = ${sessionId}::uuid FOR UPDATE`;
      // A teacher must be in THIS session's team (its snapshot), not merely
      // the class's today — and, in a shared session, assigned to the
      // students' classes unless they are its supervisor
      const teacherScope =
        actor.kind === 'teacher'
          ? await this.access.sessionStudentScope(actor.userId, sessionId, tx)
          : null;
      const actorTeacherId = teacherScope?.teacherId ?? null;
      const session = await tx.session.findUnique({
        where: { id: sessionId },
        select: {
          status: true,
          date: true,
          groupClass: { select: { group: { select: { name: true } } } },
          extraClasses: {
            select: {
              groupClass: { select: { group: { select: { name: true } } } },
            },
          },
        },
      });
      if (!session) throw notFound('SESSION_NOT_FOUND', 'الحصة غير موجودة');
      await this.assertEditable(tx, session);

      const date = fromDbDate(session.date);
      const roster = await this.rosterIds(tx, sessionId, date);
      if (ids.some((id) => !roster.allowed.has(id))) {
        throw badRequest(
          'ATTENDANCE_STUDENT_NOT_IN_SESSION',
          'بعض الطلبة لا ينتمون إلى قسم هذه الحصة في تاريخها',
        );
      }
      // Each student, not only the session: an assistant of a shared session
      // never writes another class's students (even if sent by hand)
      if (teacherScope && !teacherScope.allClasses) {
        const scope = {
          allStudents: false,
          groupClassIds: teacherScope.classIds,
        };
        if (ids.some((id) => !this.visible(scope, roster.classOf, id)))
          throw studentNotAllowed();
      }
      const team = await this.teamOf(tx, sessionId);
      if (teacherIds.some((id) => !team.allowed.has(id))) {
        throw badRequest(
          'ATTENDANCE_TEACHER_NOT_IN_SESSION',
          'بعض المعلمين ليسوا من فريق هذه الحصة',
        );
      }

      const [existing, existingTeachers] = await Promise.all([
        tx.studentAttendance
          .findMany({ where: { sessionId, studentId: { in: ids } } })
          .then((rows) => new Map(rows.map((r) => [r.studentId, r]))),
        tx.teacherAttendance
          .findMany({ where: { sessionId, teacherId: { in: teacherIds } } })
          .then((rows) => new Map(rows.map((r) => [r.teacherId, r]))),
      ]);
      // Optimistic concurrency: refuse instead of silently overwriting a newer value
      const stale = [
        ...studentInputs
          .filter(
            (r) =>
              r.expectedStatus !== undefined &&
              (existing.get(r.studentId)?.status ?? null) !== r.expectedStatus,
          )
          .map((r) => ({ subject: 'STUDENT', id: r.studentId })),
        ...teacherInputs
          .filter(
            (t) =>
              t.expectedStatus !== undefined &&
              (existingTeachers.get(t.teacherId)?.status ?? null) !==
                t.expectedStatus,
          )
          .map((t) => ({ subject: 'TEACHER', id: t.teacherId })),
      ];
      if (stale.length) {
        throw new ConflictException({
          code: 'ATTENDANCE_CHANGED',
          message:
            'عدّل مستخدم آخر حضور هذه الحصة في الأثناء: أعد تحميل الصفحة لرؤية آخر القيم ثم أعد التعديل',
          conflicts: stale,
        });
      }

      // Correction window (teachers): a first recording is always allowed, a
      // change to a saved value only within the window — checked before any write
      const correctionClosed = this.correctionClosedReason(
        date,
        await platformToday(tx),
        actor,
      );
      if (correctionClosed) {
        const changesSaved = (
          current:
            { status: AttendanceStatus; note: string | null } | undefined,
          input: { status: AttendanceStatus; note?: string | null },
        ) =>
          current !== undefined &&
          (current.status !== input.status ||
            (input.note !== undefined && current.note !== input.note));
        if (
          studentInputs.some((r) =>
            changesSaved(existing.get(r.studentId), r),
          ) ||
          teacherInputs.some((t) =>
            changesSaved(existingTeachers.get(t.teacherId), t),
          )
        )
          throw correctionClosed;
      }

      const actorName = await this.displayName(tx, actor.userId);
      const changes: Prisma.AttendanceChangeCreateManyInput[] = [];
      const changed = { students: 0, teachers: 0 };
      const audit = (
        subject: 'STUDENT' | 'TEACHER',
        subjectId: string,
        before: { status: AttendanceStatus; note: string | null } | undefined,
        status: AttendanceStatus,
        note: string | null,
      ) =>
        changes.push({
          sessionId,
          subject,
          ...(subject === 'STUDENT'
            ? { studentId: subjectId }
            : { teacherId: subjectId }),
          kind: before
            ? AttendanceChangeKind.MODIFIED
            : AttendanceChangeKind.CREATED,
          previousStatus: before?.status ?? null,
          newStatus: status,
          previousNote: before?.note ?? null,
          newNote: note,
          actorUserId: actor.userId,
          actorName,
        });

      for (const record of studentInputs) {
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
          audit('STUDENT', record.studentId, undefined, record.status, note);
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
          audit('STUDENT', record.studentId, current, record.status, note);
          if (current.status !== record.status) changed.students++;
        }
      }
      for (const record of teacherInputs) {
        const current = existingTeachers.get(record.teacherId);
        const note =
          record.note === undefined ? (current?.note ?? null) : record.note;
        if (!current) {
          await tx.teacherAttendance.create({
            data: {
              sessionId,
              teacherId: record.teacherId,
              status: record.status,
              note,
              recordedByUserId: actor.userId,
            },
          });
          audit('TEACHER', record.teacherId, undefined, record.status, note);
        } else if (current.status !== record.status || current.note !== note) {
          await tx.teacherAttendance.update({
            where: { id: current.id },
            data: {
              status: record.status,
              note,
              recordedByUserId: actor.userId,
            },
          });
          audit('TEACHER', record.teacherId, current, record.status, note);
          if (current.status !== record.status) changed.teachers++;
        }
      }
      // Audit in the same transaction: no change without its trace (and none for a no-op save)
      if (changes.length)
        await tx.attendanceChange.createMany({ data: changes });

      if (
        studentInputs.length > 0 &&
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

      // An ASSISTANT of this session changed saved statuses → its supervisor is told (one notification)
      const actorRole = team.snapshot.find(
        (t) => t.teacherId === actorTeacherId,
      )?.role;
      if (
        actorRole === TeachingRole.ASSISTANT &&
        changed.students + changed.teachers > 0
      ) {
        await this.notifySupervisor(tx, {
          sessionId,
          supervisorId: team.snapshot.find(
            (t) => t.role === TeachingRole.SUPERVISOR,
          )?.teacherId,
          actorUserId: actor.userId,
          groupName: [
            session.groupClass.group.name,
            ...session.extraClasses.map((e) => e.groupClass.group.name),
          ].join(' + '),
          date,
          changed,
        });
      }
      return this.build(tx, sessionId, actor);
    });
  }

  /** «سجل التعديلات» of a session, newest first (admin, or a teacher of that session). */
  async history(
    sessionId: string,
    actor: AttendanceActor,
  ): Promise<AttendanceChangeDto[]> {
    const teacherScope =
      actor.kind === 'teacher'
        ? await this.access.sessionStudentScope(actor.userId, sessionId)
        : null;
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { date: true },
    });
    if (!session) throw notFound('SESSION_NOT_FOUND', 'الحصة غير موجودة');
    // An assistant of a shared session: only their classes' students' changes (teachers' stay)
    let hidden: (studentId: string) => boolean = () => false;
    if (teacherScope && !teacherScope.allClasses) {
      const roster = await this.rosterIds(
        this.prisma,
        sessionId,
        fromDbDate(session.date),
      );
      const scope = {
        allStudents: false,
        groupClassIds: teacherScope.classIds,
      };
      hidden = (studentId) => !this.visible(scope, roster.classOf, studentId);
    }
    const rows = await this.prisma.attendanceChange.findMany({
      where: { sessionId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        subject: true,
        studentId: true,
        teacherId: true,
        kind: true,
        previousStatus: true,
        newStatus: true,
        previousNote: true,
        newNote: true,
        actorName: true,
        createdAt: true,
        student: { select: { person: personSelect } },
        teacher: { select: { person: personSelect } },
      },
    });
    return rows
      .filter((r) => !(r.studentId && hidden(r.studentId)))
      .map((r) => {
        const person = (r.student ?? r.teacher)!.person;
        return {
          id: r.id,
          subject: r.subject,
          subjectId: (r.studentId ?? r.teacherId)!,
          subjectName: `${person.firstName} ${person.lastName}`,
          kind: r.kind,
          previousStatus: r.previousStatus,
          newStatus: r.newStatus,
          previousNote: r.previousNote,
          newNote: r.newNote,
          actorName: r.actorName,
          createdAt: r.createdAt,
        };
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
              groupClass: { select: classLabelSelect },
              extraClasses: {
                select: { groupClass: { select: classLabelSelect } },
              },
            },
          },
        },
      }),
    ]);
    // A shared session shows the student's OWN class there (their class on its date)
    const enrollments = rows.some((r) => r.session.extraClasses.length)
      ? await this.prisma.studentEnrollment.findMany({
          where: { studentId },
          select: { groupClassId: true, startDate: true, endDate: true },
        })
      : [];
    const ownClass = (session: (typeof rows)[number]['session']) => {
      if (session.extraClasses.length === 0) return session.groupClass;
      const date = session.date.getTime();
      const enrolled = enrollments.find(
        (e) =>
          e.startDate.getTime() <= date &&
          (!e.endDate || e.endDate.getTime() > date),
      );
      return (
        [
          session.groupClass,
          ...session.extraClasses.map((e) => e.groupClass),
        ].find((c) => c.id === enrolled?.groupClassId) ?? session.groupClass
      );
    };
    return {
      data: rows.map((r) => ({
        sessionId: r.session.id,
        date: fromDbDate(r.session.date),
        startTime: fromDbTime(r.session.startTime),
        endTime: fromDbTime(r.session.endTime),
        sessionStatus: r.session.status,
        groupClass: ownClass(r.session),
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
    const counts = emptyCounts();
    for (const g of groups) counts[g.status] = g._count._all;
    return {
      ...attendanceTotals(counts),
      from: range.from ?? null,
      to: range.to ?? null,
    };
  }

  /**
   * A teacher reading one student's attendance: the period defaults to the
   * current academic year, and the teacher must have taught the student
   * during it (TeacherAccessService.assertStudentAccess) — the records are
   * then those of that period. Returns the concrete range to query.
   */
  async teacherStudentRange(
    userId: string,
    studentId: string,
    query: { academicYearId?: string; from?: string; to?: string },
  ): Promise<{ from: string; to: string }> {
    await this.assertStudent(studentId);
    let { from, to } = await this.range(query);
    const today = await platformToday(this.prisma);
    if (!query.academicYearId && !query.from && !query.to) {
      const current = await this.prisma.academicYear.findFirst({
        where: { isCurrent: true },
        select: { startDate: true, endDate: true },
      });
      from = current ? fromDbDate(current.startDate) : today;
      to = current ? fromDbDate(current.endDate) : today;
    }
    const range = { from: from ?? '1900-01-01', to: to ?? today };
    await this.access.assertStudentAccess(userId, studentId, range);
    return range;
  }

  /**
   * Counts per student over non-cancelled sessions matching the filters
   * (session's class / group / branch, period) — one grouped query, same
   * rate rule as `summary`. Students without records are not listed.
   * A class / group filter includes the shared sessions it takes part in,
   * but only ITS students there (their class on the session date).
   */
  async studentsSummary(
    query: StudentsSummaryQueryDto,
  ): Promise<StudentSummaryLineDto[]> {
    const range = await this.range(query);
    const groups =
      query.groupClassId || query.groupId
        ? await this.classScopedCounts(range, query)
        : (
            await this.prisma.studentAttendance.groupBy({
              by: ['studentId', 'status'],
              where: { session: this.sessionFilter(range, query) },
              _count: { _all: true },
            })
          ).map((g) => ({ ...g, n: g._count._all }));
    const byStudent = new Map<string, StatusCounts>();
    for (const g of groups) {
      const counts = byStudent.get(g.studentId) ?? emptyCounts();
      counts[g.status] = g.n;
      byStudent.set(g.studentId, counts);
    }
    const students = await this.prisma.student.findMany({
      where: { id: { in: [...byStudent.keys()] } },
      select: {
        id: true,
        person: {
          select: { firstName: true, lastName: true, photoUrl: true },
        },
      },
    });
    return students
      .map((s) => ({
        studentId: s.id,
        ...s.person,
        ...attendanceTotals(byStudent.get(s.id)!),
      }))
      .sort(
        (a, b) =>
          b.absent - a.absent ||
          a.lastName.localeCompare(b.lastName, 'ar') ||
          a.firstName.localeCompare(b.firstName, 'ar'),
      );
  }

  // ───────────────────────── teachers ─────────────────────────

  /** A teacher's own attendance records (sessions they taught), newest first. */
  async teacherRecords(
    teacherId: string,
    query: StudentAttendanceQueryDto & { groupId?: string },
  ): Promise<TeacherAttendanceListDto> {
    await this.assertTeacher(teacherId);
    const range = await this.range(query);
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    // A group narrows the SESSIONS (a shared session counts for each of its groups)
    const where: Prisma.TeacherAttendanceWhereInput = {
      teacherId,
      session: this.sessionFilter(range, { groupId: query.groupId }, false),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.teacherAttendance.count({ where }),
      this.prisma.teacherAttendance.findMany({
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
              teachers: { where: { teacherId }, select: { role: true } },
              extraClasses: {
                select: { groupClass: { select: classLabelSelect } },
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
        role: r.session.teachers[0]?.role ?? null,
        additionalClasses: r.session.extraClasses.map((e) => e.groupClass),
        status: r.status,
        note: r.note,
        updatedAt: r.updatedAt,
      })),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  /** A teacher's own totals (same rule as students; each session counted once). */
  async teacherSummary(
    teacherId: string,
    query: SummaryQueryDto & { groupId?: string },
  ): Promise<AttendanceSummaryDto> {
    await this.assertTeacher(teacherId);
    const range = await this.range(query);
    // Filtered BEFORE counting: only the sessions of the group (if any)
    const groups = await this.prisma.teacherAttendance.groupBy({
      by: ['status'],
      where: {
        teacherId,
        session: this.sessionFilter(range, { groupId: query.groupId }),
      },
      _count: { _all: true },
    });
    const counts = emptyCounts();
    for (const g of groups) counts[g.status] = g._count._all;
    return {
      ...attendanceTotals(counts),
      from: range.from ?? null,
      to: range.to ?? null,
    };
  }

  /**
   * The groups offered by a teacher's group filter: those of the sessions the
   * teacher has attendance records in (every participating class's group of
   * a shared session) and those of their current assignments.
   */
  async teacherGroups(teacherId: string): Promise<TeacherAttendanceGroupDto[]> {
    await this.assertTeacher(teacherId);
    return this.prisma.$queryRaw<TeacherAttendanceGroupDto[]>`
      SELECT g.id, g.name FROM groups g
      WHERE g.id IN (
        SELECT gc."groupId"
        FROM teacher_attendance ta
        JOIN sessions s ON s.id = ta."sessionId"
        CROSS JOIN LATERAL unnest(ARRAY${sessionClassIdsSql('s')}) AS p(id)
        JOIN group_classes gc ON gc.id = p.id
        WHERE ta."teacherId" = ${teacherId}::uuid
        UNION
        SELECT gc."groupId" FROM group_classes gc
        WHERE gc."supervisorId" = ${teacherId}::uuid
           OR EXISTS (SELECT 1 FROM group_class_assistants a WHERE a."groupClassId" = gc.id AND a."teacherId" = ${teacherId}::uuid)
      )
      ORDER BY g.name`;
  }

  /** Per teacher, over the sessions matching the filters (one grouped query). */
  async teachersSummary(
    query: TeachersSummaryQueryDto,
  ): Promise<TeacherSummaryLineDto[]> {
    const range = await this.range(query);
    const groups = await this.prisma.teacherAttendance.groupBy({
      by: ['teacherId', 'status'],
      where: { session: this.sessionFilter(range, query) },
      _count: { _all: true },
    });
    const byTeacher = new Map<string, StatusCounts>();
    for (const g of groups) {
      const counts = byTeacher.get(g.teacherId) ?? emptyCounts();
      counts[g.status] = g._count._all;
      byTeacher.set(g.teacherId, counts);
    }
    const teachers = await this.prisma.teacher.findMany({
      where: { id: { in: [...byTeacher.keys()] } },
      select: { id: true, person: personSelect },
    });
    return teachers
      .map((t) => ({
        teacherId: t.id,
        ...t.person,
        ...attendanceTotals(byTeacher.get(t.id)!),
      }))
      .sort(
        (a, b) =>
          b.absent - a.absent ||
          a.lastName.localeCompare(b.lastName, 'ar') ||
          a.firstName.localeCompare(b.firstName, 'ar'),
      );
  }

  // ───────────────────────── helpers ─────────────────────────

  /**
   * Per student and status, over the non-cancelled sessions of the period
   * (branch / teacher filters as `sessionFilter`) that the class / group
   * takes part in. A normal session counts all its records (as before); a
   * SHARED one only the records of students whose class ON its date matches
   * the class / group — never the other participating classes' students.
   */
  private async classScopedCounts(
    range: { from?: string; to?: string },
    scope: {
      groupClassId?: string;
      groupId?: string;
      branchId?: string;
      teacherId?: string;
    },
  ) {
    const matches = (alias: string) => {
      const c = Prisma.raw(alias);
      return Prisma.sql`${scope.groupClassId ? Prisma.sql`${c}.id = ${scope.groupClassId}::uuid` : Prisma.sql`TRUE`}
        AND ${scope.groupId ? Prisma.sql`${c}."groupId" = ${scope.groupId}::uuid` : Prisma.sql`TRUE`}`;
    };
    return this.prisma.$queryRaw<
      { studentId: string; status: AttendanceStatus; n: number }[]
    >`
      SELECT a."studentId", a.status, count(*)::int AS n
      FROM student_attendance a
      JOIN sessions s ON s.id = a."sessionId"
      JOIN rooms r ON r.id = s."roomId"
      CROSS JOIN LATERAL (SELECT ARRAY${sessionClassIdsSql('s')} AS ids) p
      WHERE s.status <> 'CANCELLED'
        ${range.from ? Prisma.sql`AND s.date >= ${range.from}::date` : Prisma.empty}
        ${range.to ? Prisma.sql`AND s.date <= ${range.to}::date` : Prisma.empty}
        ${scope.branchId ? Prisma.sql`AND r."branchId" = ${scope.branchId}::uuid` : Prisma.empty}
        ${scope.teacherId ? Prisma.sql`AND EXISTS (SELECT 1 FROM session_teachers st WHERE st."sessionId" = s.id AND st."teacherId" = ${scope.teacherId}::uuid)` : Prisma.empty}
        AND EXISTS (SELECT 1 FROM group_classes pg WHERE pg.id = ANY(p.ids) AND ${matches('pg')})
        AND (
          cardinality(p.ids) = 1
          OR EXISTS (
            SELECT 1 FROM student_enrollments e
            JOIN group_classes eg ON eg.id = e."groupClassId"
            WHERE e."studentId" = a."studentId"
              AND e."startDate" <= s.date AND (e."endDate" IS NULL OR e."endDate" > s.date)
              AND eg.id = ANY(p.ids) AND ${matches('eg')}
          )
        )
      GROUP BY a."studentId", a.status`;
  }

  /** Sessions in a period (and of a class / group / branch / teacher's team), cancelled ones left out. */
  private sessionFilter(
    range: { from?: string; to?: string },
    scope: {
      groupClassId?: string;
      groupId?: string;
      branchId?: string;
      teacherId?: string;
    },
    excludeCancelled = true,
  ): Prisma.SessionWhereInput {
    return {
      ...(excludeCancelled ? { status: { not: SessionStatus.CANCELLED } } : {}),
      ...(range.from || range.to
        ? {
            date: {
              ...(range.from ? { gte: toDbDate(range.from) } : {}),
              ...(range.to ? { lte: toDbDate(range.to) } : {}),
            },
          }
        : {}),
      // A class's / group's sessions include the shared ones it takes part in
      ...(scope.groupClassId || scope.groupId
        ? {
            AND: [
              ...(scope.groupClassId
                ? [sessionOfClass({ id: scope.groupClassId })]
                : []),
              ...(scope.groupId
                ? [sessionOfClass({ groupId: scope.groupId })]
                : []),
            ],
          }
        : {}),
      ...(scope.branchId ? { room: { branchId: scope.branchId } } : {}),
      ...(scope.teacherId
        ? { teachers: { some: { teacherId: scope.teacherId } } }
        : {}),
    };
  }

  /**
   * The session's teachers: its team SNAPSHOT (who taught it, with their
   * role — never today's class team) plus anyone already recorded who has
   * since left the snapshot, so recorded history is never hidden.
   */
  private async teamOf(db: Tx | PrismaService, sessionId: string) {
    const [snapshot, recorded] = await Promise.all([
      db.sessionTeacher.findMany({
        where: { sessionId },
        select: { teacherId: true, role: true },
      }),
      db.teacherAttendance.findMany({
        where: { sessionId },
        select: { teacherId: true },
      }),
    ]);
    return {
      snapshot,
      allowed: new Set([
        ...snapshot.map((t) => t.teacherId),
        ...recorded.map((r) => r.teacherId),
      ]),
    };
  }

  /** "First Last" of an account (audit snapshot), or its username. */
  private async displayName(db: Tx, userId: string) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        username: true,
        person: { select: { firstName: true, lastName: true } },
      },
    });
    if (!user) return '—';
    return user.person
      ? `${user.person.firstName} ${user.person.lastName}`
      : user.username;
  }

  /**
   * ONE notification to the session's supervisor (its snapshot, so the
   * historical one) when an assistant changed saved statuses. No recipient
   * (no supervisor, no active account, or the actor itself) → nothing, and
   * the save goes on: the audit trail keeps the change either way.
   */
  private async notifySupervisor(
    tx: Tx,
    input: {
      sessionId: string;
      supervisorId?: string;
      actorUserId: string;
      groupName: string;
      date: string;
      changed: { students: number; teachers: number };
    },
  ) {
    if (!input.supervisorId) return;
    const supervisor = await tx.teacher.findUnique({
      where: { id: input.supervisorId },
      select: {
        person: { select: { user: { select: { id: true, isActive: true } } } },
      },
    });
    const recipient = supervisor?.person.user;
    if (!recipient?.isActive || recipient.id === input.actorUserId) return;
    const actor = await tx.user.findUnique({
      where: { id: input.actorUserId },
      select: {
        username: true,
        person: { select: { firstName: true, lastName: true, gender: true } },
      },
    });
    const name = actor?.person
      ? `${actor.person.firstName} ${actor.person.lastName}`
      : (actor?.username ?? '—');
    const what = [
      input.changed.students &&
        pluralAr(input.changed.students, {
          one: 'طالب واحد',
          two: 'طالبين',
          few: 'طلبة',
          many: 'طالبًا',
        }),
      input.changed.teachers &&
        pluralAr(input.changed.teachers, {
          one: 'معلم واحد',
          two: 'معلمين',
          few: 'معلمين',
          many: 'معلمًا',
        }),
    ]
      .filter(Boolean)
      .join(' و');
    const where = `في حصة ${input.groupName} بتاريخ ${formatDateAr(input.date)}`;
    const gender = actor?.person?.gender;
    const message =
      gender === 'FEMALE'
        ? `قامت المعلمة ${name} بتعديل حضور ${what} ${where}.`
        : gender === 'MALE'
          ? `قام المعلم ${name} بتعديل حضور ${what} ${where}.`
          : `عُدِّل حضور ${what} ${where} من طرف ${name}.`;
    await tx.notification.create({
      data: {
        userId: recipient.id,
        type: NotificationType.ATTENDANCE_MODIFIED,
        title: 'تعديل على سجل الحضور',
        message,
        sessionId: input.sessionId,
      },
    });
  }

  private async assertTeacher(teacherId: string) {
    if (
      !(await this.prisma.teacher.findUnique({
        where: { id: teacherId },
        select: { id: true },
      }))
    )
      throw notFound('TEACHER_NOT_FOUND', 'المعلم غير موجود');
  }

  private async assertEditable(
    tx: Tx,
    session: { status: SessionStatus; date: Date },
  ) {
    const reason = await this.notEditableReason(tx, session);
    if (reason) throw reason;
  }

  private async notEditableReason(
    tx: Tx | PrismaService,
    session: { status: SessionStatus; date: Date },
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
    return undefined;
  }

  /** Teachers may change SAVED values only within the window (first recordings: any time). */
  private correctionClosedReason(
    date: string,
    today: string,
    actor: AttendanceActor,
  ) {
    if (
      actor.kind === 'teacher' &&
      !withinTeacherWindow(date, today, this.teacherWindowDays)
    )
      return conflict(
        'ATTENDANCE_CORRECTION_WINDOW_CLOSED',
        `انتهت مهلة تعديل الحضور المسجَّل (${this.teacherWindowDays} أيام): يمكن تسجيل غير المسجَّلين فقط، ولتعديل حضور مسجَّل تواصل مع الإدارة`,
      );
    return undefined;
  }

  /**
   * Expected = enrolled ON the date in one of the session's classes (host +
   * additional classes of a shared session) and ACTIVE; allowed = expected ∪
   * already recorded. classOf = each student's class on that date (a student
   * has one enrollment per date — never listed twice).
   */
  private async rosterIds(
    db: Tx | PrismaService,
    sessionId: string,
    date: string,
  ) {
    const session = await db.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: {
        groupClassId: true,
        extraClasses: { select: { groupClassId: true } },
      },
    });
    const participants = participantIds(session);
    const [enrolled, recorded] = await Promise.all([
      // Enrolled in a participating class ON the date, and ACTIVE ON the date
      // (status history: latest change up to that day) — not today's class or status
      db.$queryRaw<{ studentId: string; groupClassId: string }[]>`
        SELECT e."studentId", e."groupClassId"
        FROM student_enrollments e
        WHERE e."groupClassId" = ANY(${participants}::uuid[])
          AND ${expectedOnDate('e', Prisma.sql`${date}::date`)}`,
      db.studentAttendance.findMany({
        where: { sessionId },
        select: { studentId: true },
      }),
    ]);
    const classOf = new Map(enrolled.map((e) => [e.studentId, e.groupClassId]));
    // Recorded but not expected (e.g. no longer active that day): their class that day, if any
    const others = recorded
      .map((r) => r.studentId)
      .filter((id) => !classOf.has(id));
    if (others.length)
      for (const r of await db.$queryRaw<
        { studentId: string; groupClassId: string }[]
      >`
        SELECT e."studentId", e."groupClassId" FROM student_enrollments e
        WHERE e."studentId" = ANY(${others}::uuid[])
          AND e."startDate" <= ${date}::date
          AND (e."endDate" IS NULL OR e."endDate" > ${date}::date)`)
        classOf.set(r.studentId, r.groupClassId);
    const expected = new Set(enrolled.map((e) => e.studentId));
    return {
      participants,
      classOf,
      expected,
      allowed: new Set([...expected, ...recorded.map((r) => r.studentId)]),
    };
  }

  /** A student the caller may see / manage (their class on the session date is in scope). */
  private visible(
    scope: StudentScope,
    classOf: Map<string, string>,
    studentId: string,
  ) {
    if (scope.allStudents) return true;
    const classId = classOf.get(studentId);
    return classId !== undefined && scope.groupClassIds.includes(classId);
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
        extraClasses: { select: { groupClass: { select: classLabelSelect } } },
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
    // Teachers: in the session's team; an assistant of a shared session sees
    // only their classes' students
    const teacherScope =
      actor.kind === 'teacher'
        ? await this.access.sessionStudentScope(actor.userId, sessionId, db)
        : null;
    const date = fromDbDate(session.date);
    const roster = await this.rosterIds(db, sessionId, date);
    const scope: StudentScope = teacherScope
      ? {
          allStudents: teacherScope.allClasses,
          groupClassIds: teacherScope.classIds,
        }
      : { allStudents: true, groupClassIds: roster.participants };
    const ids = [...roster.allowed].filter((id) =>
      this.visible(scope, roster.classOf, id),
    );
    const classIds = [...new Set(roster.classOf.values())];
    const [students, records, classes] = await Promise.all([
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
      db.groupClass.findMany({
        where: { id: { in: classIds } },
        select: classLabelSelect,
      }),
    ]);
    const classById = new Map(classes.map((c) => [c.id, c]));
    const bySid = new Map(records.map((r) => [r.studentId, r]));
    const rows: RosterStudentDto[] = students
      .map((s) => {
        const r = bySid.get(s.id);
        const classId = roster.classOf.get(s.id);
        return {
          studentId: s.id,
          ...s.person,
          groupClass: (classId && classById.get(classId)) || null,
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
    const expectedCount = rows.filter((r) => r.expected).length;

    // Teachers: the session's own team (snapshot) + anyone already recorded
    const team = await this.teamOf(db, sessionId);
    const [teacherPeople, teacherRecords] = await Promise.all([
      db.teacher.findMany({
        where: { id: { in: [...team.allowed] } },
        select: { id: true, person: personSelect },
      }),
      db.teacherAttendance.findMany({
        where: { sessionId },
        select: {
          teacherId: true,
          status: true,
          note: true,
          updatedAt: true,
          recordedBy: { select: { username: true } },
        },
      }),
    ]);
    const roleOf = new Map(team.snapshot.map((t) => [t.teacherId, t.role]));
    const byTid = new Map(teacherRecords.map((r) => [r.teacherId, r]));
    const roleOrder = (role: TeachingRole | null) =>
      role === TeachingRole.SUPERVISOR
        ? 0
        : role === TeachingRole.ASSISTANT
          ? 1
          : 2;
    const teachers: RosterTeacherDto[] = teacherPeople
      .map((t) => {
        const r = byTid.get(t.id);
        return {
          teacherId: t.id,
          ...t.person,
          role: roleOf.get(t.id) ?? null,
          recorded: Boolean(r),
          status: r?.status ?? null,
          note: r?.note ?? null,
          recordedAt: r?.updatedAt ?? null,
          recordedBy: r?.recordedBy?.username ?? null,
        };
      })
      .sort(
        (a, b) =>
          roleOrder(a.role) - roleOrder(b.role) ||
          a.lastName.localeCompare(b.lastName, 'ar') ||
          a.firstName.localeCompare(b.firstName, 'ar'),
      );
    const editable = !(await this.notEditableReason(db, session));
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
      additionalClasses: session.extraClasses.map((e) => e.groupClass),
      scope: {
        allStudents: scope.allStudents,
        groupClassIds: scope.groupClassIds,
      },
      expectedCount,
      recordedCount,
      complete: expectedCount > 0 && recordedCount === expectedCount,
      editable,
      correctable:
        editable &&
        !this.correctionClosedReason(
          fromDbDate(session.date),
          await platformToday(db),
          actor,
        ),
      students: rows,
      teacherExpectedCount: team.snapshot.length,
      teacherRecordedCount: teachers.filter((t) => t.role && t.recorded).length,
      teachers,
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
