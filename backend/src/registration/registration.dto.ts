import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  OptionalEmail,
  OptionalPhone,
  OptionalText,
} from '../common/contact-fields.js';
import { IsDateOnly } from '../common/dates.js';
import { PaginationMetaDto } from '../common/pagination.js';
import { SearchQueryDto, trim } from '../academic/shared.dto.js';
import {
  Gender,
  RegistrationRequestSource,
  RegistrationRequestStatus,
} from '../generated/prisma/enums.js';

const Name = () =>
  applyDecorators(
    ApiProperty({ maxLength: 80 }),
    Transform(trim),
    IsString(),
    MinLength(1),
    MaxLength(80),
  );

/**
 * The applicant's form — identical for the public website and for an admin
 * entering a request. Never contains status, source, reviewer or student
 * fields: those are set by the server only.
 */
export class RegistrationFieldsDto {
  @Name() firstName!: string;
  @Name() lastName!: string;

  @ApiPropertyOptional({ enum: Gender, enumName: 'Gender' })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender | null;

  @IsDateOnly({
    optional: true,
    description: 'Birth date — or give `age` instead (exactly one of the two)',
  })
  birthDate?: string | null;

  @ApiPropertyOptional({ minimum: 3, maximum: 99 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(99)
  age?: number | null;

  @ApiProperty({
    example: '22345678',
    description: 'Contact phone — 8 digits (22 345 678 accepted)',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s.-]/g, '') : value,
  )
  @IsString({ message: 'رقم الهاتف مطلوب' })
  @Matches(/^[234579]\d{7}$/, {
    message: 'رقم هاتف غير صالح — 8 أرقام، مثال: 22 345 678',
  })
  phone!: string;

  /** Required when the applicant is a minor (< 18). */
  @OptionalPhone() guardianPhone?: string | null;
  @OptionalText(200) address?: string | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasStudiedQuranBefore?: boolean;

  @OptionalText(300) previousExperience?: string | null;
  @OptionalText(1000) notes?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description:
      'A group the applicant is interested in (never a class assignment)',
  })
  @IsOptional()
  @IsUUID()
  interestedGroupId?: string | null;

  @OptionalText(120) interestedProgramLabel?: string | null;
}

/** Admin edit of a PENDING request: any form field; send null to clear an optional one. */
export class UpdateRegistrationRequestDto extends PartialType(
  RegistrationFieldsDto,
) {}

export class PublicRegistrationAckDto {
  @ApiProperty({
    example: 'تم استلام طلب التسجيل، وستتواصل معك الإدارة قريبًا',
  })
  message!: string;
  @ApiProperty() receivedAt!: Date;
}

/** Corrections applied to the applicant's data when the Person is created on acceptance. */
export class AcceptPersonDto {
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
  @IsDateOnly({ optional: true }) dateOfBirth?: string;
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  address?: string;
  @OptionalPhone() phone?: string | null;
  @OptionalEmail() email?: string | null;
}

export class AcceptRegistrationRequestDto {
  @ApiProperty({
    format: 'uuid',
    description: 'An ACTIVE class (active group and branch)',
  })
  @IsUUID()
  groupClassId!: string;

  @IsDateOnly({
    optional: true,
    description: 'Default: today (platform timezone); not in the future',
  })
  registrationDate?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Explicitly link an EXISTING person (who has no student profile) instead of creating one',
  })
  @IsOptional()
  @IsUUID()
  personId?: string;

  @ApiPropertyOptional({
    type: AcceptPersonDto,
    description:
      'New person only: corrections/additions to the request data (gender, birth date and address are required for a student)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AcceptPersonDto)
  person?: AcceptPersonDto;

  @OptionalPhone() guardianPhone?: string | null;

  @ApiPropertyOptional({ description: 'Tunisian national ID — 8 digits' })
  @IsOptional()
  @Matches(/^\d{8}$/, { message: 'رقم بطاقة التعريف يتكوّن من 8 أرقام' })
  cin?: string;

  @ApiPropertyOptional({
    description:
      'Create a NEW person even though people with the same name or phone exist (after checking POSSIBLE_DUPLICATE_PERSON candidates)',
  })
  @IsOptional()
  @IsBoolean()
  confirmNewPerson?: boolean;
}

export class RejectRegistrationRequestDto {
  @OptionalText(500, 'Optional reason (kept with the request)')
  reason?: string | null;
}

export class RegistrationRequestListQueryDto extends SearchQueryDto {
  @ApiPropertyOptional({
    enum: RegistrationRequestStatus,
    enumName: 'RegistrationRequestStatus',
  })
  @IsOptional()
  @IsEnum(RegistrationRequestStatus)
  status?: RegistrationRequestStatus;

  @ApiPropertyOptional({
    enum: RegistrationRequestSource,
    enumName: 'RegistrationRequestSource',
  })
  @IsOptional()
  @IsEnum(RegistrationRequestSource)
  source?: RegistrationRequestSource;

  @ApiPropertyOptional({ format: 'uuid', description: 'Interested group' })
  @IsOptional()
  @IsUUID()
  interestedGroupId?: string;

  @IsDateOnly({
    optional: true,
    description: 'Submitted on/after this day (platform timezone)',
  })
  from?: string;
  @IsDateOnly({
    optional: true,
    description: 'Submitted on/before this day (platform timezone)',
  })
  to?: string;
}

class UserRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
}

class GroupRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

class CreatedStudentRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
}

export class RegistrationRequestDto {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ enum: Gender, enumName: 'Gender', nullable: true })
  gender!: Gender | null;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  birthDate!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) age!: number | null;
  @ApiProperty() phone!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  guardianPhone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) address!:
    string | null;
  @ApiProperty() hasStudiedQuranBefore!: boolean;
  @ApiPropertyOptional({ type: String, nullable: true })
  previousExperience!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) notes!: string | null;
  @ApiProperty({
    enum: RegistrationRequestSource,
    enumName: 'RegistrationRequestSource',
  })
  source!: RegistrationRequestSource;
  @ApiProperty({
    enum: RegistrationRequestStatus,
    enumName: 'RegistrationRequestStatus',
    description: 'PENDING → ACCEPTED | REFUSED (final)',
  })
  status!: RegistrationRequestStatus;
  @ApiProperty() submittedAt!: Date;
  @ApiPropertyOptional({ type: UserRefDto, nullable: true })
  createdBy!: UserRefDto | null;
  @ApiPropertyOptional({ type: Date, nullable: true }) reviewedAt!: Date | null;
  @ApiPropertyOptional({ type: UserRefDto, nullable: true })
  reviewedBy!: UserRefDto | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  rejectionReason!: string | null;
  @ApiPropertyOptional({ type: CreatedStudentRefDto, nullable: true })
  createdStudent!: CreatedStudentRefDto | null;
  @ApiPropertyOptional({ type: GroupRefDto, nullable: true })
  interestedGroup!: GroupRefDto | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  interestedProgramLabel!: string | null;
}

export class RegistrationRequestListDto {
  @ApiProperty({ type: RegistrationRequestDto, isArray: true })
  data!: RegistrationRequestDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class AcceptRegistrationResultDto {
  @ApiProperty({ type: RegistrationRequestDto })
  request!: RegistrationRequestDto;
  @ApiProperty({ description: 'The created (or linked) student id' })
  studentId!: string;
  @ApiProperty({ description: 'true when an existing person was linked' })
  linkedExistingPerson!: boolean;
}
