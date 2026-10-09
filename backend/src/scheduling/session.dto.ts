import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { IsDateOnly } from '../common/dates.js';
import { PaginationMetaDto, PaginationQueryDto } from '../common/pagination.js';
import {
  ActivationStatus,
  CompletionSource,
  RecordStatus,
  SessionStatus,
  TeachingRole,
} from '../generated/prisma/enums.js';
import { IsTimeOfDay } from './time.js';

/** A real lesson on a real date (manual — never changes the weekly schedule). */
export class CreateSessionDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() groupClassId!: string;
  @IsDateOnly() date!: string;
  @IsTimeOfDay() startTime!: string;
  @IsTimeOfDay() endTime!: string;
  @ApiPropertyOptional({
    enum: [SessionStatus.SCHEDULED, SessionStatus.COMPLETED],
    default: 'SCHEDULED',
    description: 'COMPLETED only for a past/today date',
  })
  @IsOptional()
  @IsIn([SessionStatus.SCHEDULED, SessionStatus.COMPLETED])
  status?: SessionStatus;
}

/** Reschedule a SCHEDULED session (date and/or times). Class and status are not editable here. */
export class UpdateSessionDto {
  @IsDateOnly({ optional: true }) date?: string;
  @IsTimeOfDay({ optional: true }) startTime?: string;
  @IsTimeOfDay({ optional: true }) endTime?: string;
}

export class SetSessionStatusDto {
  @ApiProperty({ enum: SessionStatus, enumName: 'SessionStatus' })
  @IsEnum(SessionStatus)
  status!: SessionStatus;

  @ApiPropertyOptional({ description: 'Only for CANCELLED' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MaxLength(300)
  cancellationReason?: string;

  @ApiPropertyOptional({
    description:
      'Required (true) to set COMPLETED here: a session is normally completed when its attendance is saved (Part 10.6); this records an ADMIN_OVERRIDE.',
  })
  @IsOptional()
  @IsBoolean()
  adminOverride?: boolean;
}

class SessionFilters extends PaginationQueryDto {
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
  @ApiPropertyOptional({ format: 'uuid', description: 'Through the class' })
  @IsOptional()
  @IsUUID()
  roomId?: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Supervisor or assistant of the class',
  })
  @IsOptional()
  @IsUUID()
  teacherId?: string;
  @ApiPropertyOptional({ enum: SessionStatus, enumName: 'SessionStatus' })
  @IsOptional()
  @IsEnum(SessionStatus)
  status?: SessionStatus;
  @ApiPropertyOptional({
    description:
      'Only upcoming SCHEDULED sessions with at least one attention flag',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  needsAttention?: boolean;
}

export class SessionListQueryDto extends SessionFilters {
  @IsDateOnly({ optional: true, description: 'From (inclusive)' })
  from?: string;
  @IsDateOnly({ optional: true, description: 'To (inclusive)' }) to?: string;
  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    default: 'asc',
    description: 'By date then start time (desc: latest first, for history)',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

/** Calendar: a bounded date range (≤ 62 days), not paginated. */
export class SessionCalendarQueryDto extends SessionFilters {
  @IsDateOnly({ description: 'From (inclusive)' }) from!: string;
  @IsDateOnly({ description: 'To (inclusive), at most 62 days after from' })
  to!: string;
}

export class GenerateSessionsDto {
  @IsDateOnly({ description: 'First date (inclusive)' }) from!: string;
  @IsDateOnly({
    description: 'Last date (inclusive), at most 366 days after from',
  })
  to!: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Only this class (default: every running class)',
  })
  @IsOptional()
  @IsUUID()
  groupClassId?: string;
}

export const ATTENTION_FLAGS = [
  'CLASS_INACTIVE',
  'GROUP_INACTIVE',
  'ROOM_INACTIVE',
  'BRANCH_INACTIVE',
  'SUPERVISOR_INACTIVE',
  'ASSISTANT_INACTIVE',
  'NO_SUPERVISOR',
] as const;
export type AttentionFlag = (typeof ATTENTION_FLAGS)[number];

export class SessionClassDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: RecordStatus, enumName: 'RecordStatus' })
  status!: RecordStatus;
  @ApiProperty() group!: { id: string; name: string; status: RecordStatus };
}

