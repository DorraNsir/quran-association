import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';

import { RecordStatus, Weekday } from '../generated/prisma/enums.js';
import { IsTimeOfDay } from './time.js';

/**
 * A recurring weekly slot with ITS OWN room (a room of the class's branch);
 * branch and teachers come from the class.
 */
export class CreateWeeklyScheduleDto {
  @ApiProperty({ enum: Weekday, enumName: 'Weekday' })
  @IsEnum(Weekday)
  dayOfWeek!: Weekday;
  @IsTimeOfDay({ description: 'Local time (Africa/Tunis)' }) startTime!: string;
  @IsTimeOfDay({ description: 'Local time, strictly after startTime' })
  endTime!: string;
  @ApiProperty({
    format: 'uuid',
    description: "A room of the class's branch (active)",
  })
  @IsUUID()
  roomId!: string;
}

export class UpdateWeeklyScheduleDto {
  @ApiPropertyOptional({ enum: Weekday, enumName: 'Weekday' })
  @IsOptional()
  @IsEnum(Weekday)
  dayOfWeek?: Weekday;
  @IsTimeOfDay({ optional: true }) startTime?: string;
  @IsTimeOfDay({ optional: true }) endTime?: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      "Another room of the class's branch; the slot's upcoming scheduled sessions (no attendance yet) move with it",
  })
  @IsOptional()
  @IsUUID()
  roomId?: string;
}

/** Calendar week view across classes (bounded by the number of weekly slots — not paginated). */
export class WeeklyScheduleQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Slots taught in this room',
  })
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

/** What a calendar cell needs: the slot's class, group, branch and team (the room is the slot's). */
export class ScheduleClassDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: RecordStatus, enumName: 'RecordStatus' })
  status!: RecordStatus;
  @ApiProperty({ type: NamedRefDto }) group!: NamedRefDto;
  @ApiProperty({ type: NamedRefDto }) branch!: NamedRefDto;
  @ApiProperty({ type: TeacherBriefDto }) supervisor!: TeacherBriefDto;
  @ApiProperty({ type: TeacherBriefDto, isArray: true })
  assistants!: TeacherBriefDto[];
}

export class WeeklyScheduleDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: Weekday, enumName: 'Weekday' }) dayOfWeek!: Weekday;
  @ApiProperty({ example: '17:00' }) startTime!: string;
  @ApiProperty({ example: '19:00' }) endTime!: string;
  @ApiProperty({ type: NamedRefDto, description: 'The room of this slot' })
  room!: NamedRefDto;
  @ApiProperty({ type: ScheduleClassDto }) groupClass!: ScheduleClassDto;
}

/** 409 body: stable code + Arabic message + the colliding slots/sessions. */
export class SchedulingConflictDto {
  @ApiProperty({ example: 'ROOM_SCHEDULE_CONFLICT' }) code!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ isArray: true, type: Object }) conflicts!: object[];
}
