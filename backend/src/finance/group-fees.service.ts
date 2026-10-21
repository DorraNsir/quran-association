import { ConflictException, Injectable } from '@nestjs/common';

import { classNotFound } from '../academic/group-classes/group-classes.service.js';
import { fromDbDate, fromDbDateOrNull, toDbDate } from '../common/dates.js';
import {
  badRequest,
  conflict,
  isUniqueViolation,
  notFound,
} from '../common/errors.js';
import {
  BillingType,
  type Prisma,
  RecordStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ApplicableFeeDto,
  GroupFeeDto,
  GroupFeeListDto,
  GroupFeeQueryDto,
  RepriceItemDto,
  RepricePreviewDto,
  RepricePreviewQueryDto,
  RepriceProtectedDto,
  RepriceProtection,
  SetGroupFeeDto,
} from './finance.dto.js';
import { CURRENCY, type Decimal, money, toDecimal } from './money.js';
import { billStudents } from './auto-billing.js';

const userRef = { select: { id: true, username: true } } as const;

export const feeSelect = {
  id: true,
  group: { select: { id: true, name: true } },
  academicYear: { select: { id: true, label: true } },
  label: true,
  billingType: true,
  amount: true,
  numberOfPeriods: true,
  startDate: true,
  endDate: true,
  isActive: true,
  createdAt: true,
  createdBy: userRef,
  deactivatedAt: true,
  deactivatedBy: userRef,
  _count: { select: { obligations: { where: { voidedAt: null } } } },
} satisfies Prisma.GroupFeeSelect;

type FeeRow = Prisma.GroupFeeGetPayload<{ select: typeof feeSelect }>;

/**
 * «استُبدل» vs «موقوف»: a version deactivated when a newer one was created
 * (same instant — setForGroup writes both together; older data within a few
 * seconds) was REPLACED; otherwise it was STOPPED («إيقاف»).
 */
function feeStatus(
  f: { id: string; isActive: boolean; deactivatedAt: Date | null },
  versions: { id: string; createdAt: Date }[],
): GroupFeeDto['status'] {
  if (f.isActive) return 'ACTIVE';
  const at = f.deactivatedAt?.getTime();
  return at !== undefined &&
    versions.some(
      (v) => v.id !== f.id && Math.abs(v.createdAt.getTime() - at) < 5_000,
    )
    ? 'REPLACED'
    : 'STOPPED';
}

function toDto(
  f: FeeRow,
  versions: { id: string; createdAt: Date }[] = [],
): GroupFeeDto {
  const { _count, amount, startDate, endDate, ...rest } = f;
  return {
    ...rest,
    status: feeStatus(f, versions),
    amount: money(amount),
    totalAmount: money(amount.times(f.numberOfPeriods)),
    currency: CURRENCY,
    startDate: fromDbDateOrNull(startDate),
    endDate: fromDbDateOrNull(endDate),
    obligationsCount: _count.obligations,
  };
}

export const feeNotFound = () =>
  notFound('GROUP_FEE_NOT_FOUND', 'معلوم المجموعة غير موجود');
const groupNotFound = () => notFound('GROUP_NOT_FOUND', 'المجموعة غير موجودة');
const yearNotFound = () =>
  notFound('ACADEMIC_YEAR_NOT_FOUND', 'السنة الدراسية غير موجودة');

/** «تعديل المعلوم»: the reason recorded on a repriced (voided) obligation */
export const REPRICE_REASON = 'تعديل المعلوم';

interface RepricePlan {
  toUpdate: RepriceItemDto[];
  protected: RepriceProtectedDto[];
  unchangedCount: number;
}

/**
 * What a new total does to the live obligations of a group and year. Only a
 * NEVER-PAID obligation (no payment at all, voided ones included, and no
 * credit from a transfer) of a student still ACTIVE in the group is repriced;
 * every other one keeps its amount, with the reasons. Already at the new
 * amount: nothing to do.
 */
