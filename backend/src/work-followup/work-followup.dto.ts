import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { PaginationMetaDto, PaginationQueryDto } from '../common/pagination.js';
import {
  SessionStatus,
  WorkAssignmentKind,
  WorkStatus,
  WorkType,
} from '../generated/prisma/enums.js';

export const DESCRIPTION_MAX = 2000;
export const COMMENT_MAX = 1000;
export const NOTES_MAX = 2000;
export const ITEMS_MAX = 50;

/** Trims the ends only — inner line breaks of a multiline description are kept. */
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
/** "" and whitespace → null (clears an optional text). */
const trimOrNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

// ───────────────────────── requests ─────────────────────────

/**
 * A structured Quranic assignment: REFERENCES ONLY (surahs, ayahs or pages of the active Mushaf
 * edition). The server validates them, derives the canonical verse range and computes the
 * workload itself — a client never sends a workload.
 *  حفظ  AYAH_RANGE (fromSurah = toSurah, fromAyah, toAyah) or PAGE_RANGE (fromPage, toPage)
 *  مراجعة / اختبار  SURAH_RANGE (fromSurah, toSurah; fromAyah / toAyah optional)
 *  عرضة  SURAH_RANGE of one whole surah (fromSurah = toSurah, no ayahs)
 */
export class WorkAssignmentDto {
  @ApiProperty({ enum: WorkAssignmentKind, enumName: 'WorkAssignmentKind' })
  @IsEnum(WorkAssignmentKind)
  kind!: WorkAssignmentKind;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: 114,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(114)
  fromSurah?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  fromAyah?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    maximum: 114,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(114)
  toSurah?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  toAyah?: number | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    description: 'Printed page of the edition',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  fromPage?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  toPage?: number | null;
}

/** Description required for a free-text item; optional with an assignment (the server writes one). */
const descriptionRequired = (o: { assignment?: unknown }, v: unknown) =>
  !o.assignment || (v !== undefined && v !== null && v !== '');

export class NewWorkItemDto {
  @ApiProperty({ enum: WorkType, enumName: 'WorkType' })
  @IsEnum(WorkType)
  type!: WorkType;

  @ApiProperty({
    maxLength: DESCRIPTION_MAX,
    description:
      'Multiline text kept as is (only the ends are trimmed). Optional when `assignment` is sent: the server then writes one',
  })
  @Transform(trim)
  @ValidateIf(descriptionRequired)
  @IsString()
  @IsNotEmpty({ message: 'وصف العمل مطلوب' })
  @MaxLength(DESCRIPTION_MAX)
  description!: string;

  @ApiPropertyOptional({
    type: WorkAssignmentDto,
    nullable: true,
    description: 'Structured Quranic assignment (optional)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkAssignmentDto)
  assignment?: WorkAssignmentDto | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: 1,
    description: 'عرضة only (ignored for other types); no maximum',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  recitationNumber?: number | null;
}

export class CreateWorkProgramDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() studentId!: string;

  @ApiProperty({
    format: 'uuid',
    description: 'An existing UPCOMING, scheduled session of the student',
  })
  @IsUUID()
  sessionId!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: NOTES_MAX })
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(NOTES_MAX)
  generalNotes?: string | null;

  @ApiProperty({ type: NewWorkItemDto, isArray: true })
  @IsArray()
  @ArrayMinSize(1, { message: 'أضف عملًا واحدًا على الأقل' })
  @ArrayMaxSize(ITEMS_MAX)
  @ValidateNested({ each: true })
  @Type(() => NewWorkItemDto)
  items!: NewWorkItemDto[];
}

/** Changes to a saved item's planning — never its result (see evaluation). */
export class WorkItemEditDto {
  @ApiProperty({ enum: WorkType, enumName: 'WorkType' })
  @IsOptional()
  @IsEnum(WorkType)
  type?: WorkType;

