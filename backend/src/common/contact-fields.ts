import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * Optional, clearable contact fields of a Person (same rules as the frontend:
 * Tunisian phone = 8 digits starting with 2, 3, 4, 5, 7 or 9). In a PATCH,
 * omit a field to keep it, send null (or "") to clear it.
 */
const emptyToNull = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

export function OptionalPhone() {
  return applyDecorators(
    ApiPropertyOptional({
      type: String,
      nullable: true,
      example: '22345678',
      description: '8 أرقام (يُقبل 22 345 678)',
    }),
    Transform(({ value }: { value: unknown }) => {
      const v = emptyToNull({ value });
      return typeof v === 'string' ? v.replace(/[\s.-]/g, '') : v;
    }),
    IsOptional(),
    ValidateIf((_, value) => value !== null),
    Matches(/^[234579]\d{7}$/, {
      message: 'رقم هاتف غير صالح — 8 أرقام، مثال: 22 345 678',
    }),
  );
}

export function OptionalEmail() {
  return applyDecorators(
    ApiPropertyOptional({ type: String, nullable: true, format: 'email' }),
    Transform(({ value }: { value: unknown }) => {
      const v = emptyToNull({ value });
      return typeof v === 'string' ? v.toLowerCase() : v;
    }),
    IsOptional(),
    ValidateIf((_, value) => value !== null),
    IsEmail({}, { message: 'بريد إلكتروني غير صالح' }),
    MaxLength(254),
  );
}

export function OptionalText(maxLength: number, description?: string) {
  return applyDecorators(
    ApiPropertyOptional({
      type: String,
      nullable: true,
      maxLength,
      description,
    }),
    Transform(emptyToNull),
    IsOptional(),
    ValidateIf((_, value) => value !== null),
    IsString(),
    MaxLength(maxLength),
  );
}
