import { ForbiddenException, Injectable } from '@nestjs/common';

import { notFound } from '../common/errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Db = Prisma.TransactionClient | PrismaService;

/** The classes a teacher is assigned to NOW (supervisor or assistant), with their groups and branches. */
export interface TeacherScope {
  teacherId: string;
  classIds: string[];
  groupIds: string[];
  branchIds: string[];
}

/** Inclusive calendar range (YYYY-MM-DD). */
export interface DateRange {
  from: string;
  to: string;
}

const denied = () =>
  new ForbiddenException({
    code: 'TEACHER_CLASS_ACCESS_DENIED',
    message: 'لست مكلّفًا بهذه الحلقة',
  });

/**
 * RESOURCE authorization for teachers. Holding the TEACHER role is never
 * enough: access follows explicit assignments, resolved from the
 * authenticated user (User → Person → Teacher), never from a client-sent id.
 *
 * Policy:
 *  - A SESSION (attendance): the teacher belongs to that session's team
 *    snapshot (supervisor or assistant at the time the lesson was planned —
 *    upcoming sessions follow the class's current team, past ones keep theirs).
 *  - A CLASS for a period (memorization list): the teacher is currently
 *    assigned to the class (supervisor/assistant), or taught one of its
 *    sessions during that period.
 *  - A STUDENT for a period (memorization): the student was enrolled during
 *    that period in a class the teacher may access for that period.
 * An INACTIVE teacher profile has no access. ADMIN rights never apply to the
 * teacher endpoints (an ADMIN + TEACHER account uses the admin endpoints for that).
 */
@Injectable()
export class TeacherAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** The active teacher profile of the authenticated user. */
  async teacherIdOf(userId: string, db: Db = this.prisma): Promise<string> {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        person: { select: { teacher: { select: { id: true, status: true } } } },
      },
    });
    const teacher = user?.person.teacher;
    if (!teacher)
      throw new ForbiddenException({
        code: 'TEACHER_PROFILE_REQUIRED',
        message: 'لا يوجد ملف معلم مرتبط بهذا الحساب',
      });
    if (teacher.status !== 'ACTIVE')
      throw new ForbiddenException({
        code: 'TEACHER_INACTIVE',
        message: 'ملف المعلم غير نشط',
      });
    return teacher.id;
  }

  /**
   * Current assignments only — used by communication (resources,
   * announcements): unlike attendance/memorization, past teaching gives no
   * access to a class's current private content.
   */
  async currentScope(
    userId: string,
    db: Db = this.prisma,
  ): Promise<TeacherScope> {
    const teacherId = await this.teacherIdOf(userId, db);
    const classes = await db.groupClass.findMany({
      where: {
        OR: [
          { supervisorId: teacherId },
          { assistants: { some: { teacherId } } },
        ],
      },
      select: { id: true, groupId: true, branchId: true },
    });
    return {
      teacherId,
      classIds: classes.map((c) => c.id),
      groupIds: [...new Set(classes.map((c) => c.groupId))],
      branchIds: [...new Set(classes.map((c) => c.branchId))],
    };
  }

  /** Session in the teacher's snapshot team → teacherId; 404 if the session does not exist. */
  async assertSessionAccess(
    userId: string,
    sessionId: string,
    db: Db = this.prisma,
  ): Promise<string> {
    const teacherId = await this.teacherIdOf(userId, db);
    const session = await db.session.findUnique({
      where: { id: sessionId },
      select: {
        teachers: { where: { teacherId }, select: { teacherId: true } },
      },
    });
    if (!session) throw notFound('SESSION_NOT_FOUND', 'الحصة غير موجودة');
    if (session.teachers.length === 0) throw denied();
    return teacherId;
  }

  /** Class for a period: current assignment, or taught one of its sessions in the period. */
  async assertClassAccess(
    userId: string,
    groupClassId: string,
    range: DateRange,
    db: Db = this.prisma,
  ): Promise<string> {
    const teacherId = await this.teacherIdOf(userId, db);
    const rows = await db.$queryRaw<{ ok: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM group_classes gc
        WHERE gc.id = ${groupClassId}::uuid
          AND (
            gc."supervisorId" = ${teacherId}::uuid
            OR EXISTS (SELECT 1 FROM group_class_assistants a WHERE a."groupClassId" = gc.id AND a."teacherId" = ${teacherId}::uuid)
            OR EXISTS (
              SELECT 1 FROM sessions s JOIN session_teachers st ON st."sessionId" = s.id
              WHERE s."groupClassId" = gc.id AND st."teacherId" = ${teacherId}::uuid
                AND s.date BETWEEN ${range.from}::date AND ${range.to}::date
            )
          )
      ) AS ok`;
    if (!rows[0]?.ok) throw denied();
    return teacherId;
  }

  /** Student for a period: enrolled (history) in a class the teacher may access for that period. */
  async assertStudentAccess(
    userId: string,
    studentId: string,
    range: DateRange,
    db: Db = this.prisma,
  ): Promise<string> {
    const teacherId = await this.teacherIdOf(userId, db);
    const rows = await db.$queryRaw<{ ok: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM student_enrollments e
        JOIN group_classes gc ON gc.id = e."groupClassId"
        WHERE e."studentId" = ${studentId}::uuid
          AND e."startDate" <= ${range.to}::date
          AND (e."endDate" IS NULL OR e."endDate" > ${range.from}::date)
          AND (
            gc."supervisorId" = ${teacherId}::uuid
            OR EXISTS (SELECT 1 FROM group_class_assistants a WHERE a."groupClassId" = gc.id AND a."teacherId" = ${teacherId}::uuid)
            OR EXISTS (
              SELECT 1 FROM sessions s JOIN session_teachers st ON st."sessionId" = s.id
              WHERE s."groupClassId" = gc.id AND st."teacherId" = ${teacherId}::uuid
                AND s.date BETWEEN GREATEST(e."startDate", ${range.from}::date)
                               AND LEAST(COALESCE(e."endDate" - 1, ${range.to}::date), ${range.to}::date)
            )
          )
      ) AS ok`;
    if (!rows[0]?.ok) throw denied();
    return teacherId;
  }
}
