import { Injectable } from '@nestjs/common';

import { studentNotFound } from '../academic/students/students.service.js';
import { fromDbDate } from '../common/dates.js';
import { conflict, isUniqueViolation, notFound } from '../common/errors.js';
import { PageSizeService } from '../common/page-size.service.js';
import { paginationMeta } from '../common/pagination.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreateObligationDto,
  ObligationDto,
  ObligationListDto,
  ObligationListQueryDto,
  VoidDto,
} from './finance.dto.js';
import { feeNotFound } from './group-fees.service.js';
import { CURRENCY, money, obligationBalance, ZERO } from './money.js';

const userRef = { select: { id: true, username: true } } as const;

const select = {
  id: true,
  student: {
    select: {
      id: true,
      person: { select: { firstName: true, lastName: true } },
    },
  },
  group: { select: { id: true, name: true } },
  academicYear: { select: { id: true, label: true } },
  groupFee: {
    select: {
      id: true,
      label: true,
      billingType: true,
      amount: true,
      numberOfPeriods: true,
      isActive: true,
    },
  },
  expectedAmount: true,
  note: true,
  createdAt: true,
  createdBy: userRef,
  voidedAt: true,
  voidedBy: userRef,
  voidReason: true,
  closedAt: true,
  replacesObligationId: true,
} satisfies Prisma.PaymentObligationSelect;

type Row = Prisma.PaymentObligationGetPayload<{ select: typeof select }>;

export const obligationNotFound = () =>
  notFound('OBLIGATION_NOT_FOUND', 'الالتزام المالي غير موجود');

/** SQL: live CASH paid on the obligation aliased `o`. */
export const LIVE_PAID = Prisma.sql`COALESCE((SELECT SUM(p.amount) FROM payments p
  WHERE p."obligationId" = o.id AND p."voidedAt" IS NULL), 0)`;
/** SQL: credit received by `o` from a previous group (not cash). */
export const CREDIT_IN = Prisma.sql`COALESCE((SELECT SUM(t."creditAmount") FROM obligation_transfers t
  WHERE t."toObligationId" = o.id), 0)`;
/** SQL: credit carried from `o` to the next group. */
export const CREDIT_OUT = Prisma.sql`COALESCE((SELECT SUM(t."creditAmount") FROM obligation_transfers t
  WHERE t."fromObligationId" = o.id), 0)`;
/** SQL: what `o` still requires (a transfer releases it). */
export const REQUIRED = Prisma.sql`(o."expectedAmount" - COALESCE((SELECT SUM(t."releasedAmount")
  FROM obligation_transfers t WHERE t."fromObligationId" = o.id), 0))`;
/** SQL: cash + credit in − credit out (mirrors obligationBalance()). */
export const SETTLED = Prisma.sql`(${LIVE_PAID} + ${CREDIT_IN} - ${CREDIT_OUT})`;

/** SQL: derived status of the obligation aliased `o` (mirrors paymentStatus()). */
export const DERIVED_STATUS = Prisma.sql`CASE
  WHEN o."closedAt" IS NOT NULL THEN 'CLOSED'
  WHEN ${SETTLED} <= 0 THEN 'UNPAID'
  WHEN ${SETTLED} >= ${REQUIRED} THEN 'PAID'
  ELSE 'PARTIAL' END`;

/**
 * Payment obligations (ما يجب على الطالب دفعه): created automatically from
 * the group's active fee (auto-billing.ts), or by an admin. The amount is the
 * fee total at creation and is frozen; «تعديل المعلوم» replaces a never-paid
 * one (void + replacement), a transfer to another group closes it and carries
 * what was settled as credit (ObligationTransfer). One live obligation per
 * student, group and academic year. Balances and status are derived from
 * live payments and transfers, never stored.
 */
