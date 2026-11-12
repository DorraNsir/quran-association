import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '../../common/pagination.js';
import { RecordStatus, Weekday } from '../../generated/prisma/enums.js';
import { IsTimeOfDay } from '../../scheduling/time.js';
import { ClassRefDto } from '../teachers/teacher.dto.js';

const AssistantIds = () =>
  applyDecorators(
    ApiPropertyOptional({
      type: String,
      format: 'uuid',
      isArray: true,
      description: '0..N assistant teachers (unique; never the supervisor)',
    }),
    IsOptional(),
    IsArray(),
    ArrayUnique({ message: 'لا يمكن تكرار المعلم المساعد' }),
    IsUUID('all', { each: true }),
  );

/** A weekly slot of the class and the room it moves to. */
export class ScheduleRoomDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() scheduleId!: string;
  @ApiProperty({
    format: 'uuid',
    description: "A room of the class's (new) branch",
  })
  @IsUUID()
  roomId!: string;
}

/** One weekly slot as the class form shows it: an existing one (id) or a new one. */
export class ClassSlotDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'A weekly slot this class hosts (omitted: a new slot)',
  })
  @IsOptional()
  @IsUUID()
  id?: string;
  @ApiProperty({ enum: Weekday, enumName: 'Weekday' })
  @IsEnum(Weekday)
  dayOfWeek!: Weekday;
  @IsTimeOfDay({ description: 'Local time (Africa/Tunis)' }) startTime!: string;
  @IsTimeOfDay({ description: 'Local time, strictly after startTime' })
  endTime!: string;
  @ApiProperty({ format: 'uuid', description: "A room of the class's branch" })
  @IsUUID()
  roomId!: string;
}

const ClassSlots = (description: string, optional = false) =>
  applyDecorators(
    (optional ? ApiPropertyOptional : ApiProperty)({
      type: ClassSlotDto,
      isArray: true,
      description,
    }),
    ...(optional ? [IsOptional()] : []),
    IsArray(),
    ValidateNested({ each: true }),
    Type(() => ClassSlotDto),
  );

/**
 * The operational class: one group, one branch, one supervisor, assistants.
 * Rooms are chosen per weekly slot (POST …/schedules with roomId, or `slots`).
 */
export class CreateGroupClassDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() groupId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() branchId!: string;
  @ApiProperty({ format: 'uuid', description: 'The ONE supervising teacher' })
  @IsUUID()
  supervisorId!: string;
  @AssistantIds() assistantTeacherIds?: string[];
  @ApiPropertyOptional({
    enum: RecordStatus,
    enumName: 'RecordStatus',
    default: 'ACTIVE',
  })
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
  @ClassSlots(
    'Its weekly slots, created with it in the same transaction (new slots: no id)',
    true,
  )
  slots?: ClassSlotDto[];
}

/**
 * «حفظ القسم»: the class form's whole desired state, applied in ONE
 * transaction (all or nothing). Slots: the full list of the slots this class
 * hosts — an existing one keeps its id, a missing one is removed, one without
 * id is created. A shared slot keeps its additional classes.
 */
export class SaveGroupClassDto {
  @ApiProperty({
    description:
      'The class version the form was opened with: a newer one (another save meanwhile) is refused with 409 GROUP_CLASS_CHANGED',
  })
  @IsInt()
  @Min(1)
  version!: number;
  @ApiProperty({ format: 'uuid' }) @IsUUID() branchId!: string;
  @ApiProperty({ enum: RecordStatus, enumName: 'RecordStatus' })
  @IsEnum(RecordStatus)
  status!: RecordStatus;
  @ApiProperty({ format: 'uuid', description: 'The ONE supervising teacher' })
  @IsUUID()
  supervisorId!: string;
  @ApiProperty({
    type: String,
    format: 'uuid',
    isArray: true,
    description: 'The full list of assistant teachers (never the supervisor)',
  })
  @IsArray()
  @ArrayUnique({ message: 'لا يمكن تكرار المعلم المساعد' })
  @IsUUID('all', { each: true })
  assistantTeacherIds!: string[];
  @ClassSlots('The full list of the weekly slots this class hosts')
  slots!: ClassSlotDto[];
}

/**
 * Re-locate (branch, with a new room for each weekly slot) and/or re-staff
 * (supervisor, full assistant list). The group never changes; status via
 * PATCH …/status.
 */
