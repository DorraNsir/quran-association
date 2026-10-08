import { Injectable } from '@nestjs/common';

import { fromDbDate, toDbDate } from '../common/dates.js';
import {
  badRequest,
  conflict,
  notFound,
  violatesConstraint,
} from '../common/errors.js';
import { PageSizeService } from '../common/page-size.service.js';
import { paginationMeta } from '../common/pagination.js';
import { platformToday } from '../common/platform-clock.js';
import {
  BillingType,
  PaymentMethod,
  type Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  CreatePaymentDto,
  PaymentDto,
  PaymentListDto,
  PaymentListQueryDto,
  SetReceiptDto,
  VoidDto,
} from './finance.dto.js';
import { CURRENCY, money, toDecimal } from './money.js';
import {
  obligationNotFound,
  ObligationsService,
} from './obligations.service.js';

const userRef = { select: { id: true, username: true } } as const;

const select = {
  id: true,
  obligationId: true,
  obligation: {
    select: {
      student: {
        select: {
          id: true,
          person: { select: { firstName: true, lastName: true } },
        },
      },
      group: { select: { id: true, name: true } },
      academicYear: { select: { id: true, label: true } },
    },
  },
  amount: true,
  paidAt: true,
  method: true,
  periodNumber: true,
  note: true,
  receiptIssued: true,
  receiptIssuedAt: true,
  receiptIssuedBy: userRef,
  recordedBy: userRef,
  createdAt: true,
  voidedAt: true,
  voidedBy: userRef,
  voidReason: true,
} satisfies Prisma.PaymentSelect;

type Row = Prisma.PaymentGetPayload<{ select: typeof select }>;

function toDto(p: Row): PaymentDto {
  const {
    obligation,
    amount,
    paidAt,
    voidedAt,
    voidedBy,
    voidReason,
    ...rest
  } = p;
  return {
    ...rest,
    student: { id: obligation.student.id, ...obligation.student.person },
    group: obligation.group,
    academicYear: obligation.academicYear,
    amount: money(amount),
    currency: CURRENCY,
    paidAt: fromDbDate(paidAt),
    voided: voidedAt
      ? { at: voidedAt, by: voidedBy, reason: voidReason ?? '' }
      : null,
  };
}

const paymentNotFound = () =>
  notFound('PAYMENT_NOT_FOUND', 'الدفعة غير موجودة');
const exceeds = (remaining?: string) =>
  conflict(
    'AMOUNT_EXCEEDS_REMAINING',
    remaining
      ? `المبلغ يتجاوز المتبقي (${remaining} د.ت) — لا يُقبل دفع زائد`
      : 'المبلغ يتجاوز المتبقي — لا يُقبل دفع زائد',
  );

