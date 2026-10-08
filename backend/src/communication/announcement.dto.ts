import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { SearchQueryDto, trim } from '../academic/shared.dto.js';
import { IsDateOnly } from '../common/dates.js';
import { PaginationMetaDto } from '../common/pagination.js';
import {
  AnnouncementAudience,
  AnnouncementStatus,
} from '../generated/prisma/enums.js';
import { ClassTargetDto, IdList, Title } from './resource.dto.js';

const Content = () =>
  applyDecorators(
    ApiProperty({ maxLength: 10000, description: 'Plain text (no HTML)' }),
    Transform(trim),
    IsString(),
    MinLength(1, { message: 'نص الإعلان مطلوب' }),
    MaxLength(10000),
  );

const Dates = {
  publishedAt: () =>
    IsDateOnly({
      optional: true,
      description:
        'Visible from this day once published (default: today; a later day = scheduled)',
    }),
  expiresAt: () =>
    IsDateOnly({
      optional: true,
      description: 'Hidden after this day (≥ publishedAt); null clears it',
    }),
};

/** Teacher form: always SPECIFIC_GROUP_CLASSES, toward current classes. Created as DRAFT. */
export class TeacherAnnouncementDto {
  @Title() title!: string;
  @Content() content!: string;
  @IdList('Classes the teacher is currently assigned to', true)
  groupClassIds!: string[];
  @Dates.publishedAt() publishedAt?: string;
  @Dates.expiresAt() expiresAt?: string | null;
}

export class UpdateTeacherAnnouncementDto extends PartialType(
  TeacherAnnouncementDto,
) {}

/** Admin form. Created as DRAFT; publication is an explicit action. */
export class AdminAnnouncementDto {
  @Title() title!: string;
  @Content() content!: string;
  @ApiProperty({
    enum: AnnouncementAudience,
    enumName: 'AnnouncementAudience',
    description:
      'EVERYONE / TEACHERS / STUDENTS (no targets) · SPECIFIC_GROUP_CLASSES (groupClassIds) · SPECIFIC_BRANCHES (branchIds)',
  })
  @IsEnum(AnnouncementAudience)
  audience!: AnnouncementAudience;
  @IdList('SPECIFIC_GROUP_CLASSES only') groupClassIds?: string[];
  @IdList('SPECIFIC_BRANCHES only') branchIds?: string[];
  @Dates.publishedAt() publishedAt?: string;
  @Dates.expiresAt() expiresAt?: string | null;
}

export class UpdateAdminAnnouncementDto extends PartialType(
  AdminAnnouncementDto,
) {}

export class AnnouncementListQueryDto extends SearchQueryDto {
  @ApiPropertyOptional({
    enum: AnnouncementStatus,
    enumName: 'AnnouncementStatus',
  })
  @IsOptional()
  @IsEnum(AnnouncementStatus)
  status?: AnnouncementStatus;
  @ApiPropertyOptional({
    enum: AnnouncementAudience,
    enumName: 'AnnouncementAudience',
  })
  @IsOptional()
  @IsEnum(AnnouncementAudience)
  audience?: AnnouncementAudience;
  @ApiPropertyOptional({ format: 'uuid', description: 'Targets this class' })
  @IsOptional()
  @IsUUID()
  groupClassId?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Targets this branch' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
  @IsDateOnly({ optional: true, description: 'publishedAt on/after' })
  from?: string;
  @IsDateOnly({ optional: true, description: 'publishedAt on/before' })
  to?: string;
  @ApiPropertyOptional({ description: 'Only announcements I wrote' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  mine?: boolean;
}

export const ANNOUNCEMENT_STATES = [
  'DRAFT',
  'SCHEDULED',
  'ACTIVE',
  'EXPIRED',
  'ARCHIVED',
] as const;
export type AnnouncementState = (typeof ANNOUNCEMENT_STATES)[number];

class AuthorDto {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
}

class BranchRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class AnnouncementDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() content!: string;
  @ApiProperty({ enum: AnnouncementAudience, enumName: 'AnnouncementAudience' })
  audience!: AnnouncementAudience;
  @ApiProperty({ enum: AnnouncementStatus, enumName: 'AnnouncementStatus' })
  status!: AnnouncementStatus;
  @ApiProperty({
    enum: ANNOUNCEMENT_STATES,
    description: 'Derived for today: only ACTIVE reaches readers',
  })
  state!: AnnouncementState;
  @ApiProperty({ format: 'date' }) publishedAt!: string;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  expiresAt!: string | null;
  @ApiPropertyOptional({ type: Date, nullable: true })
  firstPublishedAt!: Date | null;
  @ApiPropertyOptional({ type: Date, nullable: true }) archivedAt!: Date | null;
  @ApiProperty({ type: ClassTargetDto, isArray: true })
  groupClasses!: ClassTargetDto[];
  @ApiProperty({ type: BranchRefDto, isArray: true }) branches!: BranchRefDto[];
  @ApiProperty({ type: AuthorDto }) publishedBy!: AuthorDto;
  @ApiProperty({
    description: 'The caller may edit / publish / archive / delete it',
  })
  canManage!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class AnnouncementListDto {
  @ApiProperty({ type: AnnouncementDto, isArray: true })
  data!: AnnouncementDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class PublishResultDto {
  @ApiProperty({ type: AnnouncementDto }) announcement!: AnnouncementDto;
  @ApiProperty({ description: 'Accounts notified by this publication' })
  notifiedCount!: number;
}
