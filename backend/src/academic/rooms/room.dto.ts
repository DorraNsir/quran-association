import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { PaginationMetaDto } from '../../common/pagination.js';
import { ActivationStatus } from '../../generated/prisma/enums.js';
import { SearchQueryDto, trim } from '../shared.dto.js';

export class CreateRoomDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() branchId!: string;
  @ApiProperty({ example: 'القاعة 1' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;
}

/** A room never changes branch (classes reference the pair room + branch). */
export class UpdateRoomDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;
}

export class RoomListQueryDto extends SearchQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
  @ApiPropertyOptional({ enum: ActivationStatus, enumName: 'ActivationStatus' })
  @IsOptional()
  @IsEnum(ActivationStatus)
  status?: ActivationStatus;
}

export class RoomBranchDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ActivationStatus, enumName: 'ActivationStatus' })
  status!: ActivationStatus;
}

export class RoomDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ActivationStatus, enumName: 'ActivationStatus' })
  status!: ActivationStatus;
  @ApiProperty({ type: RoomBranchDto }) branch!: RoomBranchDto;
  @ApiProperty({ description: 'Classes with status ACTIVE using this room' })
  activeClassesCount!: number;
}

export class RoomListDto {
  @ApiProperty({ type: RoomDto, isArray: true }) data!: RoomDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}
