import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { IsDateOnly } from '../common/dates.js';
import { PaginationMetaDto, PaginationQueryDto } from '../common/pagination.js';
import { SessionStatus } from '../generated/prisma/enums.js';
import { ScheduleClassDto } from './schedule.dto.js';
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
}

export class SessionListQueryDto extends SessionFilters {
  @IsDateOnly({ optional: true, description: 'From (inclusive)' })
  from?: string;
  @IsDateOnly({ optional: true, description: 'To (inclusive)' }) to?: string;
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
  @ApiProperty({ type: ScheduleClassDto }) groupClass!: ScheduleClassDto;
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
}
