import { ConflictException } from '@nestjs/common';

import { classNotFound } from '../academic/group-classes/group-classes.service.js';
import { toDbDate } from '../common/dates.js';
import { platformToday } from '../common/platform-clock.js';
import { Prisma } from '../generated/prisma/client.js';
import type {
  FinancialTransferConfirmDto,
  TransferItemDto,
  TransferPlanDto,
} from './finance.dto.js';
import { money, toDecimal, ZERO } from './money.js';

type Db = Prisma.TransactionClient;

/**
 * «نقل مالي»: a student moving to a class of ANOTHER group keeps their
 * financial history. For each live obligation of another group in an
 * academic year not over yet, the new group's obligation for that year
 * (created if needed, at its active fee) receives what was settled on the
 * old one (cash + credit received) as credit, up to what it requires; the
 * rest stays on the old one as «رصيد زائد». The old obligation is released in
 * full and closed (full replacement, no proration). Payments are never moved:
 * cash stays where it was paid. Without an active fee in the new group, the
 * move is refused (nothing to carry the credit to).
 */
export async function transferPlan(
  db: Db,
  studentId: string,
  groupClassId: string,
  options: { lock?: boolean } = {},
): Promise<TransferPlanDto> {
  const target = await db.groupClass.findUnique({
    where: { id: groupClassId },
    select: { group: { select: { id: true, name: true } } },
  });
  if (!target) throw classNotFound();
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { groupClass: { select: { groupId: true } } },
  });
  const plan: TransferPlanDto = {
    sameGroup: student?.groupClass?.groupId === target.group.id,
    targetGroup: target.group,
    transfers: [],
  };
  if (!student || plan.sameGroup) return plan;

  const today = await platformToday(db);
  // Locked: a payment, a payment void or a repricing of these waits
  if (options.lock)
    await db.$queryRaw`SELECT id FROM payment_obligations
      WHERE "studentId" = ${studentId}::uuid
        AND "voidedAt" IS NULL AND "closedAt" IS NULL
      FOR UPDATE`;
  const sources = await db.$queryRaw<
    {
      id: string;
      groupId: string;
      groupName: string;
      yearId: string;
      yearLabel: string;
      expected: Prisma.Decimal;
      cash: Prisma.Decimal;
      creditIn: Prisma.Decimal;
    }[]
  >`
    SELECT o.id, o."groupId", g.name AS "groupName", y.id AS "yearId", y.label AS "yearLabel",
      o."expectedAmount" AS expected,
      COALESCE((SELECT SUM(p.amount) FROM payments p
        WHERE p."obligationId" = o.id AND p."voidedAt" IS NULL), 0) AS cash,
      COALESCE((SELECT SUM(t."creditAmount") FROM obligation_transfers t
        WHERE t."toObligationId" = o.id), 0) AS "creditIn"
    FROM payment_obligations o
    JOIN groups g ON g.id = o."groupId"
    JOIN academic_years y ON y.id = o."academicYearId"
    WHERE o."studentId" = ${studentId}::uuid
      AND o."voidedAt" IS NULL AND o."closedAt" IS NULL
      AND o."groupId" <> ${target.group.id}::uuid
      AND y."endDate" >= ${today}::date
    ORDER BY y."startDate", o."createdAt"`;

  for (const o of sources) {
    const settled = new Prisma.Decimal(o.cash).plus(o.creditIn);
    const fee = await db.groupFee.findFirst({
      where: {
        groupId: target.group.id,
        academicYearId: o.yearId,
        isActive: true,
      },
      select: { id: true, amount: true, numberOfPeriods: true },
    });
    // An existing live obligation in the new group for that year (rare): it
    // receives the credit up to what it still requires
    const [existing] = await db.$queryRaw<
      { id: string; expected: Prisma.Decimal; settled: Prisma.Decimal }[]
    >`
      SELECT o.id, o."expectedAmount" AS expected, obligation_settled(o.id) AS settled
      FROM payment_obligations o
      WHERE o."studentId" = ${studentId}::uuid AND o."groupId" = ${target.group.id}::uuid
        AND o."academicYearId" = ${o.yearId}::uuid
        AND o."voidedAt" IS NULL AND o."closedAt" IS NULL`;
    const required = existing
      ? new Prisma.Decimal(existing.expected)
      : fee
        ? fee.amount.times(fee.numberOfPeriods)
        : null;
    const room = existing
      ? Prisma.Decimal.max(required!.minus(existing.settled), ZERO)
      : required;
    const credit = room ? Prisma.Decimal.min(settled, room) : ZERO;
    plan.transfers.push({
      academicYear: { id: o.yearId, label: o.yearLabel },
      from: {
        obligationId: o.id,
        group: { id: o.groupId, name: o.groupName },
        requiredAmount: money(o.expected),
        cashPaid: money(o.cash),
        creditIn: money(o.creditIn),
        settledAmount: money(settled),
      },
      to: {
        group: target.group,
        feeId: fee?.id ?? null,
        requiredAmount: required ? money(required) : null,
      },
      creditAmount: money(credit),
      excessAmount: money(settled.minus(credit)),
      remainingAfter: room ? money(room.minus(credit)) : null,
      blocked: existing || fee ? null : 'NO_TARGET_FEE',
    });
  }
  return plan;
}

