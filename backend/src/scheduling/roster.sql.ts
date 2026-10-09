import { Prisma } from '../generated/prisma/client.js';

/**
 * THE roster rule, in one place (attendance roster and session counts):
 * a student is expected in a session when enrolled in the session's class ON
 * its date and ACTIVE on that date (latest status change up to that day) —
 * not today's class nor today's status.
 *
 * `enrollment` is the alias of a student_enrollments row; `date` an SQL date
 * expression (column or parameter).
 */
export const expectedOnDate = (
  enrollment: string,
  date: Prisma.Sql,
): Prisma.Sql => {
  const e = Prisma.raw(enrollment);
  return Prisma.sql`${e}."startDate" <= ${date}
    AND (${e}."endDate" IS NULL OR ${e}."endDate" > ${date})
    AND (
      SELECT c.status FROM student_status_changes c
      WHERE c."studentId" = ${e}."studentId" AND c."effectiveDate" <= ${date}
      ORDER BY c."effectiveDate" DESC
      LIMIT 1
    ) = 'ACTIVE'`;
};
