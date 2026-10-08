import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  Matches,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

/** Calendar dates travel as "YYYY-MM-DD" and are stored in DATE columns (UTC midnight). */
export const toDbDate = (value: string) => new Date(`${value}T00:00:00.000Z`);
export const fromDbDate = (value: Date) => value.toISOString().slice(0, 10);
/** Calendar date "YYYY-MM-DD" of now in an IANA timezone (e.g. Africa/Tunis). */
export const todayIn = (timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export const fromDbDateOrNull = (value: Date | null) =>
  value ? fromDbDate(value) : null;

@ValidatorConstraint({ name: 'realCalendarDate' })
class RealCalendarDate implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return (
      typeof value === 'string' &&
      !Number.isNaN(toDbDate(value).getTime()) &&
      fromDbDate(toDbDate(value)) === value
    );
  }
  defaultMessage() {
    return 'تاريخ غير صالح (الصيغة YYYY-MM-DD)';
  }
}

/** A real calendar date "YYYY-MM-DD" (rejects 2026-02-30). */
export function IsDateOnly(
  options: { optional?: boolean; description?: string } = {},
) {
  return applyDecorators(
    (options.optional ? ApiPropertyOptional : ApiProperty)({
      type: String,
      format: 'date',
      example: '2026-09-14',
      description: options.description,
    }),
    ...(options.optional ? [IsOptional()] : []),
    Matches(/^\d{4}-\d{2}-\d{2}$/, {
      message: 'تاريخ غير صالح (الصيغة YYYY-MM-DD)',
    }),
    Validate(RealCalendarDate),
  );
}