@Injectable()
export class ObligationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pageSizes: PageSizeService,
  ) {}

  async create(
    dto: CreateObligationDto,
    adminUserId: string,
  ): Promise<ObligationDto> {
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const student = await tx.student.findUnique({
          where: { id: dto.studentId },
          select: { id: true },
        });
        if (!student) throw studentNotFound();
        const fee = await tx.groupFee.findUnique({
          where: { id: dto.groupFeeId },
          select: {
            groupId: true,
            academicYearId: true,
            amount: true,
            numberOfPeriods: true,
            isActive: true,
          },
        });
        if (!fee) throw feeNotFound();
        if (!fee.isActive) {
          throw conflict(
            'GROUP_FEE_INACTIVE',
            'هذا المعلوم غير نشط (استُبدل أو أُوقف): استعمل المعلوم الحالي للمجموعة',
          );
        }
        // Enrolled in a class of the fee group at some point of its academic year
        const [enrolled] = await tx.$queryRaw<{ ok: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM student_enrollments e
            JOIN group_classes gc ON gc.id = e."groupClassId"
            JOIN academic_years y ON y.id = ${fee.academicYearId}::uuid
            WHERE e."studentId" = ${dto.studentId}::uuid
              AND gc."groupId" = ${fee.groupId}::uuid
              AND e."startDate" <= y."endDate"
              AND (e."endDate" IS NULL OR e."endDate" > y."startDate")
          ) AS ok`;
        if (!enrolled.ok) {
          throw conflict(
            'STUDENT_NOT_IN_GROUP',
            'الطالب لم يكن مسجّلًا في قسم من هذه المجموعة خلال هذه السنة الدراسية',
          );
        }
        const created = await tx.paymentObligation.create({
          data: {
            studentId: dto.studentId,
            groupFeeId: dto.groupFeeId,
            groupId: fee.groupId,
            academicYearId: fee.academicYearId,
            expectedAmount: fee.amount.times(fee.numberOfPeriods),
            note: dto.note ?? null,
            createdByUserId: adminUserId,
          },
          select: { id: true },
        });
        return created.id;
      });
      return this.get(id);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw conflict(
          'OBLIGATION_EXISTS',
          'للطالب التزام مالي قائم لهذه المجموعة في هذه السنة الدراسية',
        );
      }
      throw error;
    }
  }

  async list(query: ObligationListQueryDto): Promise<ObligationListDto> {
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const where = this.filters(query);
    const rows = await this.prisma.$queryRaw<{ id: string; total: bigint }[]>`
      SELECT o.id, COUNT(*) OVER () AS total
      FROM payment_obligations o
      JOIN students s ON s.id = o."studentId"
      JOIN persons pe ON pe.id = s."personId"
      WHERE ${where}
      ORDER BY o."createdAt" DESC, o.id DESC
      LIMIT ${pageSize} OFFSET ${(query.page - 1) * pageSize}`;
    let total = rows.length ? Number(rows[0].total) : 0;
    if (!rows.length && query.page > 1) {
      // Past the last page: still report the real total
      const [count] = await this.prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*) AS total FROM payment_obligations o
        JOIN students s ON s.id = o."studentId"
        JOIN persons pe ON pe.id = s."personId"
        WHERE ${where}`;
      total = Number(count.total);
    }
    return {
      data: await this.hydrate(rows.map((r) => r.id)),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  async get(id: string): Promise<ObligationDto> {
    const [dto] = await this.hydrate([id]);
    if (!dto) throw obligationNotFound();
    return dto;
  }

  /** All obligations of a student (voided included, flagged), newest first. */
  async forStudent(
    studentId: string,
    academicYearId?: string,
  ): Promise<ObligationDto[]> {
    await this.assertStudent(studentId);
    const rows = await this.prisma.paymentObligation.findMany({
      where: { studentId, ...(academicYearId ? { academicYearId } : {}) },
      select: { id: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return this.hydrate(rows.map((r) => r.id));
  }

  /** Correction of a mistaken obligation: kept, flagged, excluded from totals. */
  async void(
    id: string,
    dto: VoidDto,
    adminUserId: string,
  ): Promise<ObligationDto> {
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ voidedAt: Date | null }[]>`
        SELECT "voidedAt" FROM payment_obligations WHERE id = ${id}::uuid FOR UPDATE`;
      if (!locked.length) throw obligationNotFound();
      if (locked[0].voidedAt)
        throw conflict('OBLIGATION_VOIDED', 'هذا الالتزام ملغى بالفعل');
      const livePayments = await tx.payment.count({
        where: { obligationId: id, voidedAt: null },
      });
      if (livePayments) {
        throw conflict(
          'OBLIGATION_HAS_PAYMENTS',
          'لا يمكن إلغاء التزام عليه دفعات: ألغِ الدفعات أولًا',
        );
      }
      const transfers = await tx.obligationTransfer.count({
        where: { OR: [{ fromObligationId: id }, { toObligationId: id }] },
      });
      if (transfers) {
        throw conflict(
          'OBLIGATION_HAS_TRANSFER',
          'لا يمكن إلغاء التزام مرتبط بنقل الطالب بين المجموعات: الرصيد المحوّل جزء من سجله المالي',
        );
      }
      await tx.paymentObligation.update({
        where: { id },
        data: {
          voidedAt: new Date(),
          voidedByUserId: adminUserId,
          voidReason: dto.reason,
        },
      });
    });
    return this.get(id);
  }

  async assertStudent(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      select: { id: true },
    });
    if (!student) throw studentNotFound();
  }

  /** Obligation DTOs with derived balances, in the order of `ids`. */
  async hydrate(ids: string[]): Promise<ObligationDto[]> {
    if (!ids.length) return [];
    const [rows, paid, notIssued, transfers] = await Promise.all([
      this.prisma.paymentObligation.findMany({
        where: { id: { in: ids } },
        select,
      }),
      this.prisma.payment.groupBy({
        by: ['obligationId'],
        where: { obligationId: { in: ids }, voidedAt: null },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.payment.groupBy({
        by: ['obligationId'],
        where: {
          obligationId: { in: ids },
          voidedAt: null,
          receiptIssued: false,
        },
        _count: { _all: true },
      }),
      this.prisma.obligationTransfer.findMany({
        where: {
          OR: [
            { fromObligationId: { in: ids } },
            { toObligationId: { in: ids } },
          ],
        },
        select: {
          fromObligationId: true,
          toObligationId: true,
          releasedAmount: true,
          creditAmount: true,
          excessAmount: true,
          effectiveDate: true,
          createdAt: true,
          from: { select: { group: { select: { id: true, name: true } } } },
          to: { select: { group: { select: { id: true, name: true } } } },
        },
      }),
    ]);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const paidBy = new Map(paid.map((p) => [p.obligationId, p]));
    const notIssuedBy = new Map(
      notIssued.map((p) => [p.obligationId, p._count._all]),
    );
    return ids
      .map((id) => byId.get(id))
      .filter((r): r is Row => Boolean(r))
      .map((r) => {
        const sums = paidBy.get(r.id);
        const {
          student,
          groupFee,
          voidedAt,
          voidedBy,
          voidReason,
          closedAt,
          ...rest
        } = r;
        const out = transfers.find((t) => t.fromObligationId === r.id);
        const received = transfers.filter((t) => t.toObligationId === r.id);
        const creditIn = received.reduce(
          (sum, t) => sum.plus(t.creditAmount),
          ZERO,
        );
        return {
          ...rest,
          student: { id: student.id, ...student.person },
          fee: { ...groupFee, amount: groupFee.amount.toFixed(3) },
          currency: CURRENCY,
          ...obligationBalance({
            expected: r.expectedAmount,
            cash: sums?._sum.amount ?? ZERO,
            creditIn,
            creditOut: out?.creditAmount ?? ZERO,
            released: out?.releasedAmount ?? ZERO,
            closed: Boolean(closedAt),
          }),
          paymentsCount: sums?._count._all ?? 0,
          receiptsNotIssued: notIssuedBy.get(r.id) ?? 0,
          voided: voidedAt
            ? { at: voidedAt, by: voidedBy, reason: voidReason ?? '' }
            : null,
          closed:
            closedAt && out
              ? {
                  at: closedAt,
                  toGroup: out.to.group,
                  creditAmount: money(out.creditAmount),
                  excessAmount: money(out.excessAmount),
                  effectiveDate: fromDbDate(out.effectiveDate),
                }
              : null,
          creditsReceived: received.map((t) => ({
            fromGroup: t.from.group,
            amount: money(t.creditAmount),
            at: t.createdAt,
          })),
        };
      });
  }

  private filters(query: ObligationListQueryDto) {
    const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (!query.includeVoided) parts.push(Prisma.sql`o."voidedAt" IS NULL`);
    if (query.academicYearId)
      parts.push(
        Prisma.sql`o."academicYearId" = ${query.academicYearId}::uuid`,
      );
    if (query.groupId)
      parts.push(Prisma.sql`o."groupId" = ${query.groupId}::uuid`);
    if (query.studentId)
      parts.push(Prisma.sql`o."studentId" = ${query.studentId}::uuid`);
    if (query.status)
      parts.push(Prisma.sql`(${DERIVED_STATUS}) = ${query.status}`);
    if (query.search) {
      const like = `%${query.search.replace(/[\\%_]/g, '\\$&')}%`;
      parts.push(
        Prisma.sql`(pe."firstName" ILIKE ${like} OR pe."lastName" ILIKE ${like})`,
      );
    }
    return Prisma.join(parts, ' AND ');
  }
}