  @ApiPropertyOptional({ maxLength: DESCRIPTION_MAX })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'وصف العمل مطلوب' })
  @MaxLength(DESCRIPTION_MAX)
  description?: string;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsInt()
  @Min(1)
  recitationNumber?: number | null;

  @ApiPropertyOptional({
    type: WorkAssignmentDto,
    nullable: true,
    description:
      'Omitted: unchanged · null: back to free text only · an object: the new assignment',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => WorkAssignmentDto)
  assignment?: WorkAssignmentDto | null;

  @ApiProperty({
    minimum: 1,
    description: 'The item version the client edited (stale → 409)',
  })
  @IsInt()
  @Min(1)
  version!: number;
}

export class WorkItemPatchDto extends WorkItemEditDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id!: string;
}

/**
 * One save of the edit form, applied atomically: notes, changes to saved
 * items, new items. Saved items are never deleted (evaluate them «ملغى»).
 */
export class UpdateWorkProgramDto {
  @ApiPropertyOptional({
    minimum: 1,
    description: 'Program version — required when generalNotes is sent',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: NOTES_MAX })
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(NOTES_MAX)
  generalNotes?: string | null;

  @ApiPropertyOptional({ type: WorkItemPatchDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ITEMS_MAX)
  @ValidateNested({ each: true })
  @Type(() => WorkItemPatchDto)
  items?: WorkItemPatchDto[];

  @ApiPropertyOptional({ type: NewWorkItemDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(ITEMS_MAX)
  @ValidateNested({ each: true })
  @Type(() => NewWorkItemDto)
  newItems?: NewWorkItemDto[];
}

export class AddWorkItemsDto {
  @ApiProperty({ type: NewWorkItemDto, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(ITEMS_MAX)
  @ValidateNested({ each: true })
  @Type(() => NewWorkItemDto)
  items!: NewWorkItemDto[];
}

export class EvaluateWorkItemDto {
  @ApiProperty({ enum: WorkStatus, enumName: 'WorkStatus' })
  @IsEnum(WorkStatus)
  status!: WorkStatus;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: COMMENT_MAX })
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(COMMENT_MAX)
  evaluationComment?: string | null;

  @ApiProperty({ minimum: 1, description: 'Item version seen by the client' })
  @IsInt()
  @Min(1)
  version!: number;
}

export class EvaluationLineDto extends EvaluateWorkItemDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() id!: string;
}

/** «حفظ التقييم»: the changed items (and notes), atomically. */
export class EvaluateWorkProgramDto {
  @ApiProperty({ type: EvaluationLineDto, isArray: true })
  @IsArray()
  @ArrayMaxSize(ITEMS_MAX)
  @ValidateNested({ each: true })
  @Type(() => EvaluationLineDto)
  items!: EvaluationLineDto[];

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: NOTES_MAX })
  @IsOptional()
  @Transform(trimOrNull)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(NOTES_MAX)
  generalNotes?: string | null;
}

export class ScheduleWorkItemDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'An UPCOMING scheduled session of the same student, later than the source session',
  })
  @IsUUID()
  targetSessionId!: string;
}

export class NextRecitationDto extends ScheduleWorkItemDto {
  @ApiPropertyOptional({
    maxLength: DESCRIPTION_MAX,
    description:
      'Defaults to the source description with the next ordinal («العرضة الثالثة…»)',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(DESCRIPTION_MAX)
  description?: string;
}

export const PERIODS = ['upcoming', 'past'] as const;
export const PROGRAM_STATES = [
  'pending',
  'unfinished',
  'cancelled',
  'done',
] as const;

export class WorkProgramListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: "Student's name (contains)" })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: "The session's class" })
  @IsOptional()
  @IsUUID()
  groupClassId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @ApiPropertyOptional({ enum: PERIODS })
  @IsOptional()
  @IsIn(PERIODS)
  period?: (typeof PERIODS)[number];

  @ApiPropertyOptional({
    enum: PROGRAM_STATES,
    description:
      'pending: an item not evaluated · unfinished: غير منجز/جزئي/مؤجل · cancelled: an item ملغى · done: every active item منجز',
  })
  @IsOptional()
  @IsIn(PROGRAM_STATES)
  state?: (typeof PROGRAM_STATES)[number];
}