async function repricePlan(
  db: Prisma.TransactionClient,
  groupId: string,
  academicYearId: string,
  total: Decimal,
): Promise<RepricePlan> {
  const rows = await db.$queryRaw<
    {
      id: string;
      studentId: string;
      firstName: string;
      lastName: string;
      expected: Prisma.Decimal;
      live_payments: bigint;
      voided_payments: bigint;
      has_credit: boolean;
      status: RecordStatus;
      in_group: boolean;
    }[]
  >`
    SELECT o.id, o."studentId", pe."firstName", pe."lastName", o."expectedAmount" AS expected,
      (SELECT COUNT(*) FROM payments p WHERE p."obligationId" = o.id AND p."voidedAt" IS NULL) AS live_payments,
      (SELECT COUNT(*) FROM payments p WHERE p."obligationId" = o.id AND p."voidedAt" IS NOT NULL) AS voided_payments,
      EXISTS (SELECT 1 FROM obligation_transfers t WHERE t."toObligationId" = o.id) AS has_credit,
      s.status,
      EXISTS (
        SELECT 1 FROM student_enrollments e
        JOIN group_classes gc ON gc.id = e."groupClassId"
        WHERE e."studentId" = o."studentId" AND e."endDate" IS NULL
          AND gc."groupId" = o."groupId") AS in_group
    FROM payment_obligations o
    JOIN students s ON s.id = o."studentId"
    JOIN persons pe ON pe.id = s."personId"
    WHERE o."groupId" = ${groupId}::uuid
      AND o."academicYearId" = ${academicYearId}::uuid
      AND o."voidedAt" IS NULL AND o."closedAt" IS NULL
    ORDER BY pe."lastName", pe."firstName", o.id`;
  const plan: RepricePlan = { toUpdate: [], protected: [], unchangedCount: 0 };
  for (const r of rows) {
    if (r.expected.equals(total)) {
      plan.unchangedCount += 1;
      continue;
    }
    const reasons: RepriceProtection[] = [];
    if (r.live_payments > 0n) reasons.push('HAS_PAYMENTS');
    else if (r.voided_payments > 0n) reasons.push('HAS_VOIDED_PAYMENTS');
    if (r.has_credit) reasons.push('HAS_TRANSFER_CREDIT');
    if (r.status !== RecordStatus.ACTIVE) reasons.push('STUDENT_INACTIVE');
    if (!r.in_group) reasons.push('LEFT_GROUP');
    const student = {
      id: r.studentId,
      firstName: r.firstName,
      lastName: r.lastName,
    };
    if (reasons.length)
      plan.protected.push({
        obligationId: r.id,
        student,
        currentAmount: money(r.expected),
        reasons,
      });
    else
      plan.toUpdate.push({
        obligationId: r.id,
        student,
        currentAmount: money(r.expected),
        newAmount: money(total),
      });
  }
  return plan;
}

/**
 * Group fees (معلوم المجموعة): the price belongs to the Group for one
 * academic year and every class of the group inherits it. Fees are
 * VERSIONED: setting a new fee deactivates the previous version (kept as
 * history) instead of editing it, and obligations keep the amount they were
 * charged — a fee change never alters an existing obligation.
 */
