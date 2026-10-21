import { Injectable } from '@nestjs/common';

import { studentNotFound } from '../academic/students/students.service.js';
import { notFound } from '../common/errors.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  FinanceSummaryDto,
  FinanceSummaryQueryDto,
  StatusCountsDto,
  StudentFinanceSummaryDto,
} from './finance.dto.js';
import { CURRENCY, money, ZERO } from './money.js';
import {
  CREDIT_IN,
  CREDIT_OUT,
  DERIVED_STATUS,
  LIVE_PAID,
  ObligationsService,
  REQUIRED,
  SETTLED,
} from './obligations.service.js';

/**
 * Finance summaries — informational only (no overdue state, nothing is ever
 * blocked by an unpaid balance). Money is returned as decimal strings and
 * summed in SQL numeric / Prisma.Decimal.
 */
@Injectable()
export class FinanceSummaryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly obligations: ObligationsService,
  ) {}

  /** One student: live obligations with balances, totals, statuses, receipts. */
  async forStudent(
    studentId: string,
    academicYearId?: string,
  ): Promise<StudentFinanceSummaryDto> {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        status: true,
        person: { select: { firstName: true, lastName: true } },
        groupClass: {
          select: {
            id: true,
            group: { select: { id: true, name: true } },
            branch: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!student) throw studentNotFound();
    const year = academicYearId
      ? await this.prisma.academicYear.findUnique({
          where: { id: academicYearId },
          select: { id: true, label: true },
        })
      : null;
    if (academicYearId && !year)
      throw notFound('ACADEMIC_YEAR_NOT_FOUND', 'السنة الدراسية غير موجودة');

    const ids = await this.prisma.paymentObligation.findMany({
      where: {
        studentId,
        voidedAt: null,
        ...(academicYearId ? { academicYearId } : {}),
      },
      select: { id: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const obligations = await this.obligations.hydrate(ids.map((o) => o.id));
    const receipts = await this.prisma.payment.groupBy({
      by: ['receiptIssued'],
      where: {
        voidedAt: null,
        obligation: {
          studentId,
          voidedAt: null,
          ...(academicYearId ? { academicYearId } : {}),
        },
      },
      _count: { _all: true },
    });
    const sum = (
      key:
        | 'requiredAmount'
        | 'totalPaid'
        | 'remainingAmount'
        | 'excessAmount'
        | 'creditIn'
        | 'creditOut',
    ) =>
      obligations.reduce(
        (total, o) => total.plus(o[key]),
        new Prisma.Decimal(0),
      );
    const statusCounts: StatusCountsDto = {
      UNPAID: 0,
      PARTIAL: 0,
      PAID: 0,
      CLOSED: 0,
    };
    for (const o of obligations) statusCounts[o.status] += 1;

    const { person, groupClass, ...rest } = student;
    return {
      student: { ...rest, ...person, currentClass: groupClass },
      academicYear: year,
      currency: CURRENCY,
      obligations,
      totals: {
        expectedAmount: money(sum('requiredAmount')),
        totalPaid: money(sum('totalPaid')),
        creditAmount: money(sum('creditIn').minus(sum('creditOut'))),
        remainingAmount: money(sum('remainingAmount')),
        excessAmount: money(sum('excessAmount')),
      },
      statusCounts,
      receipts: {
        issued: receipts.find((r) => r.receiptIssued)?._count._all ?? 0,
        notIssued: receipts.find((r) => !r.receiptIssued)?._count._all ?? 0,
      },
    };
  }

  /**
   * Association totals. Obligations are selected by academic year / group /
   * branch only — their balance (expected, paid, remaining, status) counts
   * ALL their live payments. The from/to dates filter PAYMENTS by paidAt and
   * only feed `collected` (cash received in that period).
   */
  async overall(query: FinanceSummaryQueryDto): Promise<FinanceSummaryDto> {
    const parts: Prisma.Sql[] = [Prisma.sql`o."voidedAt" IS NULL`];
    if (query.academicYearId)
      parts.push(
        Prisma.sql`o."academicYearId" = ${query.academicYearId}::uuid`,
      );
    if (query.groupId)
      parts.push(Prisma.sql`o."groupId" = ${query.groupId}::uuid`);
    if (query.branchId) {
      parts.push(Prisma.sql`EXISTS (
        SELECT 1 FROM student_enrollments e
        JOIN group_classes gc ON gc.id = e."groupClassId"
        JOIN academic_years y ON y.id = o."academicYearId"
        WHERE e."studentId" = o."studentId" AND gc."groupId" = o."groupId"
          AND gc."branchId" = ${query.branchId}::uuid
          AND e."startDate" <= y."endDate"
          AND (e."endDate" IS NULL OR e."endDate" > y."startDate"))`);
    }
    const where = Prisma.join(parts, ' AND ');
    const paidRange = Prisma.join(
      [
        Prisma.sql`TRUE`,
        ...(query.from ? [Prisma.sql`p."paidAt" >= ${query.from}::date`] : []),
        ...(query.to ? [Prisma.sql`p."paidAt" <= ${query.to}::date`] : []),
      ],
      ' AND ',
    );

    const [balances] = await this.prisma.$queryRaw<
      {
        count: bigint;
        required: Prisma.Decimal | null;
        cash: Prisma.Decimal | null;
        credit: Prisma.Decimal | null;
        remaining: Prisma.Decimal | null;
        excess: Prisma.Decimal | null;
        unpaid_count: bigint;
        partial_count: bigint;
        paid_count: bigint;
        closed_count: bigint;
      }[]
    >`
      WITH b AS (
        SELECT ${REQUIRED} AS required, ${LIVE_PAID} AS cash,
               ${CREDIT_IN} - ${CREDIT_OUT} AS credit, ${SETTLED} AS settled,
               ${DERIVED_STATUS} AS status
        FROM payment_obligations o WHERE ${where}
      )
      SELECT COUNT(*) AS count, SUM(required) AS required, SUM(cash) AS cash,
             SUM(credit) AS credit,
             SUM(GREATEST(required - settled, 0)) AS remaining,
             SUM(GREATEST(settled - required, 0)) AS excess,
             COUNT(*) FILTER (WHERE status = 'UNPAID') AS unpaid_count,
             COUNT(*) FILTER (WHERE status = 'PARTIAL') AS partial_count,
             COUNT(*) FILTER (WHERE status = 'PAID') AS paid_count,
             COUNT(*) FILTER (WHERE status = 'CLOSED') AS closed_count
      FROM b`;
    const [collected] = await this.prisma.$queryRaw<
      {
        count: bigint;
        amount: Prisma.Decimal | null;
        not_issued: bigint;
        voided: bigint;
      }[]
    >`
      SELECT COUNT(*) FILTER (WHERE p."voidedAt" IS NULL) AS count,
             SUM(p.amount) FILTER (WHERE p."voidedAt" IS NULL) AS amount,
             COUNT(*) FILTER (WHERE p."voidedAt" IS NULL AND NOT p."receiptIssued") AS not_issued,
             COUNT(*) FILTER (WHERE p."voidedAt" IS NOT NULL) AS voided
      FROM payments p JOIN payment_obligations o ON o.id = p."obligationId"
      WHERE ${where} AND ${paidRange}`;

    return {
      currency: CURRENCY,
      obligationsCount: Number(balances.count),
      // Cash and credit are separate: credit carried between groups is never
      // counted as money received (it nets to 0 association-wide)
      totals: {
        expectedAmount: money(balances.required ?? ZERO),
        totalPaid: money(balances.cash ?? ZERO),
        creditAmount: money(balances.credit ?? ZERO),
        remainingAmount: money(balances.remaining ?? ZERO),
        excessAmount: money(balances.excess ?? ZERO),
      },
      statusCounts: {
        UNPAID: Number(balances.unpaid_count),
        PARTIAL: Number(balances.partial_count),
        PAID: Number(balances.paid_count),
        CLOSED: Number(balances.closed_count),
      },
      collected: {
        paymentsCount: Number(collected.count),
        amount: money(collected.amount),
        receiptsNotIssued: Number(collected.not_issued),
        voidedPaymentsCount: Number(collected.voided),
      },
    };
  }
}
