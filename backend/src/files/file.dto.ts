import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';

import { FilePurpose } from '../generated/prisma/enums.js';

export class UploadQueryDto {
  @ApiProperty({
    enum: FilePurpose,
    enumName: 'FilePurpose',
    description:
      'ASSOCIATION_LOGO / CMS_IMAGE / PROFILE_PHOTO: ADMIN, images (JPEG, PNG, WebP). EDUCATIONAL_RESOURCE: ADMIN or a TEACHER for a currently assigned class (groupClassId required for teachers); images, PDF, MP3, M4A.',
  })
  @IsEnum(FilePurpose)
  purpose!: FilePurpose;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'EDUCATIONAL_RESOURCE: the class it is uploaded for',
  })
  @IsOptional()
  @IsUUID()
  groupClassId?: string;
}

export class UploadBodyDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description:
      'One file. Type detected from its content (JPEG, PNG, WebP, PDF, MP3, M4A — never SVG/HTML/archives); the declared MIME type and extension must agree. Limits: FILE_MAX_IMAGE_BYTES (5 MB), FILE_MAX_PDF_BYTES (15 MB), FILE_MAX_AUDIO_BYTES (25 MB).',
  })
  file!: unknown;
}

export class StoredFileDto {
  @ApiProperty({
    description: 'Opaque id — attach it through the target entity',
  })
  id!: string;
  @ApiProperty({ enum: FilePurpose, enumName: 'FilePurpose' })
  purpose!: FilePurpose;
  @ApiProperty({ example: 'application/pdf', description: 'Detected type' })
  mimeType!: string;
  @ApiProperty({ description: 'Bytes' }) size!: number;
  @ApiProperty({ description: 'Sanitized display name' }) originalName!: string;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({
    example: '/api/files/0199…',
    description:
      'Authenticated download path (private until attached to public content)',
  })
  url!: string;
}

export class DownloadQueryDto {
  @ApiPropertyOptional({
    description: 'true → Content-Disposition: attachment (default inline)',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  download?: boolean;
}

export class CleanupResultDto {
  @ApiProperty({ description: 'Unreferenced files (rows + bytes) removed' })
  deletedFiles!: number;
  @ApiProperty({ description: 'Stored bytes without a database row removed' })
  orphanBytes!: number;
  @ApiProperty({ description: 'Abandoned temporary uploads removed' })
  staleTemp!: number;
}

export class SetPhotoDto {
  @ApiProperty({
    format: 'uuid',
    description: 'A PROFILE_PHOTO image uploaded through POST /api/files',
  })
  @IsUUID()
  fileId!: string;
}
