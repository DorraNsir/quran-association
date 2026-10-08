import { Injectable } from '@nestjs/common';

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
  SetGroupFeeDto,
} from './finance.dto.js';
import { CURRENCY, money, toDecimal } from './money.js';

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

function toDto(f: FeeRow): GroupFeeDto {
  const { _count, amount, startDate, endDate, ...rest } = f;
  return {
    ...rest,
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
    return { data: rows.map(toDto) };
  }

  async get(id: string): Promise<GroupFeeDto> {
    const fee = await this.prisma.groupFee.findUnique({
      where: { id },
      select: feeSelect,
    });
    if (!fee) throw feeNotFound();
    return toDto(fee);
  }

  /**
   * Sets THE fee of a group for a year: creates a new active version and
   * deactivates the previous one (if any), atomically under a group lock.
   */
  async setForGroup(
    groupId: string,
    dto: SetGroupFeeDto,
    adminUserId: string,
  ): Promise<GroupFeeDto> {
    const periods = dto.numberOfPeriods ?? 1;
    if (dto.billingType === BillingType.YEARLY && periods !== 1) {
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
        await tx.groupFee.updateMany({
          where: {
            groupId,
            academicYearId: dto.academicYearId,
            isActive: true,
          },
          data: {
            isActive: false,
            deactivatedAt: new Date(),
            deactivatedByUserId: adminUserId,
          },
        });
        const created = await tx.groupFee.create({
          data: {
            groupId,
            academicYearId: dto.academicYearId,
            label: dto.label,
            billingType: dto.billingType,
            amount: toDecimal(dto.amount),
            numberOfPeriods: periods,
            startDate: dto.startDate ? toDbDate(dto.startDate) : null,
            endDate: dto.endDate ? toDbDate(dto.endDate) : null,
            createdByUserId: adminUserId,
          },
          select: { id: true },
        });
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
