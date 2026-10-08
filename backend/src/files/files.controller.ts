import {
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { AdminApi } from '../academic/admin-api.decorator.js';
import type { AuthPrincipal } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import {
  CleanupResultDto,
  DownloadQueryDto,
  StoredFileDto,
  UploadBodyDto,
  UploadQueryDto,
} from './file.dto.js';
import {
  fileNotFound,
  FilesService,
  type IncomingFile,
} from './files.service.js';
import { sendFile } from './send-file.js';
import { UploadPermissionGuard } from './upload-permission.guard.js';

const PRODUCES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'audio/mpeg',
  'audio/mp4',
];

@ApiTags('files')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing / invalid access token' })
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @UseGuards(UploadPermissionGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload one file for a purpose (private until attached)',
    description:
      'multipart/form-data, field `file`; ?purpose= (and ?groupClassId= for a teacher resource) are checked BEFORE the body is accepted. Returns an opaque id to attach through the target entity (CMS item, settings logo, resource, profile photo). Unattached uploads are removed after FILE_UNREFERENCED_RETENTION_HOURS.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadBodyDto })
  @ApiCreatedResponse({ type: StoredFileDto })
  @ApiBadRequestResponse({
    description:
      'FILE_PURPOSE_INVALID, FILE_CLASS_INVALID, FILE_CLASS_REQUIRED, FILE_REQUIRED, FILE_TYPE_NOT_ALLOWED, FILE_TYPE_MISMATCH',
  })
  @ApiForbiddenResponse({
    description: 'FILE_PURPOSE_FORBIDDEN, FILE_CLASS_ACCESS_DENIED',
  })
  @ApiPayloadTooLargeResponse({ description: 'FILE_TOO_LARGE' })
  upload(
    @Query() query: UploadQueryDto,
    @UploadedFile() file: IncomingFile | undefined,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<StoredFileDto> {
    return this.files.upload(
      file,
      query.purpose,
      query.groupClassId,
      user.userId,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Download a file I am allowed to see (streamed)',
    description:
      'Authorized from what the file is attached to and my CURRENT permissions (admin; uploader; resource readers; profile-photo audience; public content). Otherwise 404 — the id alone grants nothing. Cache-Control: private, no-store.',
  })
  @ApiProduces(...PRODUCES)
  @ApiOkResponse({ description: 'The file bytes' })
  @ApiNotFoundResponse({
    description:
      'FILE_NOT_FOUND (also when not allowed), FILE_CONTENT_UNAVAILABLE',
  })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: DownloadQueryDto,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @CurrentUser() user: AuthPrincipal,
    @Res() res: Response,
  ) {
    if (!(await this.files.canAccess(id, user))) throw fileNotFound();
    sendFile(res, await this.files.openContent(id), {
      public: false,
      download: query.download,
      ifNoneMatch,
    });
  }
}

@ApiTags('public / files')
@Public()
@Controller('public/files')
export class PublicFilesController {
  constructor(private readonly files: FilesService) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Image of currently public website content (no authentication)',
    description:
      'Only CMS images / the logo referenced by at least one currently public item. Unattached, hidden, draft or future content, profile photos and resources: 404. Cache-Control: public, max-age=300 (+ ETag).',
  })
  @ApiProduces('image/jpeg', 'image/png', 'image/webp')
  @ApiOkResponse({ description: 'The image bytes' })
  @ApiNotFoundResponse({ description: 'FILE_NOT_FOUND' })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res() res: Response,
  ) {
    if (!(await this.files.isPublic(id))) throw fileNotFound();
    sendFile(res, await this.files.openContent(id), {
      public: true,
      ifNoneMatch,
    });
  }
}

@ApiTags('admin / files')
@AdminApi()
@Controller('admin/files')
export class AdminFilesController {
  constructor(private readonly files: FilesService) {}

  @Post('cleanup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run the cleanup of unreferenced files now',
    description:
      'Removes files referenced by nothing and older than FILE_UNREFERENCED_RETENTION_HOURS, orphan bytes and abandoned temporary uploads. Also runs every FILE_CLEANUP_INTERVAL_MINUTES.',
  })
  @ApiOkResponse({ type: CleanupResultDto })
  cleanup(): Promise<CleanupResultDto> {
    return this.files.cleanup();
  }
}