export class EligibleSessionsQueryDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() studentId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Only sessions later than this one (transfer / next recitation)',
  })
  @IsOptional()
  @IsUUID()
  afterSessionId?: string;
}

// ───────────────────────── responses ─────────────────────────

export class WorkSessionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'date' }) date!: string;
  @ApiProperty() startTime!: string;
  @ApiProperty() endTime!: string;
  @ApiProperty({ enum: SessionStatus, enumName: 'SessionStatus' })
  status!: SessionStatus;
  @ApiProperty() groupClassId!: string;
  @ApiProperty() groupName!: string;
  @ApiProperty() branchName!: string;
}

export class EligibleSessionDto extends WorkSessionDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      "The student's existing program for this session (edit it instead)",
  })
  programId!: string | null;
}

export class WorkStudentDto {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) photoUrl!:
    string | null;
}

export class WorkItemLinkDto {
  @ApiProperty() itemId!: string;
  @ApiProperty() programId!: string;
  @ApiProperty() sessionId!: string;
  @ApiProperty({ format: 'date' }) sessionDate!: string;
}

export class CarriedFromDto extends WorkItemLinkDto {
  @ApiProperty({
    enum: WorkStatus,
    enumName: 'WorkStatus',
    description: "The source item's status WHEN it was carried",
  })
  status!: WorkStatus;
}

export class ContinuedFromDto extends WorkItemLinkDto {
  @ApiPropertyOptional({ type: Number, nullable: true })
  recitationNumber!: number | null;
}

export class WorkItemAssignmentDto {
  @ApiProperty({ enum: WorkAssignmentKind, enumName: 'WorkAssignmentKind' })
  kind!: WorkAssignmentKind;
  @ApiProperty({ description: 'The Mushaf edition the range belongs to' })
  editionId!: string;
  @ApiProperty({ description: 'Canonical verse range (derived by the server)' })
  fromSurah!: number;
  @ApiProperty() fromAyah!: number;
  @ApiProperty() toSurah!: number;
  @ApiProperty() toAyah!: number;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'PAGE_RANGE only',
  })
  fromPage!: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) toPage!: number | null;
}

const CYCLE_ENTRY = [
  'SUCCESS',
  'FAILED',
  'PENDING',
  'POSTPONED',
  'DROPPED',
  'SESSION_CANCELLED',
];

/** «متابعة العرضات»: an item's cycle (structured عرضة of one surah only). */
export class RecitationCycleSummaryDto {
  @ApiProperty({ format: 'uuid' }) cycleId!: string;
  @ApiProperty({ minimum: 1, maximum: 114 }) surah!: number;
  @ApiProperty({
    description: 'Cycle number for this student and surah (1, 2, …)',
  })
  number!: number;
  @ApiProperty({
    description: 'Successful recitations (COMPLETED) in the cycle',
  })
  successes!: number;
  @ApiProperty({ example: 4 }) required!: number;
  @ApiProperty() completed!: boolean;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      "This item's chronological attempt number in the cycle (null: not an attempt — postponed, dropped, or its session was cancelled)",
  })
  attemptNumber!: number | null;
  @ApiProperty({ enum: CYCLE_ENTRY }) entry!: string;
}

/** One entry of a cycle's history: a work item (its evaluation is the source of truth). */
export class RecitationAttemptDto {
  @ApiProperty({ format: 'uuid' }) itemId!: string;
  @ApiProperty({ format: 'uuid' }) programId!: string;
  @ApiProperty({ format: 'uuid' }) sessionId!: string;
  @ApiProperty({ example: '2026-11-18' }) sessionDate!: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) attemptNumber!:
    number | null;
  @ApiProperty({ enum: CYCLE_ENTRY }) entry!: string;
  @ApiProperty({ enum: WorkStatus, enumName: 'WorkStatus' })
  status!: WorkStatus;
  @ApiPropertyOptional({ type: String, nullable: true })
  evaluationComment!: string | null;
  @ApiPropertyOptional({ type: Date, nullable: true })
  evaluatedAt!: Date | null;
  @ApiPropertyOptional({ type: String, nullable: true }) evaluatedBy!:
    string | null;
}

