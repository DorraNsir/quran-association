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

/**
 * A wall-clock time "YYYY-MM-DDTHH:mm" with NO offset: it is read in the
 * platform timezone (Africa/Tunis) and converted to an instant explicitly
 * (platform-clock.ts → localDateTimeToInstant).
 */
export function IsLocalDateTime(
  options: { optional?: boolean; description?: string } = {},
) {
  return applyDecorators(
    (options.optional ? ApiPropertyOptional : ApiProperty)({
      type: String,
      example: '2026-10-20T08:30',
      description: options.description,
    }),
    ...(options.optional ? [IsOptional()] : []),
    Matches(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, {
      message: 'وقت غير صالح (الصيغة YYYY-MM-DDTHH:mm بتوقيت تونس)',
    }),
    Validate(RealLocalDateTime),
  );
}

@ValidatorConstraint({ name: 'realLocalDateTime' })
class RealLocalDateTime implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return (
      typeof value === 'string' &&
      new RealCalendarDate().validate(value.slice(0, 10))
    );
  }
  defaultMessage() {
    return 'تاريخ غير صالح (الصيغة YYYY-MM-DDTHH:mm)';
  }
}

/** An instant as wall-clock "YYYY-MM-DDTHH:mm" in an IANA timezone. */
export function toLocalDateTime(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
