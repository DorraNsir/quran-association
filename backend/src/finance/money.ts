import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

import { Prisma } from '../generated/prisma/client.js';

/**
 * Money = TND with millimes precision (DECIMAL(10,3)). Amounts travel as
 * decimal STRINGS ("60.000") in both directions and are computed with
 * Prisma.Decimal / SQL numeric — never with JavaScript floats.
 */
export const CURRENCY = 'TND';
export type Decimal = Prisma.Decimal;
export const ZERO = new Prisma.Decimal(0);

/** "60", "60.5", "60.500" (≤ 7 integer digits, ≤ 3 decimals, never zero). */
const MONEY_PATTERN = /^(?!0+(?:\.0{1,3})?$)\d{1,7}(?:\.\d{1,3})?$/;

/** A strictly positive amount; a JSON number is accepted and read through its decimal text. */
export function IsMoney(description?: string) {
  return applyDecorators(
    ApiProperty({
      type: String,
      example: '60.000',
      description: description ?? 'TND, up to 3 decimals (millimes)',
    }),
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'number' && Number.isFinite(value)
        ? String(value)
        : typeof value === 'string'
          ? value.trim()
          : value,
    ),
    IsString({ message: 'المبلغ مطلوب' }),
    Matches(MONEY_PATTERN, {
      message: 'مبلغ غير صالح — رقم أكبر من صفر بثلاثة أرقام عشرية على الأكثر',
    }),
  );
}

export const toDecimal = (value: string | Decimal) => new Prisma.Decimal(value);

/** Decimal → "60.000". */
export const money = (value: Decimal | string | null | undefined) =>
  new Prisma.Decimal(value ?? 0).toFixed(3);

export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';
export const PAYMENT_STATUSES: PaymentStatus[] = ['UNPAID', 'PARTIAL', 'PAID'];

/**
 * Derived, never stored: nothing paid → UNPAID, part → PARTIAL, all → PAID.
 * Obligations are always > 0 (DB CHECK), so there is no zero-amount case.
 */
export function paymentStatus(expected: Decimal, paid: Decimal): PaymentStatus {
  if (paid.lte(0)) return 'UNPAID';
  return paid.gte(expected) ? 'PAID' : 'PARTIAL';
}

/** Balance of one obligation from its live (non-voided) payments. */
export function balance(expected: Decimal, paid: Decimal) {
  const remaining = Prisma.Decimal.max(expected.minus(paid), ZERO);
  return {
    expectedAmount: money(expected),
    totalPaid: money(paid),
    remainingAmount: money(remaining),
    status: paymentStatus(expected, paid),
  };
}
