import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

import {
  PaginationMetaDto,
  PaginationQueryDto,
} from '../../common/pagination.js';
import { RecordStatus } from '../../generated/prisma/enums.js';
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

/**
 * The operational class: one group, one branch, one supervisor, assistants.
 * Rooms are chosen per weekly slot (POST …/schedules with roomId).
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
