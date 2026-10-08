import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { IsDateOnly } from '../common/dates.js';
import { PaginationMetaDto, PaginationQueryDto } from '../common/pagination.js';
import {
  AttendanceStatus,
  CompletionSource,
  SessionStatus,
} from '../generated/prisma/enums.js';

export const NOTE_MAX = 300;

export class AttendanceRecordInputDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() studentId!: string;
  @ApiProperty({
    enum: AttendanceStatus,
    enumName: 'AttendanceStatus',
    description: 'حاضر / غائب / متأخر / غياب مبرر',
  })
  @IsEnum(AttendanceStatus)
  status!: AttendanceStatus;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: NOTE_MAX,
    description: 'Omit to keep, null/"" to clear',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsOptional()
  @ValidateIf((_: unknown, v: unknown) => v !== null)
  @IsString()
  @MaxLength(NOTE_MAX)
  note?: string | null;
}

/**
 * Bulk save (all-or-nothing). Listed students are created or updated; other
 * records of the session are left untouched (nothing is deleted).
 */
export class SaveAttendanceDto {
  @ApiProperty({ type: AttendanceRecordInputDto, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordInputDto)
  records!: AttendanceRecordInputDto[];
}

export class RosterStudentDto {
  @ApiProperty() studentId!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) photoUrl!:
    string | null;
  @ApiProperty({
    description:
      'Enrolled in the class on the session date and active → counts for completion',
  })
  expected!: boolean;
  @ApiProperty() recorded!: boolean;
  @ApiPropertyOptional({
    enum: AttendanceStatus,
    enumName: 'AttendanceStatus',
    nullable: true,
    description: 'null = not recorded yet (never "absent")',
  })
  status!: AttendanceStatus | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiPropertyOptional({ type: Date, nullable: true }) recordedAt!: Date | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Username of the last recorder',
  })
  recordedBy!: string | null;
}

export class SessionAttendanceDto {
  @ApiProperty() sessionId!: string;
  @ApiProperty({ format: 'date' }) date!: string;
  @ApiProperty() startTime!: string;
  @ApiProperty() endTime!: string;
  @ApiProperty({ enum: SessionStatus, enumName: 'SessionStatus' })
  sessionStatus!: SessionStatus;
  @ApiPropertyOptional({
    enum: CompletionSource,
    enumName: 'CompletionSource',
    nullable: true,
  })
  completionSource!: CompletionSource | null;
  @ApiProperty() groupClass!: {
    id: string;
    group: { id: string; name: string };
    room: { id: string; name: string };
    branch: { id: string; name: string };
  };
  @ApiProperty({ description: 'Students expected (roster)' })
  expectedCount!: number;
  @ApiProperty({ description: 'Expected students with a recorded status' })
  recordedCount!: number;
  @ApiProperty({
    description: 'Every expected student recorded (false for an empty roster)',
  })
  complete!: boolean;
  @ApiProperty({ description: 'Whether the caller may record / correct now' })
  editable!: boolean;
  @ApiProperty({ type: RosterStudentDto, isArray: true })
  students!: RosterStudentDto[];
}

export class StudentAttendanceQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Limits to the year’s date range',
  })
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
  @IsDateOnly({ optional: true }) from?: string;
  @IsDateOnly({ optional: true }) to?: string;
}

export class SummaryQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Limits to the year’s date range',
  })
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
  @IsDateOnly({ optional: true }) from?: string;
  @IsDateOnly({ optional: true }) to?: string;
}

export class StudentAttendanceRecordDto {
  @ApiProperty() sessionId!: string;
  @ApiProperty({ format: 'date' }) date!: string;
  @ApiProperty() startTime!: string;
  @ApiProperty() endTime!: string;
  @ApiProperty({ enum: SessionStatus, enumName: 'SessionStatus' })
  sessionStatus!: SessionStatus;
  @ApiProperty() groupClass!: {
    id: string;
    group: { id: string; name: string };
  };
  @ApiProperty({ enum: AttendanceStatus, enumName: 'AttendanceStatus' })
  status!: AttendanceStatus;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() updatedAt!: Date;
}

export class StudentAttendanceListDto {
  @ApiProperty({ type: StudentAttendanceRecordDto, isArray: true })
  data!: StudentAttendanceRecordDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

export class AttendanceSummaryDto {
  @ApiProperty({
    description:
      'Recorded statuses (cancelled sessions excluded; unrecorded never counted)',
  })
  recorded!: number;
  @ApiProperty() present!: number;
  @ApiProperty() absent!: number;
  @ApiProperty() late!: number;
  @ApiProperty() excused!: number;
  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description:
      'Attendance rate % = (PRESENT + LATE) / (recorded − EXCUSED) × 100; null when the denominator is 0',
  })
  rate!: number | null;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true }) from!:
    string | null;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true }) to!:
    string | null;
}
