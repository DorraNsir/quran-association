import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
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
  AttendanceChangeKind,
  AttendanceStatus,
  AttendanceSubject,
  CompletionSource,
  SessionStatus,
  TeachingRole,
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
  @ExpectedStatus() expectedStatus?: AttendanceStatus | null;
}

/** Optimistic concurrency: the status the client last saw (null = not recorded). */
function ExpectedStatus() {
  return applyDecorators(
    ApiPropertyOptional({
      enum: AttendanceStatus,
      enumName: 'AttendanceStatus',
      nullable: true,
      description:
        'The saved status the client started from (null = not recorded). If someone changed it meanwhile, the save is refused (409 ATTENDANCE_CHANGED) instead of silently overwriting. Omit to skip the check.',
    }),
    IsOptional(),
    ValidateIf((_: unknown, v: unknown) => v !== null),
    IsEnum(AttendanceStatus),
  );
}

export class TeacherAttendanceInputDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() teacherId!: string;
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
  @ExpectedStatus() expectedStatus?: AttendanceStatus | null;
}

/**
 * Bulk save (all-or-nothing) of a session's attendance: students
 * (`records`) and/or teachers (`teachers`), at least one entry. Listed
 * entries are created or updated; others are left untouched (nothing is
 * deleted, nothing is marked absent by default).
 */
export class SaveAttendanceDto {
  @ApiPropertyOptional({ type: AttendanceRecordInputDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AttendanceRecordInputDto)
  records?: AttendanceRecordInputDto[];
  @ApiPropertyOptional({ type: TeacherAttendanceInputDto, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TeacherAttendanceInputDto)
  teachers?: TeacherAttendanceInputDto[];
}

export class RosterTeacherDto {
  @ApiProperty() teacherId!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) photoUrl!:
    string | null;
  @ApiPropertyOptional({
    enum: TeachingRole,
    enumName: 'TeachingRole',
    nullable: true,
    description:
      "Role in THIS session (its team snapshot); null = recorded but no longer in the session's team",
  })
  role!: TeachingRole | null;
  @ApiProperty() recorded!: boolean;
  @ApiPropertyOptional({
    enum: AttendanceStatus,
    enumName: 'AttendanceStatus',
    nullable: true,
    description: 'null = not recorded yet (لم يسجل بعد)',
  })
  status!: AttendanceStatus | null;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiPropertyOptional({ type: Date, nullable: true }) recordedAt!: Date | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  recordedBy!: string | null;
}

/** A class with its group (the student's ORIGINAL class in a shared session). */
export class AttendanceClassDto {
  @ApiProperty() id!: string;
  @ApiProperty() group!: { id: string; name: string };
}

export class RosterStudentDto {
  @ApiProperty() studentId!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) photoUrl!:
    string | null;
  @ApiPropertyOptional({
    type: AttendanceClassDto,
    nullable: true,
    description:
      "The student's class (and group) ON the session date — in a shared session, which participating class they come from",
  })
  groupClass!: AttendanceClassDto | null;
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
  @ApiProperty({
    type: AttendanceClassDto,
    isArray: true,
    description:
      '«حصة مشتركة»: the other participating classes (empty for a normal session)',
  })
  additionalClasses!: AttendanceClassDto[];
  @ApiProperty({
    description:
      "The caller's students: allStudents (admin, the supervisor, any teacher of a normal session) or only those of groupClassIds (an assistant of a shared session — their assigned classes)",
  })
  scope!: { allStudents: boolean; groupClassIds: string[] };
  @ApiProperty({
    description: 'Students expected (roster, in the caller scope)',
  })
  expectedCount!: number;
  @ApiProperty({ description: 'Expected students with a recorded status' })
  recordedCount!: number;
  @ApiProperty({
    description:
      'Every expected student recorded (false for an empty roster) — in the caller scope; the session completes when the WHOLE roster is recorded',
  })
  complete!: boolean;
  @ApiProperty({ description: 'Whether the caller may record / correct now' })
  editable!: boolean;
  @ApiProperty({
    description:
      'Whether the caller may also CHANGE already saved values (teachers: within TEACHER_ATTENDANCE_WINDOW_DAYS; first recordings have no time limit)',
  })
  correctable!: boolean;
  @ApiProperty({ type: RosterStudentDto, isArray: true })
  students!: RosterStudentDto[];
  @ApiProperty({
    description: "Teachers of the session's team snapshot (who taught it)",
  })
  teacherExpectedCount!: number;
  @ApiProperty({ description: 'Of them, with a recorded status' })
  teacherRecordedCount!: number;
  @ApiProperty({
    type: RosterTeacherDto,
    isArray: true,
    description: 'Supervisor first',
  })
  teachers!: RosterTeacherDto[];
}

