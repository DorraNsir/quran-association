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
  ValidateNested,
} from 'class-validator';

import { OptionalEmail, OptionalText } from '../../common/contact-fields.js';
import { PaginationMetaDto } from '../../common/pagination.js';
import {
  ActivationStatus,
  Gender,
  RecordStatus,
  Role,
} from '../../generated/prisma/enums.js';
import {
  IsDateOnly,
  PersonPatchDto,
  SearchQueryDto,
  trim,
} from '../shared.dto.js';

/** New Person for a teacher (frontend rules: gender and phone required). */
export class TeacherPersonDto {
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
  @ApiProperty({ example: '22345678' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.replace(/[\s.-]/g, '') : value,
  )
  @IsString()
  @Matches(/^[234579]\d{7}$/, {
    message: 'رقم هاتف غير صالح — 8 أرقام، مثال: 22 345 678',
  })
  phone!: string;
  @OptionalEmail() email?: string | null;
  @OptionalText(200) address?: string | null;
}

/** EITHER personId (existing Person without a teacher profile) OR person. Never creates an account. */
export class CreateTeacherDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  personId?: string;
  @ApiPropertyOptional({ type: TeacherPersonDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TeacherPersonDto)
  person?: TeacherPersonDto;
  @IsDateOnly() joinedAt!: string;
  @OptionalText(200, 'e.g. a Quran ijaza') qualification?: string | null;
  @ApiPropertyOptional({
    enum: ActivationStatus,
    enumName: 'ActivationStatus',
    default: 'ACTIVE',
  })
  @IsOptional()
  @IsEnum(ActivationStatus)
  status?: ActivationStatus;
}

/** Canonical Person fields are updated on Person; status via PATCH …/status. */
export class UpdateTeacherDto {
  @ApiPropertyOptional({ type: PersonPatchDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PersonPatchDto)
  person?: PersonPatchDto;
  @IsDateOnly({ optional: true }) joinedAt?: string;
  @OptionalText(200) qualification?: string | null;
}

export class TeacherListQueryDto extends SearchQueryDto {
  @ApiPropertyOptional({ enum: ActivationStatus, enumName: 'ActivationStatus' })
  @IsOptional()
  @IsEnum(ActivationStatus)
  status?: ActivationStatus;
}

export class TeacherPersonViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ enum: Gender, enumName: 'Gender', nullable: true })
  gender!: Gender | null;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) address!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) photoUrl!:
    string | null;
}

export class AccountSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() username!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ enum: Role, enumName: 'Role', isArray: true }) roles!: Role[];
}

export class ClassRefDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: RecordStatus, enumName: 'RecordStatus' })
  status!: RecordStatus;
  @ApiProperty() group!: { id: string; name: string };
  @ApiProperty() branch!: { id: string; name: string };
  @ApiProperty({
    description:
      'Distinct rooms of its weekly slots (each slot has its own room)',
  })
  rooms!: { id: string; name: string }[];
}

export class TeacherDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ActivationStatus, enumName: 'ActivationStatus' })
  status!: ActivationStatus;
  @ApiProperty({ format: 'date' }) joinedAt!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) qualification!:
    string | null;
  @ApiProperty({ type: TeacherPersonViewDto }) person!: TeacherPersonViewDto;
  @ApiPropertyOptional({
    type: AccountSummaryDto,
    nullable: true,
    description: 'Login account of the same Person (Part 10.3)',
  })
  account!: AccountSummaryDto | null;
  @ApiProperty({ description: 'Non-archived classes supervised' })
  supervisedClassesCount!: number;
  @ApiProperty({ description: 'Non-archived classes assisted' })
  assistedClassesCount!: number;
}

/** Supervisor and assistant assignments are reported separately (never conflated). */
export class TeacherDetailDto extends TeacherDto {
  @ApiProperty({ type: ClassRefDto, isArray: true })
  supervisedClasses!: ClassRefDto[];
  @ApiProperty({ type: ClassRefDto, isArray: true })
  assistedClasses!: ClassRefDto[];
}

export class TeacherListDto {
  @ApiProperty({ type: TeacherDto, isArray: true }) data!: TeacherDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}
