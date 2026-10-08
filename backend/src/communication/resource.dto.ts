import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { SearchQueryDto, trim } from '../academic/shared.dto.js';
import { PaginationMetaDto } from '../common/pagination.js';
import { ResourceType, ResourceVisibility } from '../generated/prisma/enums.js';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export const Title = () =>
  applyDecorators(
    ApiProperty({ maxLength: 200 }),
    Transform(trim),
    IsString(),
    MinLength(1, { message: 'العنوان مطلوب' }),
    MaxLength(200),
  );

/** A list of distinct ids (targets). */
export const IdList = (description: string, required = false) =>
  applyDecorators(
    (required ? ApiProperty : ApiPropertyOptional)({
      type: String,
      format: 'uuid',
      isArray: true,
      description,
    }),
    ...(required ? [] : [IsOptional()]),
    IsArray(),
    ...(required ? [ArrayMinSize(1)] : []),
    ArrayMaxSize(50),
    ArrayUnique(),
    IsUUID('all', { each: true }),
  );

/** http(s) only — never javascript:, data:, file: or a server path. */
export const SafeUrl = () =>
  applyDecorators(
    ApiPropertyOptional({
      example: 'https://www.youtube.com/watch?v=…',
      description: 'Required for VIDEO_LINK / EXTERNAL_LINK; http(s) only',
    }),
    IsOptional(),
    Transform(trim),
    IsUrl(
      { protocols: ['http', 'https'], require_protocol: true },
      { message: 'رابط غير صالح (http أو https فقط)' },
    ),
    MaxLength(2000),
  );

const Description = () =>
  applyDecorators(
    ApiPropertyOptional({ maxLength: 5000, description: 'Plain text' }),
    IsOptional(),
    Transform(trim),
    IsString(),
    MaxLength(5000),
  );

const TypeField = () =>
  applyDecorators(
    ApiProperty({
      enum: ResourceType,
      enumName: 'ResourceType',
      description:
        'VIDEO_LINK / EXTERNAL_LINK: supported (externalUrl). PDF / IMAGE / AUDIO / FILE: need file storage (Part 10.10) — rejected with RESOURCE_FILE_UPLOAD_UNAVAILABLE for now.',
    }),
    IsEnum(ResourceType),
  );

/** Teacher form: always GROUP_CLASS, toward the teacher's current classes. */
export class TeacherResourceDto {
  @Title() title!: string;
  @Description() description?: string;
  @TypeField() type!: ResourceType;
  @SafeUrl() externalUrl?: string;
  @IdList('Classes the teacher is currently assigned to', true)
  groupClassIds!: string[];
}

export class UpdateTeacherResourceDto extends PartialType(TeacherResourceDto) {}

/** Admin form: any visibility with matching targets. */
export class AdminResourceDto {
  @Title() title!: string;
  @Description() description?: string;
  @TypeField() type!: ResourceType;
  @SafeUrl() externalUrl?: string;
  @ApiProperty({
    enum: ResourceVisibility,
    enumName: 'ResourceVisibility',
    description:
      'ALL_STUDENTS (no targets) · GROUP (groupIds) · GROUP_CLASS (groupClassIds)',
  })
  @IsEnum(ResourceVisibility)
  visibility!: ResourceVisibility;
  @IdList('GROUP visibility only') groupIds?: string[];
  @IdList('GROUP_CLASS visibility only') groupClassIds?: string[];
}

export class UpdateAdminResourceDto extends PartialType(AdminResourceDto) {}

export class ResourceListQueryDto extends SearchQueryDto {
  @ApiPropertyOptional({ enum: ResourceType, enumName: 'ResourceType' })
  @IsOptional()
  @IsEnum(ResourceType)
  type?: ResourceType;
  @ApiPropertyOptional({
    enum: ResourceVisibility,
    enumName: 'ResourceVisibility',
  })
  @IsOptional()
  @IsEnum(ResourceVisibility)
  visibility?: ResourceVisibility;
  @ApiPropertyOptional({ format: 'uuid', description: 'Targets this class' })
  @IsOptional()
  @IsUUID()
  groupClassId?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Targets this group' })
  @IsOptional()
  @IsUUID()
  groupId?: string;
  @ApiPropertyOptional({ description: 'Only resources I published' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  mine?: boolean;
}

class AuthorDto {
  @ApiProperty() id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
}

class GroupTargetDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

export class ClassTargetDto {
  @ApiProperty() id!: string;
  @ApiProperty({ type: GroupTargetDto }) group!: GroupTargetDto;
  @ApiProperty({ type: GroupTargetDto }) branch!: GroupTargetDto;
}

export class ResourceFileDto {
  @ApiProperty() fileName!: string;
  @ApiPropertyOptional({ type: String, nullable: true })
  mimeType!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true })
  fileSize!: number | null;
}

export class ResourceDto {
  @ApiProperty() id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ enum: ResourceType, enumName: 'ResourceType' })
  type!: ResourceType;
  @ApiPropertyOptional({ type: String, nullable: true })
  externalUrl!: string | null;
  @ApiPropertyOptional({
    type: ResourceFileDto,
    nullable: true,
    description:
      'File metadata only — downloads arrive with file storage (Part 10.10)',
  })
  file!: ResourceFileDto | null;
  @ApiProperty({ enum: ResourceVisibility, enumName: 'ResourceVisibility' })
  visibility!: ResourceVisibility;
  @ApiProperty({ type: GroupTargetDto, isArray: true })
  groups!: GroupTargetDto[];
  @ApiProperty({ type: ClassTargetDto, isArray: true })
  groupClasses!: ClassTargetDto[];
  @ApiProperty({ type: AuthorDto }) publishedBy!: AuthorDto;
  @ApiProperty({ description: 'The caller may edit / delete it' })
  canManage!: boolean;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class ResourceListDto {
  @ApiProperty({ type: ResourceDto, isArray: true }) data!: ResourceDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}