export class AttendanceChangeDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: AttendanceSubject, enumName: 'AttendanceSubject' })
  subject!: AttendanceSubject;
  @ApiProperty({ description: 'Student or teacher id' }) subjectId!: string;
  @ApiProperty() subjectName!: string;
  @ApiProperty({ enum: AttendanceChangeKind, enumName: 'AttendanceChangeKind' })
  kind!: AttendanceChangeKind;
  @ApiPropertyOptional({
    enum: AttendanceStatus,
    enumName: 'AttendanceStatus',
    nullable: true,
  })
  previousStatus!: AttendanceStatus | null;
  @ApiProperty({ enum: AttendanceStatus, enumName: 'AttendanceStatus' })
  newStatus!: AttendanceStatus;
  @ApiPropertyOptional({ type: String, nullable: true })
  previousNote!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) newNote!:
    string | null;
  @ApiProperty() actorName!: string;
  @ApiProperty() createdAt!: Date;
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

/** A teacher's own records: the student query + an optional group. */
export class TeacherAttendanceQueryDto extends StudentAttendanceQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      "Only sessions of this group (a shared session counts for each of its participating classes' groups)",
  })
  @IsOptional()
  @IsUUID()
  groupId?: string;
}

/** A teacher's own totals: the summary query + an optional group. */
export class TeacherSummaryQueryDto extends SummaryQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      "Only sessions of this group (a shared session counts for each of its participating classes' groups)",
  })
  @IsOptional()
  @IsUUID()
  groupId?: string;
}

/** A group in which a teacher has attendance records or a current assignment. */
export class TeacherAttendanceGroupDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class StudentAttendanceRecordDto {
  @ApiProperty() sessionId!: string;
  @ApiProperty({ format: 'date' }) date!: string;
  @ApiProperty() startTime!: string;
  @ApiProperty() endTime!: string;
  @ApiProperty({ enum: SessionStatus, enumName: 'SessionStatus' })
  sessionStatus!: SessionStatus;
  @ApiProperty({
    description:
      "The session's class — for a shared session, the student's own participating class",
  })
  groupClass!: {
    id: string;
    group: { id: string; name: string };
  };
  @ApiProperty({ enum: AttendanceStatus, enumName: 'AttendanceStatus' })
  status!: AttendanceStatus;
  @ApiPropertyOptional({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() updatedAt!: Date;
}

export class TeacherAttendanceRecordDto extends StudentAttendanceRecordDto {
  @ApiPropertyOptional({
    enum: TeachingRole,
    enumName: 'TeachingRole',
    nullable: true,
    description: 'Role in that session (team snapshot)',
  })
  role!: TeachingRole | null;
  @ApiProperty({
    type: AttendanceClassDto,
    isArray: true,
    description:
      '«حصة مشتركة»: the other participating classes (empty for a normal session)',
  })
  additionalClasses!: AttendanceClassDto[];
}

export class TeacherAttendanceListDto {
  @ApiProperty({ type: TeacherAttendanceRecordDto, isArray: true })
  data!: TeacherAttendanceRecordDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
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
  @ApiProperty({ description: 'PRESENT + LATE' }) attended!: number;
  @ApiProperty({
    description: 'PRESENT + LATE + ABSENT (the rate denominator)',
  })
  eligible!: number;
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

/** Association-wide monitoring: records grouped by student (counts only). */
export class StudentsSummaryQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  academicYearId?: string;
  @IsDateOnly({ optional: true }) from?: string;
  @IsDateOnly({ optional: true }) to?: string;
  @ApiPropertyOptional({ format: 'uuid', description: "The session's group" })
  @IsOptional()
  @IsUUID()
  groupId?: string;
  @ApiPropertyOptional({ format: 'uuid', description: "The session's class" })
  @IsOptional()
  @IsUUID()
  groupClassId?: string;
  @ApiPropertyOptional({ format: 'uuid', description: "The session's branch" })
  @IsOptional()
  @IsUUID()
  branchId?: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Sessions this teacher taught (team snapshot)',
  })
  @IsOptional()
  @IsUUID()
  teacherId?: string;
}

export class StudentSummaryLineDto {
  @ApiProperty() studentId!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) photoUrl!:
    string | null;
  @ApiProperty() recorded!: number;
  @ApiProperty() present!: number;
  @ApiProperty() absent!: number;
  @ApiProperty() late!: number;
  @ApiProperty() excused!: number;
  @ApiProperty() attended!: number;
  @ApiProperty() eligible!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) rate!: number | null;
}

/** Association-wide, per teacher (their own attendance in the sessions they taught). */
export class TeachersSummaryQueryDto extends StudentsSummaryQueryDto {}

export class TeacherSummaryLineDto {
  @ApiProperty() teacherId!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) photoUrl!:
    string | null;
  @ApiProperty() recorded!: number;
  @ApiProperty() present!: number;
  @ApiProperty() absent!: number;
  @ApiProperty() late!: number;
  @ApiProperty() excused!: number;
  @ApiProperty() attended!: number;
  @ApiProperty() eligible!: number;
  @ApiPropertyOptional({ type: Number, nullable: true }) rate!: number | null;
}
