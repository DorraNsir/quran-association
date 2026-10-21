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

export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'CLOSED';
export const PAYMENT_STATUSES: PaymentStatus[] = [
  'UNPAID',
  'PARTIAL',
  'PAID',
  'CLOSED',
];

/**
 * Derived, never stored: nothing settled → UNPAID, part → PARTIAL, all →
 * PAID; CLOSED once the student moved to another group (transfer).
 */
export function paymentStatus(
  required: Decimal,
  settled: Decimal,
  closed = false,
): PaymentStatus {
  if (closed) return 'CLOSED';
  if (settled.lte(0)) return 'UNPAID';
  return settled.gte(required) ? 'PAID' : 'PARTIAL';
}

/**
 * Balance of one obligation. Cash = its live payments; credit in / out =
 * amounts carried by transfers between groups (never cash); released = what
 * a transfer discharged (full replacement).
 *   required  = expected − released
 *   settled   = cash + credit in − credit out
 *   remaining = max(0, required − settled)
 *   excess    = max(0, settled − required)   («رصيد زائد»)
 */
export function obligationBalance(o: {
  expected: Decimal;
  cash: Decimal;
  creditIn?: Decimal;
  creditOut?: Decimal;
  released?: Decimal;
  closed?: boolean;
}) {
  const required = o.expected.minus(o.released ?? ZERO);
  const creditIn = o.creditIn ?? ZERO;
  const creditOut = o.creditOut ?? ZERO;
  const settled = o.cash.plus(creditIn).minus(creditOut);
  return {
    expectedAmount: money(o.expected),
    requiredAmount: money(required),
    totalPaid: money(o.cash),
    creditIn: money(creditIn),
    creditOut: money(creditOut),
    releasedAmount: money(o.released),
    settledAmount: money(settled),
    remainingAmount: money(Prisma.Decimal.max(required.minus(settled), ZERO)),
    excessAmount: money(Prisma.Decimal.max(settled.minus(required), ZERO)),
    status: paymentStatus(required, settled, o.closed),
  };
}

/** Balance of an obligation without transfers (cash payments only). */
export function balance(expected: Decimal, paid: Decimal) {
  const { expectedAmount, totalPaid, remainingAmount, status } =
    obligationBalance({ expected, cash: paid });
  return { expectedAmount, totalPaid, remainingAmount, status };
}
