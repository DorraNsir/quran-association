import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { OptionalEmail, OptionalPhone } from '../../common/contact-fields.js';
import { PaginationMetaDto } from '../../common/pagination.js';
import { Gender, RecordStatus } from '../../generated/prisma/enums.js';
import { AccountSummaryDto, ClassRefDto } from '../teachers/teacher.dto.js';
import {
  IsDateOnly,
  PersonPatchDto,
  SearchQueryDto,
  trim,
} from '../shared.dto.js';

const OptionalCin = () =>
  applyDecorators(
    ApiPropertyOptional({
      type: String,
      nullable: true,
      description: 'Tunisian national ID — 8 digits',
    }),
    Transform(({ value }: { value: unknown }) =>
      typeof value === 'string' ? value.trim() || null : value,
    ),
    IsOptional(),
    ValidateIf((_: unknown, value: unknown) => value !== null),
    Matches(/^\d{8}$/, { message: 'رقم بطاقة التعريف يتكوّن من 8 أرقام' }),
  );

/** New Person for a student (frontend rules: gender, birth date, address required). */
export class StudentPersonDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;
  @ApiProperty({ enum: Gender, enumName: 'Gender' })
  @IsEnum(Gender)
  gender!: Gender;
  @IsDateOnly() dateOfBirth!: string;
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  address!: string;
  @OptionalPhone() phone?: string | null;
  @OptionalEmail() email?: string | null;
}

export class StudentPersonPatchDto extends PersonPatchDto {
  @IsDateOnly({ optional: true }) dateOfBirth?: string;
}

/**
 * EITHER personId OR person; the class is required (a student always starts
 * in one ACTIVE class). Contact rule: an adult needs a phone, a minor (< 18)
 * a guardian phone. Never creates an account.
 */
export class CreateStudentDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  personId?: string;
  @ApiPropertyOptional({ type: StudentPersonDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StudentPersonDto)
  person?: StudentPersonDto;
  @ApiProperty({ format: 'uuid', description: 'The ONE active class' })
  @IsUUID()
  groupClassId!: string;
  @IsDateOnly() registrationDate!: string;
  @OptionalPhone() guardianPhone?: string | null;
  @OptionalCin() cin?: string | null;
  @ApiPropertyOptional({
    enum: RecordStatus,
    enumName: 'RecordStatus',
    default: 'ACTIVE',
  })
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}

/** Class changes go through PATCH …/:id/group-class; status through PATCH …/:id/status. */
export class UpdateStudentDto {
  @ApiPropertyOptional({ type: StudentPersonPatchDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => StudentPersonPatchDto)
  person?: StudentPersonPatchDto;
  @IsDateOnly({ optional: true }) registrationDate?: string;
  @OptionalPhone() guardianPhone?: string | null;
  @OptionalCin() cin?: string | null;
}

export class AssignStudentGroupClassDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Target ACTIVE class — replaces the current one',
  })
  @IsUUID()
  groupClassId!: string;

  @IsDateOnly({
    optional: true,
    description:
      'First day in the new class (default: today, platform timezone; not in the future)',
  })
  effectiveDate?: string;
}

export class StudentListQueryDto extends SearchQueryDto {
  @ApiPropertyOptional({ enum: RecordStatus, enumName: 'RecordStatus' })
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  groupClassId?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Through the class' })
  @IsOptional()
  @IsUUID()
  groupId?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Through the class' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Supervisor of the class',
  })
  @IsOptional()
  @IsUUID()
  supervisorId?: string;
}

export class StudentPersonViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ enum: Gender, enumName: 'Gender', nullable: true })
  gender!: Gender | null;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  dateOfBirth!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) address!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) photoUrl!:
    string | null;
}

export class StudentClassDto extends ClassRefDto {
  @ApiProperty() supervisor!: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export class StudentDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: RecordStatus, enumName: 'RecordStatus' })
  status!: RecordStatus;
  @ApiProperty({ format: 'date' }) registrationDate!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) guardianPhone!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) cin!: string | null;
  @ApiProperty({ type: StudentPersonViewDto }) person!: StudentPersonViewDto;
  @ApiPropertyOptional({
    type: StudentClassDto,
    nullable: true,
    description: 'Group, branch, room and supervisor are derived from it',
  })
  groupClass!: StudentClassDto | null;
  @ApiPropertyOptional({ type: AccountSummaryDto, nullable: true })
  account!: AccountSummaryDto | null;
}

export class StudentListDto {
  @ApiProperty({ type: StudentDto, isArray: true }) data!: StudentDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/** One period of class membership: startDate ≤ day < endDate (endDate null = current). */
export class StudentEnrollmentDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'date' }) startDate!: string;
  @ApiPropertyOptional({
    type: String,
    format: 'date',
    nullable: true,
    description: 'Exclusive',
  })
  endDate!: string | null;
  @ApiProperty() isCurrent!: boolean;
  @ApiProperty({ type: ClassRefDto }) groupClass!: ClassRefDto;
}

/** PATCH /admin/students/:id/status — optional effective date (default today). */
export class SetStudentStatusDto {
  @ApiProperty({ enum: RecordStatus, enumName: 'RecordStatus' })
  @IsEnum(RecordStatus)
  status!: RecordStatus;

  @IsDateOnly({
    optional: true,
    description:
      'Day the status applies from (default: today; not future, not before registration)',
  })
  effectiveDate?: string;
}

export class StudentStatusChangeDto {
  @ApiProperty({ enum: RecordStatus, enumName: 'RecordStatus' })
  status!: RecordStatus;
  @ApiProperty({ format: 'date' }) effectiveDate!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) recordedBy!:
    string | null;
}
