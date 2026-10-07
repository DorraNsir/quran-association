import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Password policy: length only (8–128) — no arbitrary composition rules. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** One policy for every password a person or an admin sets (self change, creation, reset). */
export function IsPolicyPassword(description?: string) {
  return applyDecorators(
    ApiProperty({
      format: 'password',
      minLength: PASSWORD_MIN_LENGTH,
      maxLength: PASSWORD_MAX_LENGTH,
      description,
    }),
    IsString(),
    MinLength(PASSWORD_MIN_LENGTH, {
      message: 'كلمة المرور قصيرة جدًا (8 أحرف على الأقل)',
    }),
    MaxLength(PASSWORD_MAX_LENGTH, {
      message: 'كلمة المرور طويلة جدًا (128 حرفًا على الأكثر)',
    }),
  );
}
