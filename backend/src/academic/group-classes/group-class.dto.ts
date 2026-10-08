import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
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

/** The operational class: one group, one branch, a room OF that branch, one supervisor, assistants. */
export class CreateGroupClassDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() groupId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() branchId!: string;
  @ApiProperty({ format: 'uuid', description: 'Must belong to branchId' })
  @IsUUID()
  roomId!: string;
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
 * Re-locate (branch + room) and/or re-staff (supervisor, full assistant list).
 * The group of a class never changes; status via PATCH …/status.
 */
export class UpdateGroupClassDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  roomId?: string;
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
  @ApiPropertyOptional({ format: 'uuid' })
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