const same = (
  plan: TransferItemDto[],
  confirmed: FinancialTransferConfirmDto[] = [],
) => {
  const key = (id: string, amount: string) => `${id}:${money(amount)}`;
  const a = plan.map((t) => key(t.from.obligationId, t.creditAmount)).sort();
  const b = confirmed
    .map((t) => key(t.fromObligationId, t.creditAmount))
    .sort();
  return a.join() === b.join();
};

/**
 * Checks a move against the administrator's confirmation (BEFORE any write
 * of the move): nothing financial → nothing to confirm; otherwise exactly
 * the preview's transfers, or 409.
 */
export function assertTransfersConfirmed(
  plan: TransferPlanDto,
  confirmed: FinancialTransferConfirmDto[] | undefined,
) {
  const blocked = plan.transfers.find((t) => t.blocked);
  if (blocked)
    throw new ConflictException({
      code: 'TRANSFER_TARGET_HAS_NO_FEE',
      message: `لا يوجد معلوم نشط لمجموعة «${plan.targetGroup.name}» في السنة الدراسية ${blocked.academicYear.label}: حدّد معلومها أولًا، ثم انقل الطالب ليُحوَّل رصيده (${blocked.from.settledAmount} د.ت) من مجموعة «${blocked.from.group.name}».`,
      transfers: plan.transfers,
    });
  if (plan.transfers.length === 0) return;
  if (confirmed === undefined)
    throw new ConflictException({
      code: 'FINANCIAL_TRANSFER_REQUIRED',
      message: `نقل الطالب إلى مجموعة «${plan.targetGroup.name}» يغيّر مستحقاته المالية: استعمل «تغيير المجموعة» من صفحة الطالب لمراجعة التسوية المالية وتأكيدها.`,
      transfers: plan.transfers,
    });
  if (!same(plan.transfers, confirmed))
    throw new ConflictException({
      code: 'FINANCIAL_TRANSFER_STALE',
      message:
        'تغيّرت المعطيات المالية للطالب منذ المعاينة (دفعة جديدة أو تعديل معلوم…): أعد فتح النافذة وراجع التسوية ثم أكّدها.',
      transfers: plan.transfers,
    });
}

/**
 * Writes the confirmed transfers (inside the move's transaction, after its
 * enrollment change): the new obligation (if needed), the immutable transfer
 * row, then the old obligation closed. The database checks every amount again.
 */
export async function applyTransfers(
  tx: Db,
  studentId: string,
  plan: TransferPlanDto,
  context: { effectiveDate: string; actorUserId?: string },
) {
  if (plan.transfers.length === 0) return;
  if (!context.actorUserId)
    throw new ConflictException({
      code: 'FINANCIAL_TRANSFER_REQUIRED',
      message: 'النقل المالي يتطلّب تأكيد مسؤول',
    });
  for (const t of plan.transfers) {
    const [existing] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM payment_obligations
      WHERE "studentId" = ${studentId}::uuid AND "groupId" = ${t.to.group.id}::uuid
        AND "academicYearId" = ${t.academicYear.id}::uuid
        AND "voidedAt" IS NULL AND "closedAt" IS NULL`;
    const toId =
      existing?.id ??
      (
        await tx.paymentObligation.create({
          data: {
            studentId,
            groupFeeId: t.to.feeId!,
            groupId: t.to.group.id,
            academicYearId: t.academicYear.id,
            expectedAmount: toDecimal(t.to.requiredAmount!),
            createdByUserId: context.actorUserId,
          },
          select: { id: true },
        })
      ).id;
    await tx.obligationTransfer.create({
      data: {
        studentId,
        fromObligationId: t.from.obligationId,
        toObligationId: toId,
        releasedAmount: toDecimal(t.from.requiredAmount),
        creditAmount: toDecimal(t.creditAmount),
        excessAmount: toDecimal(t.excessAmount),
        effectiveDate: toDbDate(context.effectiveDate),
        reason: `نقل الطالب من «${t.from.group.name}» إلى «${t.to.group.name}»`,
        createdByUserId: context.actorUserId,
      },
    });
    await tx.paymentObligation.update({
      where: { id: t.from.obligationId },
      data: { closedAt: new Date() },
    });
  }
}