export class SessionRoomDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ActivationStatus, enumName: 'ActivationStatus' })
  status!: ActivationStatus;
  @ApiProperty() branch!: {
    id: string;
    name: string;
    status: ActivationStatus;
  };
}

export class SessionTeacherDto {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ enum: TeachingRole, enumName: 'TeachingRole' })
  role!: TeachingRole;
  @ApiProperty({ enum: ActivationStatus, enumName: 'ActivationStatus' })
  status!: ActivationStatus;
}

export class SessionCompletionDto {
  @ApiProperty() completedAt!: Date;
  @ApiProperty({ enum: CompletionSource, enumName: 'CompletionSource' })
  source!: CompletionSource;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Username of who completed it',
  })
  completedBy!: string | null;
}

/** Attendance of the session (roster on its date vs. records) — what lists show without opening it. */
export class SessionAttendanceCountsDto {
  @ApiProperty({
    description:
      'Students expected (enrolled in the class and active ON the session date)',
  })
  expected!: number;
  @ApiProperty({ description: 'Attendance records saved' }) recorded!: number;
  @ApiProperty() present!: number;
  @ApiProperty() absent!: number;
  @ApiProperty() late!: number;
  @ApiProperty() excused!: number;
}

/**
 * A session with WHERE (room + branch) and WHO (team) as they apply to THIS
 * session (snapshot), and attention flags for upcoming SCHEDULED sessions
 * whose class, room, branch or teachers are no longer active.
 */
export class SessionDto {
  @ApiProperty() id!: string;
  @ApiProperty({ format: 'date' }) date!: string;
  @ApiProperty({ example: '17:00' }) startTime!: string;
  @ApiProperty({ example: '19:00' }) endTime!: string;
  @ApiProperty({ enum: SessionStatus, enumName: 'SessionStatus' })
  status!: SessionStatus;
  @ApiPropertyOptional({ type: String, nullable: true }) cancellationReason!:
    string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Weekly slot it was generated from (null = manual)',
  })
  weeklyScheduleId!: string | null;
  @ApiPropertyOptional({ type: SessionCompletionDto, nullable: true })
  completion!: SessionCompletionDto | null;
  @ApiProperty({ type: SessionClassDto }) groupClass!: SessionClassDto;
  @ApiProperty({ type: SessionRoomDto }) room!: SessionRoomDto;
  @ApiProperty({
    type: SessionTeacherDto,
    isArray: true,
    description: 'Supervisor first',
  })
  teachers!: SessionTeacherDto[];
  @ApiProperty({
    enum: ATTENTION_FLAGS,
    isArray: true,
    description:
      'Upcoming SCHEDULED sessions needing an admin decision (never auto-cancelled)',
  })
  attention!: AttentionFlag[];
  @ApiProperty({ type: SessionAttendanceCountsDto })
  attendance!: SessionAttendanceCountsDto;
}

export class SessionListDto {
  @ApiProperty({ type: SessionDto, isArray: true }) data!: SessionDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class SkippedSessionDto {
  @ApiProperty() groupClassId!: string;
  @ApiProperty() weeklyScheduleId!: string;
  @ApiProperty({ format: 'date' }) date!: string;
  @ApiProperty() startTime!: string;
  @ApiProperty() endTime!: string;
  @ApiProperty({ enum: ['ROOM', 'TEACHER'] }) reason!: 'ROOM' | 'TEACHER';
  @ApiProperty({ description: 'The existing session it would collide with' })
  conflictingSessionId!: string;
}

export class GenerateSessionsResultDto {
  @ApiProperty({ format: 'date' }) from!: string;
  @ApiProperty({ format: 'date' }) to!: string;
  @ApiProperty({ description: 'New SCHEDULED sessions' }) created!: number;
  @ApiProperty({
    description:
      'Occurrences that already had a session (any status, cancelled included)',
  })
  skippedExisting!: number;
  @ApiProperty({
    type: SkippedSessionDto,
    isArray: true,
    description:
      'Occurrences not created because of a room/teacher conflict with an existing session',
  })
  skippedConflicts!: SkippedSessionDto[];
  @ApiProperty({
    type: String,
    isArray: true,
    description:
      'Classes skipped because their supervisor is inactive (appoint a replacement first)',
  })
  skippedInactiveSupervisorClassIds!: string[];
}
