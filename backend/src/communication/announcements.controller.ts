import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AdminApi } from '../academic/admin-api.decorator.js';
import type { AuthPrincipal } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { StudentApi } from '../student-space/student-api.decorator.js';
import { TeacherApi } from '../teaching/teacher-api.decorator.js';
import {
  AdminAnnouncementDto,
  AnnouncementDto,
  AnnouncementListDto,
  AnnouncementListQueryDto,
  PublishResultDto,
  TeacherAnnouncementDto,
  UpdateAdminAnnouncementDto,
  UpdateTeacherAnnouncementDto,
} from './announcement.dto.js';
import { AnnouncementsService } from './announcements.service.js';

const WRITE_ERRORS =
  'Validation, ANNOUNCEMENT_TARGET_INVALID, INVALID_DATE_RANGE';
const UPDATE_CONFLICTS =
  'ANNOUNCEMENT_ARCHIVED, ANNOUNCEMENT_PUBLISHED_LOCKED (after publication only title, content and expiresAt change)';
const PUBLISH_DOC = {
  summary: 'Publish a DRAFT (explicit action) and notify its audience once',
  description:
    'Atomic: status PUBLISHED + one notification per reached active account (deduplicated, author excluded). Repeated/concurrent publish → 409, nobody notified twice. A future publishedAt = scheduled: readers (and the notification) see it from that day.',
};

