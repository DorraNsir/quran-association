import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { PaginationMetaDto, PaginationQueryDto } from '../common/pagination.js';
import {
  ActivationStatus,
  Gender,
  RecordStatus,
  Weekday,
} from '../generated/prisma/enums.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/*
 * Workspace bundles: the reference data one teacher / one student may see,
 * in flat records (ids, no nesting) so every workspace screen resolves its
 * classes, rooms, teachers and weekly slots from ONE response. Personal data
 * is limited to what the role needs (no CIN, no address for teachers).
 */

export class WsBranchDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() address!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ enum: ActivationStatus, enumName: 'ActivationStatus' })
  status!: ActivationStatus;
}

export class WsRoomDto {
  @ApiProperty() id!: string;
  @ApiProperty() branchId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ActivationStatus, enumName: 'ActivationStatus' })
  status!: ActivationStatus;
}

export class WsGroupDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) audience!:
    string | null;
  @ApiProperty({ enum: RecordStatus, enumName: 'RecordStatus' })
  status!: RecordStatus;
  @ApiProperty({ format: 'date' }) createdAt!: string;
}

export class WsGroupClassDto {
  @ApiProperty() id!: string;
  @ApiProperty() groupId!: string;
  @ApiProperty() branchId!: string;
  @ApiProperty() supervisorId!: string;
  @ApiProperty({ type: [String] }) assistantIds!: string[];
  @ApiProperty({ enum: RecordStatus, enumName: 'RecordStatus' })
  status!: RecordStatus;
}

export class WsTeacherDto {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ enum: Gender, enumName: 'Gender', nullable: true })
  gender!: Gender | null;
  @ApiPropertyOptional({ type: String, nullable: true }) photoUrl!:
    string | null;
  @ApiProperty({ enum: ActivationStatus, enumName: 'ActivationStatus' })
  status!: ActivationStatus;
  @ApiProperty({ format: 'date' }) joinedAt!: string;
}

/** A participating class of a weekly slot, with its group (name only). */
export class WsSlotParticipantDto {
  @ApiProperty() groupClassId!: string;
  @ApiProperty() group!: { id: string; name: string };
}

export class WsScheduleDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'The HOST class (whose slot it is)' })
  groupClassId!: string;
  @ApiProperty({
    type: [String],
    description:
      '«حصة مشتركة»: the other participating classes (empty for a normal slot)',
  })
  additionalGroupClassIds!: string[];
  @ApiProperty({
    type: [WsSlotParticipantDto],
    description:
      'Every participating class (host first) — a shared slot is listed once',
  })
  participants!: WsSlotParticipantDto[];
  @ApiProperty({ description: 'The room of this weekly slot' }) roomId!: string;
  @ApiProperty({ enum: Weekday, enumName: 'Weekday' }) dayOfWeek!: Weekday;
  @ApiProperty({ example: '17:00' }) startTime!: string;
  @ApiProperty({ example: '19:00' }) endTime!: string;
}

export class WsStudentDto {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ enum: Gender, enumName: 'Gender', nullable: true })
  gender!: Gender | null;
  @ApiPropertyOptional({ type: String, format: 'date', nullable: true })
  dateOfBirth!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) guardianPhone!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) photoUrl!:
    string | null;
  @ApiProperty({ format: 'date' }) registrationDate!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) groupClassId!:
    string | null;
  @ApiProperty({ enum: RecordStatus, enumName: 'RecordStatus' })
  status!: RecordStatus;
}

/** The student's own profile: also their address, email and CIN. */
export class WsOwnStudentDto extends WsStudentDto {
  @ApiPropertyOptional({ type: String, nullable: true }) address!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) email!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) cin!: string | null;
}

class WsBundleDto {
  @ApiProperty({ type: [WsBranchDto] }) branches!: WsBranchDto[];
  @ApiProperty({ type: [WsRoomDto] }) rooms!: WsRoomDto[];
  @ApiProperty({ type: [WsGroupDto] }) groups!: WsGroupDto[];
  @ApiProperty({ type: [WsGroupClassDto] }) groupClasses!: WsGroupClassDto[];
  @ApiProperty({ type: [WsTeacherDto] }) teachers!: WsTeacherDto[];
  @ApiProperty({ type: [WsScheduleDto] }) schedules!: WsScheduleDto[];
}

export class TeacherWorkspaceDto extends WsBundleDto {
  @ApiProperty({ type: WsTeacherDto, description: 'The signed-in teacher' })
  teacher!: WsTeacherDto;
  @ApiProperty({
    type: [WsStudentDto],
    description: 'Students currently placed in my (non-archived) classes',
  })
  students!: WsStudentDto[];
}

export class StudentWorkspaceDto extends WsBundleDto {
  @ApiProperty({ type: WsOwnStudentDto }) student!: WsOwnStudentDto;
}

/* ------------------------------ teacher notes ------------------------------ */

/** «ملاحظاتي»: the teacher's own private notes (most recently updated first). */
export class TeacherNoteQueryDto extends PaginationQueryDto {}

export class CreateTeacherNoteDto {
  @ApiProperty({
    maxLength: 2000,
    description:
      'The note — owner and dates are set by the server (no student, no date)',
  })
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'نص الملاحظة مطلوب' })
  @MaxLength(2000)
  content!: string;
}

export class UpdateTeacherNoteDto extends CreateTeacherNoteDto {}

/** A private note: its text and automatic dates only. */
export class TeacherNoteDto {
  @ApiProperty() id!: string;
  @ApiProperty() content!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class TeacherNoteListDto {
  @ApiProperty({ type: [TeacherNoteDto] }) data!: TeacherNoteDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/* ------------------------------ admin dashboard ------------------------------ */

class CountDto {
  @ApiProperty() total!: number;
  @ApiProperty() active!: number;
}

export class DashboardStatsDto {
  @ApiProperty({ format: 'date', description: 'Platform today (Africa/Tunis)' })
  today!: string;
  @ApiProperty() students!: CountDto & { registeredLast30Days: number };
  @ApiProperty() teachers!: CountDto;
  @ApiProperty() groups!: CountDto & { runningClasses: number };
  @ApiProperty() branches!: CountDto & { activeRooms: number };
  @ApiProperty() registrationRequests!: { pending: number };
  @ApiProperty() sessions!: { today: number; needsAttention: number };
}
