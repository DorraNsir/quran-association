import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginationMetaDto } from '../../common/pagination.js';
import { RecordStatus } from '../../generated/prisma/enums.js';
import { SearchQueryDto, trim } from '../shared.dto.js';

/** The pedagogical group only — branch, room, teachers and students belong to its classes. */
export class CreateGroupDto {
  @ApiProperty({ example: 'مجموعة ماهر' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;
  @ApiProperty({ example: 'أطفال 7–10 سنوات' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  audience!: string;
}

export class UpdateGroupDto extends PartialType(CreateGroupDto) {}

export class GroupListQueryDto extends SearchQueryDto {
  @ApiPropertyOptional({ enum: RecordStatus, enumName: 'RecordStatus' })
  @IsOptional()
  @IsEnum(RecordStatus)
  status?: RecordStatus;
}

export class GroupDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() audience!: string;
  @ApiProperty({ enum: RecordStatus, enumName: 'RecordStatus' })
  status!: RecordStatus;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() classesCount!: number;
  @ApiProperty() activeClassesCount!: number;
  @ApiProperty({ description: 'ACTIVE students across the group’s classes' })
  activeStudentsCount!: number;
}

export class GroupClassBriefDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: RecordStatus, enumName: 'RecordStatus' })
  status!: RecordStatus;
  @ApiProperty() branch!: { id: string; name: string };
  @ApiProperty() room!: { id: string; name: string };
  @ApiProperty() supervisor!: {
    id: string;
    firstName: string;
    lastName: string;
  };
  @ApiProperty() assistantsCount!: number;
  @ApiProperty() activeStudentsCount!: number;
}

export class GroupDetailDto extends GroupDto {
  @ApiProperty({ type: GroupClassBriefDto, isArray: true })
  classes!: GroupClassBriefDto[];
}

export class GroupListDto {
  @ApiProperty({ type: GroupDto, isArray: true }) data!: GroupDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}