@ApiTags('admin / announcements')
@AdminApi()
@Controller('admin/announcements')
export class AdminAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  @ApiOperation({
    summary:
      'All announcements, any status (filters: status, audience, class, branch, dates, search, mine)',
  })
  @ApiOkResponse({ type: AnnouncementListDto })
  list(
    @Query() query: AnnouncementListQueryDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<AnnouncementListDto> {
    return this.announcements.list(
      this.announcements.admin(user.userId),
      query,
    );
  }

  @Get(':id')
  @ApiOkResponse({ type: AnnouncementDto })
  @ApiNotFoundResponse({ description: 'ANNOUNCEMENT_NOT_FOUND' })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<AnnouncementDto> {
    return this.announcements.get(this.announcements.admin(user.userId), id);
  }

  @Post()
  @ApiOperation({
    summary:
      'Create a DRAFT (EVERYONE, TEACHERS, STUDENTS, classes or branches)',
  })
  @ApiCreatedResponse({ type: AnnouncementDto })
  @ApiBadRequestResponse({ description: WRITE_ERRORS })
  create(
    @Body() dto: AdminAnnouncementDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<AnnouncementDto> {
    return this.announcements.createAsAdmin(user.userId, dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: AnnouncementDto })
  @ApiBadRequestResponse({ description: WRITE_ERRORS })
  @ApiNotFoundResponse({ description: 'ANNOUNCEMENT_NOT_FOUND' })
  @ApiConflictResponse({ description: UPDATE_CONFLICTS })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminAnnouncementDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<AnnouncementDto> {
    return this.announcements.update(
      this.announcements.admin(user.userId),
      id,
      dto,
    );
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation(PUBLISH_DOC)
  @ApiOkResponse({ type: PublishResultDto })
  @ApiBadRequestResponse({ description: 'ANNOUNCEMENT_TARGET_INVALID' })
  @ApiNotFoundResponse({ description: 'ANNOUNCEMENT_NOT_FOUND' })
  @ApiConflictResponse({
    description: 'ANNOUNCEMENT_PUBLISH_CONFLICT, ANNOUNCEMENT_EXPIRED',
  })
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<PublishResultDto> {
    return this.announcements.publish(
      this.announcements.admin(user.userId),
      id,
    );
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a PUBLISHED announcement (hidden, kept)' })
  @ApiOkResponse({ type: AnnouncementDto })
  @ApiNotFoundResponse({ description: 'ANNOUNCEMENT_NOT_FOUND' })
  @ApiConflictResponse({ description: 'ANNOUNCEMENT_NOT_PUBLISHED' })
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<AnnouncementDto> {
    return this.announcements.archive(
      this.announcements.admin(user.userId),
      id,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete (targets and its notifications too)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'ANNOUNCEMENT_NOT_FOUND' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<void> {
    return this.announcements.remove(this.announcements.admin(user.userId), id);
  }
}

@ApiTags('teacher / announcements')
@TeacherApi()
@Controller('teacher/announcements')
export class TeacherAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Announcements for me now (EVERYONE, TEACHERS, my current classes / branches) plus my own',
  })
  @ApiOkResponse({ type: AnnouncementListDto })
  async list(
    @Query() query: AnnouncementListQueryDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<AnnouncementListDto> {
    return this.announcements.list(
      await this.announcements.teacher(user.userId),
      query,
    );
  }

  @Get(':id')
  @ApiOkResponse({ type: AnnouncementDto })
  @ApiNotFoundResponse({
    description: 'ANNOUNCEMENT_NOT_FOUND (also when not visible to me)',
  })
  async get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<AnnouncementDto> {
    return this.announcements.get(
      await this.announcements.teacher(user.userId),
      id,
    );
  }

  @Post()
  @ApiOperation({
    summary: 'Create a DRAFT for my current classes (SPECIFIC_GROUP_CLASSES)',
  })
  @ApiCreatedResponse({ type: AnnouncementDto })
  @ApiBadRequestResponse({ description: WRITE_ERRORS })
  @ApiForbiddenResponse({ description: 'ANNOUNCEMENT_CLASS_ACCESS_DENIED' })
  create(
    @Body() dto: TeacherAnnouncementDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<AnnouncementDto> {
    return this.announcements.createAsTeacher(user.userId, dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: AnnouncementDto })
  @ApiBadRequestResponse({ description: WRITE_ERRORS })
  @ApiForbiddenResponse({
    description:
      'ANNOUNCEMENT_EDIT_FORBIDDEN, ANNOUNCEMENT_CLASS_ACCESS_DENIED',
  })
  @ApiNotFoundResponse({ description: 'ANNOUNCEMENT_NOT_FOUND' })
  @ApiConflictResponse({ description: UPDATE_CONFLICTS })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeacherAnnouncementDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<AnnouncementDto> {
    return this.announcements.update(
      await this.announcements.teacher(user.userId),
      id,
      dto,
    );
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation(PUBLISH_DOC)
  @ApiOkResponse({ type: PublishResultDto })
  @ApiForbiddenResponse({
    description:
      'ANNOUNCEMENT_EDIT_FORBIDDEN, ANNOUNCEMENT_CLASS_ACCESS_DENIED',
  })
  @ApiNotFoundResponse({ description: 'ANNOUNCEMENT_NOT_FOUND' })
  @ApiConflictResponse({
    description: 'ANNOUNCEMENT_PUBLISH_CONFLICT, ANNOUNCEMENT_EXPIRED',
  })
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<PublishResultDto> {
    return this.announcements.publish(
      await this.announcements.teacher(user.userId),
      id,
    );
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AnnouncementDto })
  @ApiForbiddenResponse({ description: 'ANNOUNCEMENT_EDIT_FORBIDDEN' })
  @ApiNotFoundResponse({ description: 'ANNOUNCEMENT_NOT_FOUND' })
  @ApiConflictResponse({ description: 'ANNOUNCEMENT_NOT_PUBLISHED' })
  async archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<AnnouncementDto> {
    return this.announcements.archive(
      await this.announcements.teacher(user.userId),
      id,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'ANNOUNCEMENT_EDIT_FORBIDDEN' })
  @ApiNotFoundResponse({ description: 'ANNOUNCEMENT_NOT_FOUND' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<void> {
    return this.announcements.remove(
      await this.announcements.teacher(user.userId),
      id,
    );
  }
}

@ApiTags('student / announcements')
@StudentApi()
@Controller('student/announcements')
export class StudentAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Active announcements for me (EVERYONE, STUDENTS, my current class / branch)',
  })
  @ApiOkResponse({ type: AnnouncementListDto })
  list(
    @Query() query: AnnouncementListQueryDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<AnnouncementListDto> {
    return this.announcements.listForStudent(user.userId, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: AnnouncementDto })
  @ApiNotFoundResponse({
    description: 'ANNOUNCEMENT_NOT_FOUND (also drafts, archived, not mine)',
  })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<AnnouncementDto> {
    return this.announcements.getForStudent(user.userId, id);
  }
}
