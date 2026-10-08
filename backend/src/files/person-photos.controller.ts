import {
  Body,
  Controller,
  Delete,
  Injectable,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';

import { AdminApi } from '../academic/admin-api.decorator.js';
import type { AuthPrincipal } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { notFound } from '../common/errors.js';
import { FilePurpose } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SetPhotoDto } from './file.dto.js';
import { FilesService, privateFileUrl } from './files.service.js';

class PersonPhotoDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  photoFileId!: string | null;
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Authenticated path (/api/files/:id)',
  })
  photoUrl!: string | null;
  @ApiProperty() personId!: string;
}

/**
 * Profile photos of students and teachers, managed by ADMINs (as in the
 * frontend forms). Stored on the canonical Person: a PROFILE_PHOTO image,
 * private (visible to the person, the admins and their class audience
 * through GET /api/files/:id). Replacing/removing keeps the old file until
 * the cleanup finds it unused.
 */
@Injectable()
export class PersonPhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  async set(
    owner: 'student' | 'teacher',
    id: string,
    fileId: string | null,
    adminUserId: string,
  ): Promise<PersonPhotoDto> {
    return this.prisma.$transaction(async (tx) => {
      const row =
        owner === 'student'
          ? await tx.student.findUnique({
              where: { id },
              select: { personId: true },
            })
          : await tx.teacher.findUnique({
              where: { id },
              select: { personId: true },
            });
      if (!row)
        throw owner === 'student'
          ? notFound('STUDENT_NOT_FOUND', 'الطالب غير موجود')
          : notFound('TEACHER_NOT_FOUND', 'المعلم غير موجود');
      await tx.$queryRaw`SELECT id FROM persons WHERE id = ${row.personId}::uuid FOR UPDATE`;
      if (fileId)
        await this.files.assertAttachable(
          tx,
          fileId,
          FilePurpose.PROFILE_PHOTO,
          { userId: adminUserId, isAdmin: true },
          { kinds: ['IMAGE'] },
        );
      const person = await tx.person.update({
        where: { id: row.personId },
        data: {
          photoFileId: fileId,
          photoUrl: fileId ? privateFileUrl(fileId) : null,
        },
        select: { id: true, photoFileId: true, photoUrl: true },
      });
      return {
        personId: person.id,
        photoFileId: person.photoFileId,
        photoUrl: person.photoUrl,
      };
    });
  }
}

const ERRORS = {
  bad: {
    description:
      'FILE_PURPOSE_MISMATCH (not a PROFILE_PHOTO), FILE_TYPE_NOT_ALLOWED',
  },
  missing: {
    description: 'STUDENT_NOT_FOUND / TEACHER_NOT_FOUND, FILE_NOT_FOUND',
  },
};

@ApiTags('admin / profile photos')
@AdminApi()
@Controller('admin')
export class PersonPhotosController {
  constructor(private readonly photos: PersonPhotosService) {}

  @Put('students/:id/photo')
  @ApiOperation({ summary: "Set a student's photo (PROFILE_PHOTO upload)" })
  @ApiOkResponse({ type: PersonPhotoDto })
  @ApiBadRequestResponse(ERRORS.bad)
  @ApiNotFoundResponse(ERRORS.missing)
  setStudent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPhotoDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.photos.set('student', id, dto.fileId, user.userId);
  }

  @Delete('students/:id/photo')
  @ApiOperation({ summary: "Remove a student's photo" })
  @ApiOkResponse({ type: PersonPhotoDto })
  @ApiNotFoundResponse(ERRORS.missing)
  removeStudent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.photos.set('student', id, null, user.userId);
  }

  @Put('teachers/:id/photo')
  @ApiOperation({ summary: "Set a teacher's photo (PROFILE_PHOTO upload)" })
  @ApiOkResponse({ type: PersonPhotoDto })
  @ApiBadRequestResponse(ERRORS.bad)
  @ApiNotFoundResponse(ERRORS.missing)
  setTeacher(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPhotoDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.photos.set('teacher', id, dto.fileId, user.userId);
  }

  @Delete('teachers/:id/photo')
  @ApiOperation({ summary: "Remove a teacher's photo" })
  @ApiOkResponse({ type: PersonPhotoDto })
  @ApiNotFoundResponse(ERRORS.missing)
  removeTeacher(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.photos.set('teacher', id, null, user.userId);
  }
}
