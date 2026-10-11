import { platformToday } from '../common/platform-clock.js';
import { Prisma } from '../generated/prisma/client.js';

type Tx = Prisma.TransactionClient;

/**
 * Automatic billing: an ACTIVE student currently in a class of a group that
 * has an ACTIVE fee for an academic year that is not over yet is charged
 * that fee — the obligation row is created here, never by hand. Called
 * inside the caller's transaction whenever a student can become billable:
 * student created (or registration accepted), moved to another class,
 * reactivated, or a group's fee set.
 *
 * Safe to repeat: a student who already has a live obligation for the group
 * and year is skipped (also guaranteed by the one-live-obligation unique
 * index), and an obligation an admin voided for that fee is not recreated.
 * The amount is the fee total at that moment, then frozen (later fee
 * changes never rewrite it). Returns how many obligations were created.
 */
export async function billStudents(
  tx: Tx,
  scope: { studentId?: string; groupId?: string; groupFeeId?: string },
  actorUserId?: string | null,
): Promise<number> {
  const today = await platformToday(tx);
  const rows = await tx.$queryRaw<
    {
      studentId: string;
      feeId: string;
      groupId: string;
      academicYearId: string;
      total: Prisma.Decimal;
    }[]
  >`
    SELECT DISTINCT s.id AS "studentId", f.id AS "feeId", f."groupId",
      f."academicYearId", f.amount * f."numberOfPeriods" AS total
    FROM students s
    JOIN student_enrollments e ON e."studentId" = s.id AND e."endDate" IS NULL
    JOIN group_classes gc ON gc.id = e."groupClassId"
    JOIN group_fees f ON f."groupId" = gc."groupId" AND f."isActive"
    JOIN academic_years y ON y.id = f."academicYearId"
    WHERE s.status = 'ACTIVE'
      AND y."endDate" >= ${today}::date
      AND e."startDate" <= y."endDate"
      ${scope.studentId ? Prisma.sql`AND s.id = ${scope.studentId}::uuid` : Prisma.empty}
      ${scope.groupId ? Prisma.sql`AND f."groupId" = ${scope.groupId}::uuid` : Prisma.empty}
      ${scope.groupFeeId ? Prisma.sql`AND f.id = ${scope.groupFeeId}::uuid` : Prisma.empty}
      AND NOT EXISTS (
        SELECT 1 FROM payment_obligations o
        WHERE o."studentId" = s.id
          AND ((o."groupId" = f."groupId" AND o."academicYearId" = f."academicYearId" AND o."voidedAt" IS NULL)
            OR o."groupFeeId" = f.id)
      )`;
  if (rows.length === 0) return 0;
  const { count } = await tx.paymentObligation.createMany({
    data: rows.map((r) => ({
      studentId: r.studentId,
      groupFeeId: r.feeId,
      groupId: r.groupId,
      academicYearId: r.academicYearId,
      expectedAmount: r.total,
      createdByUserId: actorUserId ?? null,
    })),
    skipDuplicates: true,
  });
  return count;
}
