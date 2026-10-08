import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';

import { RecordStatus, Weekday } from '../generated/prisma/enums.js';
import { IsTimeOfDay } from './time.js';

/** A recurring weekly slot; branch, room and teachers come from the class. */
export class CreateWeeklyScheduleDto {
  @ApiProperty({ enum: Weekday, enumName: 'Weekday' })
  @IsEnum(Weekday)
  dayOfWeek!: Weekday;
  @IsTimeOfDay({ description: 'Local time (Africa/Tunis)' }) startTime!: string;
  @IsTimeOfDay({ description: 'Local time, strictly after startTime' })
  endTime!: string;
}

export class UpdateWeeklyScheduleDto {
  @ApiPropertyOptional({ enum: Weekday, enumName: 'Weekday' })
  @IsOptional()
  @IsEnum(Weekday)
  dayOfWeek?: Weekday;
  @IsTimeOfDay({ optional: true }) startTime?: string;
  @IsTimeOfDay({ optional: true }) endTime?: string;
}

/** Calendar week view across classes (bounded by the number of weekly slots — not paginated). */
export class WeeklyScheduleQueryDto {
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
  groupId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  groupClassId?: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Supervisor or assistant',
  })
  @IsOptional()
  @IsUUID()
  teacherId?: string;
  @ApiPropertyOptional({ enum: Weekday, enumName: 'Weekday' })
  @IsOptional()
  @IsEnum(Weekday)
  dayOfWeek?: Weekday;
  @ApiPropertyOptional({
    description: 'Include slots of non-running classes (default: running only)',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  includeInactive?: boolean;
}

export class NamedRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class TeacherBriefDto {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
}

/** What a calendar cell needs: the slot, its class, group, branch, room and team. */
export class ScheduleClassDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: RecordStatus, enumName: 'RecordStatus' })
  status!: RecordStatus;
  @ApiProperty({ type: NamedRefDto }) group!: NamedRefDto;
  @ApiProperty({ type: NamedRefDto }) branch!: NamedRefDto;
  @ApiProperty({ type: NamedRefDto }) room!: NamedRefDto;
  @ApiProperty({ type: TeacherBriefDto }) supervisor!: TeacherBriefDto;
  @ApiProperty({ type: TeacherBriefDto, isArray: true })
  assistants!: TeacherBriefDto[];
}

export class WeeklyScheduleDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: Weekday, enumName: 'Weekday' }) dayOfWeek!: Weekday;
  @ApiProperty({ example: '17:00' }) startTime!: string;
  @ApiProperty({ example: '19:00' }) endTime!: string;
  @ApiProperty({ type: ScheduleClassDto }) groupClass!: ScheduleClassDto;
}

/** 409 body: stable code + Arabic message + the colliding slots/sessions. */
export class SchedulingConflictDto {
  @ApiProperty({ example: 'ROOM_SCHEDULE_CONFLICT' }) code!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ isArray: true, type: Object }) conflicts!: object[];
}
