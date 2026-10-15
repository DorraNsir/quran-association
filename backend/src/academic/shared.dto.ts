import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  OptionalEmail,
  OptionalPhone,
  OptionalText,
} from '../common/contact-fields.js';
import { IsDateOnly } from '../common/dates.js';
import { PaginationQueryDto } from '../common/pagination.js';
import {
  ActivationStatus,
  Gender,
  RecordStatus,
} from '../generated/prisma/enums.js';

export const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** PATCH …/:id/status for branches, rooms, teachers (on/off only). */
export class SetActivationStatusDto {
  @ApiProperty({ enum: ActivationStatus, enumName: 'ActivationStatus' })
  @IsEnum(ActivationStatus)
  status!: ActivationStatus;
}

/** PATCH …/:id/status for groups, classes, students (archivable). */
export class SetRecordStatusDto {
  @ApiProperty({ enum: RecordStatus, enumName: 'RecordStatus' })
  @IsEnum(RecordStatus)
  status!: RecordStatus;
}

export class SearchQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Contains, case-insensitive' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;
}

/** Canonical Person fields shared by teacher/student forms (all optional for PATCH). */
export class PersonPatchDto {
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

export class PersonSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) photoUrl!:
    string | null;
}

/** Re-exported so DTO files share one import site. */
export { IsDateOnly };