export class RecitationCycleDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() number!: number;
  @ApiProperty() successes!: number;
  @ApiProperty({ example: 4 }) required!: number;
  @ApiProperty() attempts!: number;
  @ApiProperty() completed!: boolean;
  @ApiPropertyOptional({ type: Date, nullable: true })
  completedAt!: Date | null;
  @ApiProperty() startedAt!: Date;
  @ApiProperty({
    type: RecitationAttemptDto,
    isArray: true,
    description: 'Chronological',
  })
  entries!: RecitationAttemptDto[];
}

export class RecitationSurahHistoryDto {
  @ApiProperty({ minimum: 1, maximum: 114 }) surah!: number;
  @ApiProperty({
    type: RecitationCycleDto,
    isArray: true,
    description: 'Oldest first; the last one is the current cycle',
  })
  cycles!: RecitationCycleDto[];
  @ApiProperty({
    type: RecitationAttemptDto,
    isArray: true,
    description:
      'Recitations of this surah planned before cycles existed: shown as they are, never counted',
  })
  earlier!: RecitationAttemptDto[];
  @ApiProperty({
    description: 'The current cycle is complete: a new one may be started',
  })
  canStartNewCycle!: boolean;
}

export class RecitationHistoryDto {
  @ApiProperty({ format: 'uuid' }) studentId!: string;
  @ApiProperty({
    type: RecitationSurahHistoryDto,
    isArray: true,
    description: 'By surah number',
  })
  surahs!: RecitationSurahHistoryDto[];
}

export class WorkItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() version!: number;
  @ApiProperty() position!: number;
  @ApiProperty({ enum: WorkType, enumName: 'WorkType' }) type!: WorkType;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: WorkStatus, enumName: 'WorkStatus' })
  status!: WorkStatus;
  @ApiPropertyOptional({ type: Number, nullable: true })
  recitationNumber!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  evaluationComment!: string | null;
  @ApiPropertyOptional({ type: Date, nullable: true })
  evaluatedAt!: Date | null;
  @ApiPropertyOptional({ type: String, nullable: true }) evaluatedBy!:
    string | null;
  @ApiPropertyOptional({ type: CarriedFromDto, nullable: true })
  carriedFrom!: CarriedFromDto | null;
  @ApiPropertyOptional({ type: ContinuedFromDto, nullable: true })
  continuedFrom!: ContinuedFromDto | null;
  @ApiProperty({
    type: WorkItemLinkDto,
    isArray: true,
    description: 'Carried into later sessions',
  })
  carriedTo!: WorkItemLinkDto[];
  @ApiProperty({
    type: WorkItemLinkDto,
    isArray: true,
    description: 'Its next recitation(s)',
  })
  continuedBy!: WorkItemLinkDto[];
  @ApiPropertyOptional({
    type: WorkItemAssignmentDto,
    nullable: true,
    description: 'null: a free-text item',
  })
  assignment!: WorkItemAssignmentDto | null;
  @ApiPropertyOptional({
    type: Object,
    nullable: true,
    description:
      'Server-computed workload stored when the assignment was saved: per unit exact | bounded (greaterThan < x < lessThan) | unavailable, with dataStatus; authoritative=false → not for ranking',
  })
  workload!: Record<string, unknown> | null;
  @ApiPropertyOptional({
    type: RecitationCycleSummaryDto,
    nullable: true,
    description:
      '«متابعة العرضات»: the cycle of a tracked recitation (null otherwise)',
  })
  recitationCycle!: RecitationCycleSummaryDto | null;
}