/**
 * Cash payments (الدفعات): append-only transactions against ONE obligation.
 * Partial payments are allowed; the total of live payments never exceeds the
 * obligation (checked under the obligation row lock, and again by a database
 * trigger). Mistakes are corrected by VOIDING (who, when, why) — a payment is
 * never edited or deleted. The receipt flag is independent of the amounts.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pageSizes: PageSizeService,
    private readonly obligations: ObligationsService,
  ) {}

  async record(
    dto: CreatePaymentDto,
    adminUserId: string,
  ): Promise<PaymentDto> {
    const amount = toDecimal(dto.amount);
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        // Serializes concurrent payments of the same obligation
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM payment_obligations WHERE id = ${dto.obligationId}::uuid FOR UPDATE`;
        if (!locked.length) throw obligationNotFound();
        const obligation = await tx.paymentObligation.findUniqueOrThrow({
          where: { id: dto.obligationId },
          select: {
            expectedAmount: true,
            voidedAt: true,
            groupFee: { select: { billingType: true, numberOfPeriods: true } },
          },
        });
        if (obligation.voidedAt) {
          throw conflict(
            'OBLIGATION_VOIDED',
            'هذا الالتزام ملغى: لا يمكن تسجيل دفعة عليه',
          );
        }
        const { billingType, numberOfPeriods } = obligation.groupFee;
        if (dto.periodNumber !== undefined) {
          if (billingType !== BillingType.MONTHLY) {
            throw badRequest(
              'PERIOD_NOT_APPLICABLE',
              'رقم الشهر يخصّ المعاليم الشهرية فقط',
            );
          }
          if (dto.periodNumber > numberOfPeriods) {
            throw badRequest(
              'INVALID_PERIOD',
              `رقم الشهر بين 1 و${numberOfPeriods}`,
            );
          }
        }
        const today = await platformToday(tx);
        const paidAt = dto.paidAt ?? today;
        if (paidAt > today) {
          throw badRequest(
            'PAYMENT_DATE_IN_FUTURE',
            'تاريخ الدفع لا يمكن أن يكون في المستقبل',
          );
        }
        const paid = await tx.payment.aggregate({
          where: { obligationId: dto.obligationId, voidedAt: null },
          _sum: { amount: true },
        });
        const remaining = obligation.expectedAmount.minus(
          paid._sum.amount ?? 0,
        );
        if (remaining.lte(0)) {
          throw conflict(
            'OBLIGATION_FULLY_PAID',
            'تمّ خلاص هذا الالتزام بالكامل',
          );
        }
        if (amount.gt(remaining)) throw exceeds(money(remaining));
        const created = await tx.payment.create({
          data: {
            obligationId: dto.obligationId,
            amount,
            paidAt: toDbDate(paidAt),
            method: PaymentMethod.CASH,
            periodNumber: dto.periodNumber ?? null,
            note: dto.note ?? null,
            recordedByUserId: adminUserId,
            ...(dto.receiptIssued
              ? {
                  receiptIssued: true,
                  receiptIssuedAt: new Date(),
                  receiptIssuedByUserId: adminUserId,
                }
              : {}),
          },
          select: { id: true },
        });
        return created.id;
      });
      return this.get(id);
    } catch (error) {
      // Database backstop (trigger) — same answer as the service check
      if (violatesConstraint(error, 'payments_no_overpayment')) throw exceeds();
      throw error;
    }
  }

  async list(query: PaymentListQueryDto): Promise<PaymentListDto> {
    const pageSize = await this.pageSizes.resolve(query.pageSize);
    const obligation: Prisma.PaymentObligationWhereInput = {
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
      ...(query.groupId ? { groupId: query.groupId } : {}),
    };
    const where: Prisma.PaymentWhereInput = {
      ...(query.obligationId ? { obligationId: query.obligationId } : {}),
      ...(Object.keys(obligation).length ? { obligation } : {}),
      ...(query.from || query.to
        ? {
            paidAt: {
              ...(query.from ? { gte: toDbDate(query.from) } : {}),
              ...(query.to ? { lte: toDbDate(query.to) } : {}),
            },
          }
        : {}),
      ...(query.receiptIssued !== undefined
        ? { receiptIssued: query.receiptIssued }
        : {}),
      ...(query.includeVoided ? {} : { voidedAt: null }),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        select,
        orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map(toDto),
      meta: paginationMeta(query.page, pageSize, total),
    };
  }

  async get(id: string): Promise<PaymentDto> {
    const row = await this.prisma.payment.findUnique({
      where: { id },
      select,
    });
    if (!row) throw paymentNotFound();
    return toDto(row);
  }

  /** Every payment of an obligation (voided included, flagged), oldest first. */
  async forObligation(obligationId: string): Promise<PaymentDto[]> {
    const obligation = await this.prisma.paymentObligation.findUnique({
      where: { id: obligationId },
      select: { id: true },
    });
    if (!obligation) throw obligationNotFound();
    return this.findAll({ obligationId });
  }

  /** Every payment of a student (voided included, flagged), oldest first. */
  async forStudent(
    studentId: string,
    academicYearId?: string,
  ): Promise<PaymentDto[]> {
    await this.obligations.assertStudent(studentId);
    return this.findAll({
      obligation: {
        studentId,
        ...(academicYearId ? { academicYearId } : {}),
      },
    });
  }

  /** Correction: the payment stays (with who/when/why) and leaves every total. */
  async void(
    id: string,
    dto: VoidDto,
    adminUserId: string,
  ): Promise<PaymentDto> {
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ voidedAt: Date | null }[]>`
        SELECT "voidedAt" FROM payments WHERE id = ${id}::uuid FOR UPDATE`;
      if (!locked.length) throw paymentNotFound();
      if (locked[0].voidedAt)
        throw conflict('PAYMENT_ALREADY_VOIDED', 'هذه الدفعة ملغاة بالفعل');
      await tx.payment.update({
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

  /** Receipt handed over (or the flag corrected): amounts and totals never change. */
  async setReceipt(
    id: string,
    dto: SetReceiptDto,
    adminUserId: string,
  ): Promise<PaymentDto> {
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { voidedAt: Date | null; receiptIssued: boolean }[]
      >`SELECT "voidedAt", "receiptIssued" FROM payments WHERE id = ${id}::uuid FOR UPDATE`;
      if (!locked.length) throw paymentNotFound();
      if (locked[0].voidedAt)
        throw conflict('PAYMENT_VOIDED', 'هذه الدفعة ملغاة');
      if (locked[0].receiptIssued === dto.receiptIssued) return;
      await tx.payment.update({
        where: { id },
        data: dto.receiptIssued
          ? {
              receiptIssued: true,
              receiptIssuedAt: new Date(),
              receiptIssuedByUserId: adminUserId,
            }
          : {
              receiptIssued: false,
              receiptIssuedAt: null,
              receiptIssuedByUserId: null,
            },
      });
    });
    return this.get(id);
  }

  private async findAll(where: Prisma.PaymentWhereInput) {
    const rows = await this.prisma.payment.findMany({
      where,
      select,
      orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toDto);
  }
}
