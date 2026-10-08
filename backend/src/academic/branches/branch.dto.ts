import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { OptionalPhone } from '../../common/contact-fields.js';
import { PaginationMetaDto } from '../../common/pagination.js';
import { ActivationStatus } from '../../generated/prisma/enums.js';
import { SearchQueryDto, trim } from '../shared.dto.js';

export class CreateBranchDto {
  @ApiProperty({ example: 'فرع حي الرياض' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  address!: string;
  @OptionalPhone() phone?: string | null;
}

/** Status changes go through PATCH …/:id/status. */
export class UpdateBranchDto extends PartialType(CreateBranchDto) {}

export class BranchListQueryDto extends SearchQueryDto {
  @ApiPropertyOptional({ enum: ActivationStatus, enumName: 'ActivationStatus' })
  @IsOptional()
  @IsEnum(ActivationStatus)
  status?: ActivationStatus;
}

export class BranchDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() address!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) phone!: string | null;
  @ApiProperty({ enum: ActivationStatus, enumName: 'ActivationStatus' })
  status!: ActivationStatus;
  @ApiProperty() roomsCount!: number;
  @ApiProperty() activeRoomsCount!: number;
  @ApiProperty({ description: 'Classes with status ACTIVE in this branch' })
  activeClassesCount!: number;
}

export class BranchListDto {
  @ApiProperty({ type: BranchDto, isArray: true }) data!: BranchDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}