export class UpdateGroupClassDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'New branch: every existing weekly slot must get a room of it in scheduleRooms (same request, atomic)',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;
  @ApiPropertyOptional({
    type: ScheduleRoomDto,
    isArray: true,
    description:
      "New rooms of weekly slots (rooms of the class's branch); their upcoming scheduled sessions move with them",
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleRoomDto)
  scheduleRooms?: ScheduleRoomDto[];
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  supervisorId?: string;
  @AssistantIds() assistantTeacherIds?: string[];
}

export class GroupClassListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  groupId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Classes with a weekly slot in this room',
  })
  @IsOptional()
  @IsUUID()
  roomId?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Supervisor only' })
  @IsOptional()
  @IsUUID()
  supervisorId?: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Supervisor OR assistant (explicit assignment)',
  })
  @IsOptional()
  @IsUUID()
  teacherId?: string;
  @ApiPropertyOptional({ enum: RecordStatus, enumName: 'RecordStatus' })
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}

export class TeacherRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) photoUrl!:
    string | null;
  @ApiProperty() status!: string;
}

export class GroupClassDto extends ClassRefDto {
  @ApiProperty({ type: TeacherRefDto }) supervisor!: TeacherRefDto;
  @ApiProperty({ type: TeacherRefDto, isArray: true })
  assistants!: TeacherRefDto[];
  @ApiProperty() activeStudentsCount!: number;
  @ApiProperty({
    description:
      'Optimistic concurrency of the class form (PUT …/save): any change of the class, its assistants or its weekly slots increases it',
  })
  version!: number;
}

export class ClassStudentDto {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) photoUrl!:
    string | null;
  @ApiProperty({ enum: RecordStatus, enumName: 'RecordStatus' })
  status!: RecordStatus;
}

export class GroupClassDetailDto extends GroupClassDto {
  @ApiProperty({
    type: ClassStudentDto,
    isArray: true,
    description: 'Current (non-archived) students',
  })
  students!: ClassStudentDto[];
}

export class GroupClassListDto {
  @ApiProperty({ type: GroupClassDto, isArray: true }) data!: GroupClassDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

/* ─────────────── «نقل القسم إلى مجموعة أخرى» ─────────────── */

export class MoveGroupClassDto {
  @ApiProperty({ format: 'uuid', description: 'The destination group' })
  @IsUUID()
  groupId!: string;
}

/** Why a class cannot be moved (it never had students nor activity, or it would stop / start running) */
export const MOVE_BLOCKS = [
  'SAME_GROUP',
  'DESTINATION_ARCHIVED',
  'RUNNING_STATE_CHANGES',
  'HAS_STUDENTS',
  'HAS_ATTENDANCE',
  'HAS_COMPLETED_SESSIONS',
  'HAS_WORK',
  'HAS_TEACHER_NOTES',
  'HAS_ONBOARDING_SUBMISSIONS',
] as const;
export type MoveBlock = (typeof MOVE_BLOCKS)[number];

export class MoveBlockDto {
  @ApiProperty({ enum: MOVE_BLOCKS }) code!: MoveBlock;
  @ApiProperty({
    description: 'How many records cause it (0 when not countable)',
  })
  count!: number;
  @ApiProperty({ description: 'Arabic explanation' }) message!: string;
}

class MoveGroupRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: RecordStatus, enumName: 'RecordStatus' })
  status!: RecordStatus;
}

class MoveKeepsDto {
  @ApiProperty({ description: 'Weekly slots it hosts or shares' })
  weeklySchedules!: number;
  @ApiProperty({
    description: 'Planned sessions (no activity) it takes part in',
  })
  plannedSessions!: number;
  @ApiProperty({ description: 'Supervisor + assistants' }) teachers!: number;
  @ApiProperty({ description: 'Onboarding links of the class' })
  onboardingLinks!: number;
}

/** What «نقل القسم إلى مجموعة أخرى» would do (read-only) */
export class MoveGroupClassPreviewDto {
  @ApiProperty() groupClassId!: string;
  @ApiProperty({ type: MoveGroupRefDto }) from!: MoveGroupRefDto;
  @ApiProperty({ type: MoveGroupRefDto }) to!: MoveGroupRefDto;
  @ApiProperty() eligible!: boolean;
  @ApiProperty({ type: MoveBlockDto, isArray: true }) blocks!: MoveBlockDto[];
  @ApiProperty({
    type: MoveKeepsDto,
    description: 'What stays attached to the class (same id)',
  })
  keeps!: MoveKeepsDto;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'The destination group fee for the current academic year (charged to its future students)',
  })
  destinationFee!: string | null;
}