export class WorkProgressDto {
  @ApiProperty() total!: number;
  @ApiProperty({ description: 'total − cancelled' }) active!: number;
  @ApiProperty({ description: 'COMPLETED only' }) completed!: number;
  @ApiProperty({ description: 'NOT_EVALUATED' }) pending!: number;
  @ApiProperty({ description: 'NOT_COMPLETED + PARTIAL + POSTPONED' })
  unfinished!: number;
  @ApiProperty() cancelled!: number;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'completed / active × 100; null when there is no active item',
  })
  rate!: number | null;
}

/** Why a program cannot be evaluated now (null: it can). */
export const EVALUATION_BLOCKS = [
  'SESSION_NOT_STARTED',
  'SESSION_CANCELLED',
] as const;
export type EvaluationBlock = (typeof EVALUATION_BLOCKS)[number];

export class WorkEvaluationStateDto {
  @ApiProperty({
    description:
      'Evaluation is open: the session has started (ongoing or past, incl. completed) and is not cancelled — server clock, platform timezone',
  })
  allowed!: boolean;
  @ApiPropertyOptional({
    enum: EVALUATION_BLOCKS,
    nullable: true,
    description: 'Set iff allowed is false',
  })
  blockedReason!: EvaluationBlock | null;
}

export class WorkProgramDto {
  @ApiProperty() id!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ type: WorkStudentDto }) student!: WorkStudentDto;
  @ApiProperty({ type: WorkSessionDto }) session!: WorkSessionDto;
  @ApiProperty({
    type: WorkEvaluationStateDto,
    description:
      'Whether evaluation is open when this response was built (the evaluation endpoints enforce the same rule)',
  })
  evaluation!: WorkEvaluationStateDto;
  @ApiPropertyOptional({ type: String, nullable: true })
  generalNotes!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Name of the last editor',
  })
  lastEditedBy!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ type: WorkProgressDto }) progress!: WorkProgressDto;
  @ApiProperty({ type: WorkItemDto, isArray: true }) items!: WorkItemDto[];
}

export class WorkProgramListDto {
  @ApiProperty({ type: WorkProgramDto, isArray: true }) data!: WorkProgramDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

// ───────────────────────── student (read-only) ─────────────────────────

export class StudentWorkProgramQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PERIODS })
  @IsOptional()
  @IsIn(PERIODS)
  period?: (typeof PERIODS)[number];
}

export class StudentWorkItemDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: WorkType, enumName: 'WorkType' }) type!: WorkType;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: WorkStatus, enumName: 'WorkStatus' })
  status!: WorkStatus;
  @ApiPropertyOptional({ type: Number, nullable: true })
  recitationNumber!: number | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      "The teacher's evaluation comment — only once the item is evaluated",
  })
  evaluationComment!: string | null;
  @ApiPropertyOptional({
    type: Object,
    nullable: true,
    description:
      'Carried from an earlier session: its date and the result then',
  })
  carriedFrom!: { sessionDate: string; status: WorkStatus } | null;
  @ApiPropertyOptional({ type: WorkItemAssignmentDto, nullable: true })
  assignment!: WorkItemAssignmentDto | null;
}

/**
 * A student's own work program, read-only: what to do, for which session,
 * and the results. No versions, no editor names, no internal links, and not
 * the program-level teacher notes (kept for the teachers).
 */
export class StudentWorkProgramDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: WorkSessionDto }) session!: WorkSessionDto;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'The teacher who planned it (else the session supervisor)',
  })
  teacherName!: string | null;
  @ApiProperty({ type: WorkProgressDto }) progress!: WorkProgressDto;
  @ApiProperty({ type: StudentWorkItemDto, isArray: true })
  items!: StudentWorkItemDto[];
}

export class StudentWorkProgramListDto {
  @ApiProperty({ type: StudentWorkProgramDto, isArray: true })
  data!: StudentWorkProgramDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}
