import { ForbiddenException, Injectable } from '@nestjs/common';

import { notFound } from '../common/errors.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { sessionClassIdsSql } from '../scheduling/participants.js';

type Db = Prisma.TransactionClient | PrismaService;

/** The classes a teacher is assigned to NOW (supervisor or assistant), with their groups and branches. */
export interface TeacherScope {
  teacherId: string;
  classIds: string[];
  groupIds: string[];
  branchIds: string[];
}

/**
 * What a teacher may do with the STUDENTS of one session. `allClasses`: every
 * participating class (a normal one-class session, or the session's
 * supervisor); otherwise only `classIds` — the participating classes the
 * teacher is actually assigned to (an assistant of a shared session).
 */
export interface SessionStudentScope {
  teacherId: string;
  allClasses: boolean;
  /** Participating classes whose students the teacher manages (all of them when allClasses) */
  classIds: string[];
}

/**
 * SQL: teacher `teacherId` (in session `s`'s team snapshot) may manage the
 * students of class `classId` in that session — the session is a normal
 * one-class lesson, OR the teacher is its SUPERVISOR, OR the teacher is
 * actually assigned to that class (supervisor or assistant). Being in a
 * SHARED session's team alone never opens the other classes' students.
 */
export const managesClassInSession = (
  sessionAlias: string,
  classId: Prisma.Sql,
  teacherId: string,
): Prisma.Sql => {
  const s = Prisma.raw(sessionAlias);
  return Prisma.sql`EXISTS (
    SELECT 1 FROM session_teachers st
    WHERE st."sessionId" = ${s}.id AND st."teacherId" = ${teacherId}::uuid
      AND (
        st.role = 'SUPERVISOR'
        OR NOT EXISTS (SELECT 1 FROM session_classes x WHERE x."sessionId" = ${s}.id)
        OR EXISTS (
          SELECT 1 FROM group_classes ag
          WHERE ag.id = ${classId}
            AND (ag."supervisorId" = ${teacherId}::uuid
                 OR EXISTS (SELECT 1 FROM group_class_assistants aa WHERE aa."groupClassId" = ag.id AND aa."teacherId" = ${teacherId}::uuid))
        )
      )
  )`;
};

/** Inclusive calendar range (YYYY-MM-DD). */
export interface DateRange {
  from: string;
  to: string;
}

const studentDenied = () =>
  new ForbiddenException({
    code: 'TEACHER_STUDENT_ACCESS_DENIED',
    message: 'لست مكلّفًا بقسم هذا الطالب في هذه الحصة',
  });

const denied = () =>
  new ForbiddenException({
    code: 'TEACHER_CLASS_ACCESS_DENIED',
    message: 'لست مكلّفًا بهذا القسم',
  });

/**
 * RESOURCE authorization for teachers. Holding the TEACHER role is never
 * enough: access follows explicit assignments, resolved from the
 * authenticated user (User → Person → Teacher), never from a client-sent id.
 *
 * Policy:
 *  - A SESSION (its details): the teacher belongs to that session's team
 *    snapshot (supervisor or assistant at the time the lesson was planned —
 *    upcoming sessions follow the class's current team, past ones keep theirs).
 *  - The STUDENTS of a session (attendance, «متابعة العمل»): a normal session
 *    → all of them, as before. A SHARED session («الحصص المشتركة», several
 *    classes) → its supervisor manages all of them; an assistant only the
 *    students (by their class ON the session date) of the participating
 *    classes they are actually assigned to (`managesClassInSession`).
 *  - A CLASS for a period (memorization list): the teacher is currently
 *    assigned to the class (supervisor/assistant), or taught one of its
 *    sessions during that period — for a shared session, only where they
 *    managed that class's students there.
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

  /**
   * The students a teacher may manage in a session (they must be in its team
   * snapshot — 403 otherwise; 404 if the session does not exist).
   */
  async sessionStudentScope(
    userId: string,
    sessionId: string,
    db: Db = this.prisma,
  ): Promise<SessionStudentScope> {
    const teacherId = await this.assertSessionAccess(userId, sessionId, db);
    const rows = await db.$queryRaw<{ id: string; manages: boolean }[]>`
      SELECT p.id, ${managesClassInSession('s', Prisma.sql`p.id`, teacherId)} AS manages
      FROM sessions s
      CROSS JOIN LATERAL unnest(ARRAY${sessionClassIdsSql('s')}) AS p(id)
      WHERE s.id = ${sessionId}::uuid`;
    const classIds = rows.filter((r) => r.manages).map((r) => r.id);
    return {
      teacherId,
      allClasses: classIds.length === rows.length,
      classIds,
    };
  }

  /**
   * One student of a session: their class ON the session date must be one
   * the teacher manages there (always true for a normal session or its
   * supervisor). 403 otherwise.
   */
  async assertSessionStudentAccess(
    userId: string,
    sessionId: string,
    studentId: string,
    db: Db = this.prisma,
  ): Promise<string> {
    const scope = await this.sessionStudentScope(userId, sessionId, db);
    if (scope.allClasses) return scope.teacherId;
    const [row] = await db.$queryRaw<{ ok: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM sessions s
        JOIN student_enrollments e ON e."studentId" = ${studentId}::uuid
          AND e."startDate" <= s.date AND (e."endDate" IS NULL OR e."endDate" > s.date)
        WHERE s.id = ${sessionId}::uuid
          AND e."groupClassId" = ANY(${scope.classIds}::uuid[])
      ) AS ok`;
    if (!row?.ok) throw studentDenied();
    return scope.teacherId;
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
              SELECT 1 FROM sessions s
              WHERE gc.id = ANY(ARRAY${sessionClassIdsSql('s')})
                AND s.date BETWEEN ${range.from}::date AND ${range.to}::date
                AND ${managesClassInSession('s', Prisma.sql`gc.id`, teacherId)}
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
              SELECT 1 FROM sessions s
              WHERE gc.id = ANY(ARRAY${sessionClassIdsSql('s')})
                AND s.date BETWEEN GREATEST(e."startDate", ${range.from}::date)
                               AND LEAST(COALESCE(e."endDate" - 1, ${range.to}::date), ${range.to}::date)
                AND ${managesClassInSession('s', Prisma.sql`gc.id`, teacherId)}
            )
          )
      ) AS ok`;
    if (!rows[0]?.ok) throw denied();
    return teacherId;
  }
}
