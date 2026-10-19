import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { RecordStatus, Weekday } from '../generated/prisma/enums.js';
import { IsTimeOfDay } from './time.js';

/** «الحصص المشتركة»: at most this many additional classes in one lesson. */
export const MAX_ADDITIONAL_CLASSES = 10;

/**
 * Additional classes of ONE shared lesson (weekly slot or session): ids of
 * other classes with the same supervisor, in the same branch (checked by the
 * API). Repetitions and the host itself are refused with an Arabic message.
 */
export function AdditionalClasses(description: string): PropertyDecorator {
  return (target, key) => {
    ApiPropertyOptional({
      type: String,
      format: 'uuid',
      isArray: true,
      description,
    })(target, key);
    IsOptional()(target, key);
    IsArray()(target, key);
    ArrayMaxSize(MAX_ADDITIONAL_CLASSES)(target, key);
    IsUUID('all', { each: true })(target, key);
  };
}

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
  @AdditionalClasses(
    'Shared slot: other classes taught together with this class (same supervisor, same branch, all active); empty = a normal slot',
  )
  additionalGroupClassIds?: string[];
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
  @AdditionalClasses(
    "Replaces the slot's additional classes ([] = a normal slot again); its upcoming lessons without attendance follow — a removed class gets no replacement lesson. The host class is not editable",
  )
  additionalGroupClassIds?: string[];
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
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Slots this class takes part in (host or additional class)',
  })
  @IsOptional()
  @IsUUID()
  groupClassId?: string;
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Supervisor or assistant (of any participating class)',
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
  @ApiProperty({
    type: ScheduleClassDto,
    description: 'The HOST class (whose slot it is)',
  })
  groupClass!: ScheduleClassDto;
  @ApiProperty({
    type: ScheduleClassDto,
    isArray: true,
    description:
      '«حصة مشتركة»: the other participating classes (empty for a normal slot)',
  })
  additionalClasses!: ScheduleClassDto[];
}

/** 409 body: stable code + Arabic message + the colliding slots/sessions. */
export class SchedulingConflictDto {
  @ApiProperty({ example: 'ROOM_SCHEDULE_CONFLICT' }) code!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ isArray: true, type: Object }) conflicts!: object[];
}