@Injectable()
export class GroupFeesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every version of the group's fees, newest first. */
  async listForGroup(
    groupId: string,
    query: GroupFeeQueryDto,
  ): Promise<GroupFeeListDto> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true },
    });
    if (!group) throw groupNotFound();
    const rows = await this.prisma.groupFee.findMany({
      where: {
        groupId,
        ...(query.academicYearId
          ? { academicYearId: query.academicYearId }
          : {}),
      },
      select: feeSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return {
      data: rows.map((f) =>
        toDto(
          f,
          rows.filter((v) => v.academicYear.id === f.academicYear.id),
        ),
      ),
    };
  }

  async get(id: string): Promise<GroupFeeDto> {
    const fee = await this.prisma.groupFee.findUnique({
      where: { id },
      select: feeSelect,
    });
    if (!fee) throw feeNotFound();
    return toDto(fee, await this.versionsOf(fee));
  }

  private versionsOf(fee: FeeRow) {
    return this.prisma.groupFee.findMany({
      where: { groupId: fee.group.id, academicYearId: fee.academicYear.id },
      select: { id: true, createdAt: true },
    });
  }

  /**
   * «تعديل المعلوم» preview (read-only): the obligations a new amount would
   * update, and the protected ones with their reasons.
   */
  async repricePreview(
    groupId: string,
    query: RepricePreviewQueryDto,
  ): Promise<RepricePreviewDto> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true },
    });
    if (!group) throw groupNotFound();
    const year = await this.prisma.academicYear.findUnique({
      where: { id: query.academicYearId },
      select: { id: true, label: true },
    });
    if (!year) throw yearNotFound();
    const total = toDecimal(query.amount).times(
      query.billingType === BillingType.MONTHLY
        ? (query.numberOfPeriods ?? 1)
        : 1,
    );
    const current = await this.prisma.groupFee.findFirst({
      where: { groupId, academicYearId: year.id, isActive: true },
      select: feeSelect,
    });
    return {
      academicYear: year,
      currentFee: current ? toDto(current) : null,
      newTotalAmount: money(total),
      ...(await repricePlan(this.prisma, groupId, year.id, total)),
    };
  }

  /**
   * Sets THE fee of a group for a year: creates a new active version and
   * deactivates the previous one (if any), atomically under a group lock.
   * «تعديل المعلوم»: the never-paid obligations of the preview (confirmed in
   * `repriceObligationIds`, checked again under lock) are voided and replaced
   * at the new total, linked to the original; the others keep their amount.
   */
  async setForGroup(
    groupId: string,
    dto: SetGroupFeeDto,
    adminUserId: string,
  ): Promise<GroupFeeDto> {
    const billingType = dto.billingType ?? BillingType.YEARLY;
    const periods = dto.numberOfPeriods ?? 1;
    if (billingType === BillingType.YEARLY && periods !== 1) {
      throw badRequest(
        'INVALID_NUMBER_OF_PERIODS',
        'المعلوم السنوي يكون لفترة واحدة (numberOfPeriods = 1)',
      );
    }
    if (dto.startDate && dto.endDate && dto.endDate < dto.startDate) {
      throw badRequest(
        'INVALID_DATE_RANGE',
        'تاريخ النهاية يجب أن يكون بعد تاريخ البداية',
      );
    }
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ status: RecordStatus }[]>`
          SELECT status FROM groups WHERE id = ${groupId}::uuid FOR UPDATE`;
        if (!locked.length) throw groupNotFound();
        if (locked[0].status === RecordStatus.ARCHIVED) {
          throw conflict(
            'GROUP_ARCHIVED',
            'لا يمكن تحديد معلوم لمجموعة مؤرشفة',
          );
        }
        const year = await tx.academicYear.findUnique({
          where: { id: dto.academicYearId },
          select: { startDate: true, endDate: true },
        });
        if (!year) throw yearNotFound();
        const [yearStart, yearEnd] = [
          fromDbDate(year.startDate),
          fromDbDate(year.endDate),
        ];
        for (const date of [dto.startDate, dto.endDate]) {
          if (date && (date < yearStart || date > yearEnd)) {
            throw badRequest(
              'FEE_DATES_OUTSIDE_YEAR',
              'تواريخ المعلوم يجب أن تكون داخل السنة الدراسية',
            );
          }
        }
        const total = toDecimal(dto.amount).times(periods);
        // The group's live obligations for the year, locked: a payment or a
        // transfer on one of them waits until this repricing is done
        await tx.$queryRaw`SELECT id FROM payment_obligations
          WHERE "groupId" = ${groupId}::uuid
            AND "academicYearId" = ${dto.academicYearId}::uuid
            AND "voidedAt" IS NULL AND "closedAt" IS NULL
          FOR UPDATE`;
        const plan = await repricePlan(tx, groupId, dto.academicYearId, total);
        const toUpdate = plan.toUpdate.map((o) => o.obligationId).sort();
        if (toUpdate.length > 0 && dto.repriceObligationIds === undefined)
          throw new ConflictException({
            code: 'FEE_REPRICE_CONFIRMATION_REQUIRED',
            message: `تعديل المعلوم يغيّر المبلغ المطلوب من ${toUpdate.length} طالب لم يدفعوا بعد: راجع المعاينة وأكّدها`,
            toUpdate: plan.toUpdate,
          });
        const confirmed = [...new Set(dto.repriceObligationIds ?? [])].sort();
        if (confirmed.join() !== toUpdate.join())
          throw new ConflictException({
            code: 'FEE_REPRICE_STALE',
            message:
              'تغيّرت مستحقات طلبة هذه المجموعة منذ المعاينة (دفعة جديدة أو طالب جديد…): أعد فتح النافذة وراجع التعديل ثم أكّده',
            toUpdate: plan.toUpdate,
          });
        // One instant for both: the old version reads «استُبدل»
        const now = new Date();
        await tx.groupFee.updateMany({
          where: {
            groupId,
            academicYearId: dto.academicYearId,
            isActive: true,
          },
          data: {
            isActive: false,
            deactivatedAt: now,
            deactivatedByUserId: adminUserId,
          },
        });
        const created = await tx.groupFee.create({
          data: {
            groupId,
            academicYearId: dto.academicYearId,
            label: dto.label,
            billingType,
            amount: toDecimal(dto.amount),
            numberOfPeriods: periods,
            startDate: dto.startDate ? toDbDate(dto.startDate) : null,
            endDate: dto.endDate ? toDbDate(dto.endDate) : null,
            createdByUserId: adminUserId,
            createdAt: now,
          },
          select: { id: true },
        });
        // Never-paid obligations: voided («تعديل المعلوم») and replaced at the
        // new total, linked to the original (both kept)
        for (const obligationId of toUpdate) {
          const old = await tx.paymentObligation.update({
            where: { id: obligationId },
            data: {
              voidedAt: now,
              voidedByUserId: adminUserId,
              voidReason: REPRICE_REASON,
            },
            select: { studentId: true },
          });
          await tx.paymentObligation.create({
            data: {
              studentId: old.studentId,
              groupFeeId: created.id,
              groupId,
              academicYearId: dto.academicYearId,
              expectedAmount: total,
              createdByUserId: adminUserId,
              replacesObligationId: obligationId,
            },
          });
        }
        // The group's current students are charged automatically (those already charged are kept)
        await billStudents(tx, { groupFeeId: created.id }, adminUserId);
        return created.id;
      });
      return this.get(id);
    } catch (error) {
      // Lost a race with another admin setting the same fee: retry-able conflict
      if (isUniqueViolation(error))
        throw conflict(
          'GROUP_FEE_CONCURRENT_UPDATE',
          'تمّ تعديل معلوم هذه المجموعة في نفس الوقت — أعد المحاولة',
        );
      throw error;
    }
  }

  /** Stops a fee without a replacement (kept as history; existing obligations unchanged). */
  async deactivate(id: string, adminUserId: string): Promise<GroupFeeDto> {
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ isActive: boolean }[]>`
        SELECT "isActive" FROM group_fees WHERE id = ${id}::uuid FOR UPDATE`;
      if (!locked.length) throw feeNotFound();
      if (!locked[0].isActive)
        throw conflict('GROUP_FEE_INACTIVE', 'هذا المعلوم غير نشط بالفعل');
      await tx.groupFee.update({
        where: { id },
        data: {
          isActive: false,
          deactivatedAt: new Date(),
          deactivatedByUserId: adminUserId,
        },
      });
    });
    return this.get(id);
  }

  /** A class inherits the active fee of its group (default: the current academic year). */
  async applicableToClass(
    groupClassId: string,
    academicYearId?: string,
  ): Promise<ApplicableFeeDto> {
    const groupClass = await this.prisma.groupClass.findUnique({
      where: { id: groupClassId },
      select: { group: { select: { id: true, name: true } } },
    });
    if (!groupClass) throw classNotFound();
    const year = await this.prisma.academicYear.findFirst({
      where: academicYearId ? { id: academicYearId } : { isCurrent: true },
      select: { id: true, label: true },
    });
    if (!year) {
      throw academicYearId
        ? yearNotFound()
        : notFound('NO_CURRENT_ACADEMIC_YEAR', 'لا توجد سنة دراسية حالية');
    }
    const fee = await this.prisma.groupFee.findFirst({
      where: {
        groupId: groupClass.group.id,
        academicYearId: year.id,
        isActive: true,
      },
      select: feeSelect,
    });
    return {
      groupClassId,
      group: groupClass.group,
      academicYear: year,
      fee: fee ? toDto(fee) : null,
    };
  }
}
