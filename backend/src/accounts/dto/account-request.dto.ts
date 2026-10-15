import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { IsPolicyPassword } from '../../auth/password-policy.js';
import {
  OptionalEmail,
  OptionalPhone,
  OptionalText,
} from '../../common/contact-fields.js';
import { PaginationQueryDto } from '../../common/pagination.js';
import {
  toNormalizedUsername,
  USERNAME_PATTERN,
  USERNAME_RULE_MESSAGE,
} from '../../common/username.js';
import { Gender, Role } from '../../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

function UsernameField(required: boolean) {
  return applyDecorators(
    (required ? ApiProperty : ApiPropertyOptional)({
      example: 'ahmed.bensalah',
      description:
        'Stored trimmed + lowercase (case-insensitive). ' +
        USERNAME_RULE_MESSAGE,
    }),
    Transform(toNormalizedUsername),
    ...(required ? [] : [IsOptional()]),
    IsString(),
    Matches(USERNAME_PATTERN, { message: USERNAME_RULE_MESSAGE }),
  );
}

function RolesField() {
  return applyDecorators(
    ApiProperty({
      enum: Role,
      enumName: 'Role',
      isArray: true,
      example: ['ADMIN', 'TEACHER'],
      description: 'At least one; roles are cumulative',
    }),
    ArrayMinSize(1, { message: 'يجب تحديد دور واحد على الأقل' }),
    ArrayUnique(),
    IsEnum(Role, { each: true }),
  );
}

/** New Person created together with the account (when no personId is given). */
export class NewPersonDto {
  @ApiProperty({ example: 'أحمد' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @ApiProperty({ example: 'بن صالح' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @ApiPropertyOptional({ enum: Gender, enumName: 'Gender' })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @OptionalPhone() phone?: string | null;
  @OptionalEmail() email?: string | null;
  @OptionalText(200) address?: string | null;
}

/**
 * POST /api/admin/accounts — EITHER personId (an existing Person, e.g. a
 * teacher or student profile created by the academic module) OR person (a
 * new Person). The account never creates Teacher/Student domain profiles.
 */
export class CreateAccountDto {
  @UsernameField(true)
  username!: string;

  @IsPolicyPassword(
    'Temporary password — the user must change it at first login',
  )
  temporaryPassword!: string;

  @RolesField()
  roles!: Role[];

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Existing Person without an account',
  })
  @IsOptional()
  @IsUUID()
  personId?: string;

  @ApiPropertyOptional({ type: NewPersonDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NewPersonDto)
  person?: NewPersonDto;
}

/** Admin edit of the canonical Person fields (photo: later, with file storage). */
export class UpdatePersonDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional({ enum: Gender, enumName: 'Gender' })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @OptionalPhone() phone?: string | null;
  @OptionalEmail() email?: string | null;
  @OptionalText(200) address?: string | null;
}

/** PATCH /api/admin/accounts/:id — username and/or Person details (atomic). */
export class UpdateAccountDto {
  @UsernameField(false)
  username?: string;

  @ApiPropertyOptional({ type: UpdatePersonDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdatePersonDto)
  person?: UpdatePersonDto;
}

/** PUT /api/admin/accounts/:id/roles — the complete new role set. */
export class SetRolesDto {
  @RolesField()
  roles!: Role[];
}

export class ResetPasswordDto {
  @IsPolicyPassword('New temporary password (mustChangePassword becomes true)')
  temporaryPassword!: string;
}

export class AccountListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Username, first name or last name (contains, case-insensitive)',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: Role, enumName: 'Role' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  isActive?: boolean;
}
