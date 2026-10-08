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
  ScheduleAnnouncementDto,
  TeacherAnnouncementDto,
  UpdateAdminAnnouncementDto,
  UpdateTeacherAnnouncementDto,
} from './announcement.dto.js';
import { AnnouncementsService } from './announcements.service.js';

const WRITE_ERRORS =
  'Validation, ANNOUNCEMENT_TARGET_INVALID, INVALID_DATE_RANGE, SCHEDULED_AT_INVALID, SCHEDULE_IN_PAST, SCHEDULE_TOO_FAR';
const UPDATE_CONFLICTS =
  'ANNOUNCEMENT_ARCHIVED, ANNOUNCEMENT_PUBLISHED_LOCKED (after publication only title, content and expiresAt change; DRAFT and SCHEDULED are fully editable)';
const PUBLISH_DOC = {
  summary: 'Publish NOW a DRAFT (admins: also a SCHEDULED one, ahead of time)',
  description:
    'Atomic: status PUBLISHED, actual instant, and one notification per account reached now (deduplicated, author excluded). Repeated/concurrent publish → 409 ANNOUNCEMENT_PUBLISH_CONFLICT, nobody notified twice.',
};
const CREATE_DOC = {
  description:
    'mode PUBLISH_NOW (default): published and notified immediately (notifiedCount). DRAFT: saved only. SCHEDULE (admins): scheduledAt = Africa/Tunis wall-clock "YYYY-MM-DDTHH:mm"; it publishes itself at that time and its recipients are resolved and notified then.',
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
      'Create: publish now (default), schedule, or save as draft (EVERYONE, TEACHERS, STUDENTS, classes or branches)',
    ...CREATE_DOC,
  })
  @ApiCreatedResponse({ type: PublishResultDto })
  @ApiBadRequestResponse({ description: WRITE_ERRORS })
  create(
    @Body() dto: AdminAnnouncementDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<PublishResultDto> {
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

  @Post(':id/schedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Schedule a DRAFT, or reschedule a pending SCHEDULED one',
    description:
      'scheduledAt = Africa/Tunis wall-clock "YYYY-MM-DDTHH:mm" (no offset), in the future, ≤ 366 days, not after expiresAt. Stored as an instant (scheduledFor); scheduledForLocal echoes the Tunis time. Recipients are resolved when it publishes.',
  })
  @ApiOkResponse({ type: AnnouncementDto })
  @ApiBadRequestResponse({
    description:
      'Validation, SCHEDULE_IN_PAST, SCHEDULE_TOO_FAR, INVALID_DATE_RANGE, ANNOUNCEMENT_TARGET_INVALID',
  })
  @ApiNotFoundResponse({ description: 'ANNOUNCEMENT_NOT_FOUND' })
  @ApiConflictResponse({ description: 'ANNOUNCEMENT_NOT_SCHEDULABLE' })
  schedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleAnnouncementDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<AnnouncementDto> {
    return this.announcements.schedule(
      this.announcements.admin(user.userId),
      id,
      dto,
    );
  }

  @Post(':id/cancel-schedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a pending schedule (back to DRAFT, nobody notified)',
  })
  @ApiOkResponse({ type: AnnouncementDto })
  @ApiNotFoundResponse({ description: 'ANNOUNCEMENT_NOT_FOUND' })
  @ApiConflictResponse({
    description: 'ANNOUNCEMENT_NOT_SCHEDULED (e.g. already published)',
  })
  cancelSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<AnnouncementDto> {
    return this.announcements.cancelSchedule(
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
    summary:
      'Create for my current classes: publish now (default) or save as draft (no scheduling)',
  })
  @ApiCreatedResponse({ type: PublishResultDto })
  @ApiBadRequestResponse({ description: WRITE_ERRORS })
  @ApiForbiddenResponse({ description: 'ANNOUNCEMENT_CLASS_ACCESS_DENIED' })
  create(
    @Body() dto: TeacherAnnouncementDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<PublishResultDto> {
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
