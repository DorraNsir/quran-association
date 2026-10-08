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
  AdminResourceDto,
  ResourceDto,
  ResourceListDto,
  ResourceListQueryDto,
  TeacherResourceDto,
  UpdateAdminResourceDto,
  UpdateTeacherResourceDto,
} from './resource.dto.js';
import { ResourcesService } from './resources.service.js';

const WRITE_ERRORS =
  'Validation (title, http(s) URL), RESOURCE_TARGET_INVALID, RESOURCE_URL_REQUIRED, RESOURCE_FILE_UPLOAD_UNAVAILABLE (PDF/IMAGE/AUDIO/FILE need the file storage of Part 10.10)';

@ApiTags('admin / resources')
@AdminApi()
@Controller('admin/resources')
export class AdminResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get()
  @ApiOperation({
    summary:
      'All resources (filters: type, visibility, class, group, search, mine)',
  })
  @ApiOkResponse({ type: ResourceListDto })
  list(
    @Query() query: ResourceListQueryDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<ResourceListDto> {
    return this.resources.listForAdmin(query, user.userId);
  }

  @Get(':id')
  @ApiOkResponse({ type: ResourceDto })
  @ApiNotFoundResponse({ description: 'RESOURCE_NOT_FOUND' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ResourceDto> {
    return this.resources.getForAdmin(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Publish a resource (ALL_STUDENTS, groups or classes)',
    description:
      'Published immediately; the student accounts it reaches are notified in the same transaction (once each).',
  })
  @ApiCreatedResponse({ type: ResourceDto })
  @ApiBadRequestResponse({ description: WRITE_ERRORS })
  create(
    @Body() dto: AdminResourceDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<ResourceDto> {
    return this.resources.createAsAdmin(dto, user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit any resource (no new notification)' })
  @ApiOkResponse({ type: ResourceDto })
  @ApiBadRequestResponse({ description: WRITE_ERRORS })
  @ApiNotFoundResponse({ description: 'RESOURCE_NOT_FOUND' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminResourceDto,
  ): Promise<ResourceDto> {
    return this.resources.updateAsAdmin(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete (targets and its notifications too)' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'RESOURCE_NOT_FOUND' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.resources.removeAsAdmin(id);
  }
}

@ApiTags('teacher / resources')
@TeacherApi()
@Controller('teacher/resources')
export class TeacherResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Resources reaching my CURRENT classes (and all-students ones), plus my own',
  })
  @ApiOkResponse({ type: ResourceListDto })
  list(
    @Query() query: ResourceListQueryDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<ResourceListDto> {
    return this.resources.listForTeacher(query, user.userId);
  }

  @Get(':id')
  @ApiOkResponse({ type: ResourceDto })
  @ApiNotFoundResponse({
    description: 'RESOURCE_NOT_FOUND (also when not visible)',
  })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<ResourceDto> {
    return this.resources.getForTeacher(id, user.userId);
  }

  @Post()
  @ApiOperation({
    summary: 'Publish a resource to my current classes (GROUP_CLASS)',
    description:
      'Supervisor or assistant of every listed class (current assignment). Notifies the students of those classes.',
  })
  @ApiCreatedResponse({ type: ResourceDto })
  @ApiBadRequestResponse({ description: WRITE_ERRORS })
  @ApiForbiddenResponse({ description: 'RESOURCE_CLASS_ACCESS_DENIED' })
  create(
    @Body() dto: TeacherResourceDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<ResourceDto> {
    return this.resources.createAsTeacher(dto, user.userId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit my own resource (still assigned to its classes)',
  })
  @ApiOkResponse({ type: ResourceDto })
  @ApiBadRequestResponse({ description: WRITE_ERRORS })
  @ApiForbiddenResponse({
    description: 'RESOURCE_EDIT_FORBIDDEN, RESOURCE_CLASS_ACCESS_DENIED',
  })
  @ApiNotFoundResponse({ description: 'RESOURCE_NOT_FOUND' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeacherResourceDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<ResourceDto> {
    return this.resources.updateAsTeacher(id, dto, user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete my own resource' })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'RESOURCE_EDIT_FORBIDDEN' })
  @ApiNotFoundResponse({ description: 'RESOURCE_NOT_FOUND' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<void> {
    return this.resources.removeAsTeacher(id, user.userId);
  }
}

@ApiTags('student / resources')
@StudentApi()
@Controller('student/resources')
export class StudentResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Resources for me: all-students, my current group, my current class',
  })
  @ApiOkResponse({ type: ResourceListDto })
  list(
    @Query() query: ResourceListQueryDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<ResourceListDto> {
    return this.resources.listForStudent(query, user.userId);
  }

  @Get(':id')
  @ApiOkResponse({ type: ResourceDto })
  @ApiNotFoundResponse({
    description: 'RESOURCE_NOT_FOUND (also when not mine)',
  })
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<ResourceDto> {
    return this.resources.getForStudent(id, user.userId);
  }
}
