import { applyDecorators } from '@nestjs/common';
import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { SearchQueryDto, trim } from '../academic/shared.dto.js';
import { IsDateOnly, IsLocalDateTime } from '../common/dates.js';
import { PaginationMetaDto } from '../common/pagination.js';
import {
  AnnouncementAudience,
  AnnouncementStatus,
} from '../generated/prisma/enums.js';
import { ClassTargetDto, IdList, Title } from './resource.dto.js';

/**
 * How a new announcement is published:
 *  - PUBLISH_NOW (default): published and notified immediately.
 *  - SCHEDULE (admins): publishes itself at `scheduledAt` (Africa/Tunis time);
 *    recipients are resolved and notified at that moment.
 *  - DRAFT: saved only, nothing visible, nobody notified.
 */
export const PUBLICATION_MODES = ['PUBLISH_NOW', 'SCHEDULE', 'DRAFT'] as const;
export type PublicationMode = (typeof PUBLICATION_MODES)[number];

const Content = () =>
  applyDecorators(
    ApiProperty({ maxLength: 10000, description: 'Plain text (no HTML)' }),
    Transform(trim),
    IsString(),
    MinLength(1, { message: 'نص الإعلان مطلوب' }),
    MaxLength(10000),
  );

const ExpiresAt = () =>
  IsDateOnly({
    optional: true,
    description:
      'Last day it is shown (inclusive, Africa/Tunis calendar); null clears it',
  });

const ScheduledAt = (optional: boolean) =>
  IsLocalDateTime({
    optional,
    description:
      'Africa/Tunis wall-clock time "YYYY-MM-DDTHH:mm" (no offset), in the future; converted to an instant by the server',
  });

/** Teacher form: always SPECIFIC_GROUP_CLASSES, toward current classes; no scheduling. */
export class TeacherAnnouncementDto {
  @Title() title!: string;
  @Content() content!: string;
  @IdList('Classes the teacher is currently assigned to', true)
  groupClassIds!: string[];
  @ExpiresAt() expiresAt?: string | null;

  @ApiPropertyOptional({
    enum: ['PUBLISH_NOW', 'DRAFT'],
    default: 'PUBLISH_NOW',
    description: 'Scheduling is admin-only for now',
  })
  @IsOptional()
  @IsIn(['PUBLISH_NOW', 'DRAFT'])
  mode?: Exclude<PublicationMode, 'SCHEDULE'>;
}

export class UpdateTeacherAnnouncementDto extends PartialType(
  OmitType(TeacherAnnouncementDto, ['mode'] as const),
) {}

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
  @ExpiresAt() expiresAt?: string | null;

  @ApiPropertyOptional({
    enum: PUBLICATION_MODES,
    default: 'PUBLISH_NOW',
    description:
      'PUBLISH_NOW (default) · SCHEDULE (requires scheduledAt) · DRAFT',
  })
  @IsOptional()
  @IsIn(PUBLICATION_MODES)
  mode?: PublicationMode;

  @ScheduledAt(true) scheduledAt?: string;
}

/** Content and audience of a DRAFT or SCHEDULED announcement (the schedule itself: /schedule). */
export class UpdateAdminAnnouncementDto extends PartialType(
  OmitType(AdminAnnouncementDto, ['mode', 'scheduledAt'] as const),
) {}

export class ScheduleAnnouncementDto {
  @ScheduledAt(false) scheduledAt!: string;
}

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
  @IsDateOnly({
    optional: true,
    description: 'Published on/after this day (Africa/Tunis)',
  })
  from?: string;
  @IsDateOnly({
    optional: true,
    description: 'Published on/before this day (Africa/Tunis)',
  })
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
  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description: 'Pending (SCHEDULED) or past scheduled publication instant',
  })
  scheduledFor!: Date | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '2026-10-20T08:30',
    description: 'scheduledFor as Africa/Tunis wall-clock time',
  })
  scheduledForLocal!: string | null;
  @ApiPropertyOptional({
    type: Date,
    nullable: true,
    description: 'Actual publication instant (null before publication)',
  })
  publishedAt!: Date | null;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  expiresAt!: string | null;
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
  @ApiProperty({
    description:
      'Accounts notified by this request (0 for a draft or a scheduled announcement: they are notified when it publishes)',
  })
  notifiedCount!: number;
}
