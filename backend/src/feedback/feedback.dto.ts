import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { trim } from '../academic/shared.dto.js';
import { PaginationMetaDto, PaginationQueryDto } from '../common/pagination.js';
import {
  FeedbackCategory,
  FeedbackPlatform,
  FeedbackStatus,
  Role,
} from '../generated/prisma/enums.js';

export const FEEDBACK_TITLE_MAX = 120;
export const FEEDBACK_TEXT_MAX = 3000;

/** «/teacher/sessions?x=1#y» → «/teacher/sessions» (the route only: never a query string). */
const routeOnly = ({ value }: { value: unknown }) =>
  typeof value === 'string'
    ? value.split(/[?#]/)[0]!.trim() || undefined
    : value;

// ───────────────────────── teacher / student ─────────────────────────

/**
 * «إرسال ملاحظة». The sender (account, role), the date and the status are never sent: they come
 * from the authenticated account and the server (unknown fields are refused).
 */
export class CreateFeedbackDto {
  @ApiProperty({ enum: FeedbackCategory, enumName: 'FeedbackCategory' })
  @IsEnum(FeedbackCategory, { message: 'اختر نوع الملاحظة' })
  category!: FeedbackCategory;

  @ApiProperty({ maxLength: FEEDBACK_TITLE_MAX })
  @Transform(trim)
  @IsString({ message: 'العنوان مطلوب' })
  @MinLength(1, { message: 'العنوان مطلوب' })
  @MaxLength(FEEDBACK_TITLE_MAX, {
    message: `العنوان طويل جدًا (${FEEDBACK_TITLE_MAX} حرفًا على الأكثر)`,
  })
  title!: string;

  @ApiProperty({ maxLength: FEEDBACK_TEXT_MAX })
  @Transform(trim)
  @IsString({ message: 'الوصف مطلوب' })
  @MinLength(1, { message: 'الوصف مطلوب' })
  @MaxLength(FEEDBACK_TEXT_MAX, {
    message: `الوصف طويل جدًا (${FEEDBACK_TEXT_MAX} حرف على الأكثر)`,
  })
  description!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'A FEEDBACK_SCREENSHOT image uploaded by me (POST /files?purpose=FEEDBACK_SCREENSHOT)',
  })
  @IsOptional()
  @IsUUID()
  screenshotFileId?: string;

  // Technical context, filled by the app (never asked)
  @ApiPropertyOptional({ enum: FeedbackPlatform, enumName: 'FeedbackPlatform' })
  @IsOptional()
  @IsEnum(FeedbackPlatform)
  platform?: FeedbackPlatform;

  @ApiPropertyOptional({ maxLength: 40, example: '1.4.0' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(40)
  appVersion?: string;

  @ApiPropertyOptional({
    maxLength: 200,
    example: '/teacher/sessions',
    description:
      'The screen / route it was sent from (any query string is dropped)',
  })
  @IsOptional()
  @Transform(routeOnly)
  @IsString()
  @MaxLength(200)
  screenPath?: string;
}

// ───────────────────────── admin ─────────────────────────

export class AdminFeedbackQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: FeedbackStatus, enumName: 'FeedbackStatus' })
  @IsOptional()
  @IsEnum(FeedbackStatus)
  status?: FeedbackStatus;

  @ApiPropertyOptional({
    enum: FeedbackCategory,
    enumName: 'FeedbackCategory',
  })
  @IsOptional()
  @IsEnum(FeedbackCategory)
  category?: FeedbackCategory;

  @ApiPropertyOptional({ description: 'Title or sender name / username' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;
}

/**
 * The admins' change: a status and / or the response (null or empty removes it). `version` is
 * the one read (a concurrent change refuses this one: FEEDBACK_CHANGED).
 */
export class UpdateFeedbackDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  version!: number;

  @ApiPropertyOptional({ enum: FeedbackStatus, enumName: 'FeedbackStatus' })
  @IsOptional()
  @IsEnum(FeedbackStatus)
  status?: FeedbackStatus;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: FEEDBACK_TEXT_MAX,
    description: 'The response to the sender; null (or empty) removes it',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(FEEDBACK_TEXT_MAX, {
    message: `الرد طويل جدًا (${FEEDBACK_TEXT_MAX} حرف على الأكثر)`,
  })
  response?: string | null;
}

// ───────────────────────── responses ─────────────────────────

export class FeedbackScreenshotDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    example: '/api/files/…',
    description: 'Authenticated download (its sender and the admins only)',
  })
  url!: string;
  @ApiProperty() mimeType!: string;
  @ApiProperty() size!: number;
}

export class FeedbackPersonDto {
  @ApiProperty() userId!: string;
  @ApiProperty() name!: string;
}

/** What the sender sees (the admins: AdminFeedbackDto, with the sender and the technical context). */
export class FeedbackDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: FeedbackCategory, enumName: 'FeedbackCategory' })
  category!: FeedbackCategory;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: FeedbackStatus, enumName: 'FeedbackStatus' })
  status!: FeedbackStatus;
  @ApiProperty({ type: FeedbackScreenshotDto, nullable: true })
  screenshot!: FeedbackScreenshotDto | null;
  @ApiProperty({ type: String, nullable: true }) response!: string | null;
  @ApiProperty({ type: Date, nullable: true }) respondedAt!: Date | null;
  @ApiProperty({ type: Date, nullable: true }) resolvedAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty() version!: number;
}

export class AdminFeedbackDto extends FeedbackDto {
  @ApiProperty({ type: FeedbackPersonDto }) sender!: FeedbackPersonDto;
  @ApiProperty({ enum: [Role.TEACHER, Role.STUDENT] }) senderRole!: Role;
  @ApiProperty({ type: FeedbackPersonDto, nullable: true })
  respondedBy!: FeedbackPersonDto | null;
  @ApiProperty({
    enum: FeedbackPlatform,
    enumName: 'FeedbackPlatform',
    nullable: true,
  })
  platform!: FeedbackPlatform | null;
  @ApiProperty({ type: String, nullable: true }) appVersion!: string | null;
  @ApiProperty({ type: String, nullable: true }) screenPath!: string | null;
}

export class FeedbackListDto {
  @ApiProperty({ type: FeedbackDto, isArray: true }) data!: FeedbackDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class AdminFeedbackListDto {
  @ApiProperty({ type: AdminFeedbackDto, isArray: true })
  data!: AdminFeedbackDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
  @ApiProperty({ description: 'NEW submissions in total (the inbox badge)' })
  newCount!: number;
}
