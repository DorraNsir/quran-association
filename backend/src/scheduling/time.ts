import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

import { Weekday } from '../generated/prisma/enums.js';

/**
 * Times of day are LOCAL wall-clock times of the association (Africa/Tunis),
 * stored in PostgreSQL TIME(0) columns — no timezone, no conversion. On the
 * wire they are "HH:MM" (zero-padded 24h, so string order = time order).
 * Prisma maps TIME to a Date on 1970-01-01 UTC; these helpers convert both ways.
 */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const toDbTime = (hhmm: string) =>
  new Date(`1970-01-01T${hhmm}:00.000Z`);
export const fromDbTime = (value: Date) => value.toISOString().slice(11, 16);

export function IsTimeOfDay(
  options: { optional?: boolean; description?: string } = {},
) {
  return applyDecorators(
    (options.optional ? ApiPropertyOptional : ApiProperty)({
      type: String,
      example: '17:00',
      pattern: TIME_PATTERN.source,
      description: options.description,
    }),
    ...(options.optional ? [IsOptional()] : []),
    Matches(TIME_PATTERN, { message: 'توقيت غير صالح (الصيغة HH:MM)' }),
  );
}

/** Calendar date "YYYY-MM-DD" → weekday (dates are timezone-free calendar days). */
const WEEKDAYS: Weekday[] = [
  Weekday.SUN,
  Weekday.MON,
  Weekday.TUE,
  Weekday.WED,
  Weekday.THU,
  Weekday.FRI,
  Weekday.SAT,
];
export const weekdayOf = (date: string) =>
  WEEKDAYS[new Date(`${date}T00:00:00.000Z`).getUTCDay()];

/** Every calendar date from `from` to `to` inclusive. */
export function eachDate(from: string, to: string): string[] {
  const dates: string[] = [];
  for (
    let d = new Date(`${from}T00:00:00.000Z`);
    d <= new Date(`${to}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export const daysBetween = (from: string, to: string) =>
  Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() -
      new Date(`${from}T00:00:00Z`).getTime()) /
      86_400_000,
  );

/** Same rule everywhere: touching intervals do not overlap. */
export const overlaps = (
  a: { start: string; end: string },
  b: { start: string; end: string },
) => a.start < b.end && a.end > b.start;
