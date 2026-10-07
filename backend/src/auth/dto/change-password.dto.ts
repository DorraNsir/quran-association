import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Password policy: length only (8–128) — no arbitrary composition rules. */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export class ChangePasswordDto {
  @ApiProperty({ format: 'password' })
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword!: string;

  @ApiProperty({
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: 'كلمة المرور الجديدة قصيرة جدًا (8 أحرف على الأقل)',
  })
  @MaxLength(PASSWORD_MAX_LENGTH, {
    message: 'كلمة المرور الجديدة طويلة جدًا (128 حرفًا على الأكثر)',
  })
  newPassword!: string;
}
