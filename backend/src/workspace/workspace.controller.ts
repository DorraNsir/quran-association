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
  CreateTeacherNoteDto,
  DashboardStatsDto,
  StudentWorkspaceDto,
  TeacherNoteDto,
  TeacherNoteListDto,
  TeacherNoteQueryDto,
  TeacherWorkspaceDto,
  UpdateTeacherNoteDto,
} from './workspace.dto.js';
import { WorkspaceService } from './workspace.service.js';

@ApiTags('teacher / workspace')
@TeacherApi()
@Controller('teacher')
export class TeacherWorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}

  @Get('workspace')
  @ApiOperation({
    summary:
      'My classes (not archived) with their groups, branches, rooms, teams, weekly slots and current students',
  })
  @ApiOkResponse({ type: TeacherWorkspaceDto })
  workspaceBundle(
    @CurrentUser() user: AuthPrincipal,
  ): Promise<TeacherWorkspaceDto> {
    return this.workspace.teacherWorkspace(user.userId);
  }

  @Get('notes')
  @ApiOperation({
    summary:
      'My private notes (most recently updated first) — nobody else can read them',
  })
  @ApiOkResponse({ type: TeacherNoteListDto })
  notes(
    @CurrentUser() user: AuthPrincipal,
    @Query() query: TeacherNoteQueryDto,
  ): Promise<TeacherNoteListDto> {
    return this.workspace.notes(user.userId, query);
  }

  @Post('notes')
  @ApiOperation({
    summary: 'Write a private note (owner and dates set by the server)',
  })
  @ApiCreatedResponse({ type: TeacherNoteDto })
  @ApiBadRequestResponse({
    description: 'Validation (content required, ≤ 2000)',
  })
  createNote(
    @CurrentUser() user: AuthPrincipal,
    @Body() dto: CreateTeacherNoteDto,
  ): Promise<TeacherNoteDto> {
    return this.workspace.createNote(user.userId, dto);
  }

  @Patch('notes/:id')
  @ApiOperation({ summary: 'Edit one of my notes' })
  @ApiOkResponse({ type: TeacherNoteDto })
  @ApiNotFoundResponse({
    description: 'TEACHER_NOTE_NOT_FOUND (also for another teacher’s note)',
  })
  updateNote(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeacherNoteDto,
  ): Promise<TeacherNoteDto> {
    return this.workspace.updateNote(user.userId, id, dto);
  }

  @Delete('notes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete one of my notes' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'TEACHER_NOTE_NOT_FOUND' })
  deleteNote(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.workspace.deleteNote(user.userId, id);
  }
}

@ApiTags('student / workspace')
@StudentApi()
@Controller('student')
export class StudentWorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}

  @Get('workspace')
  @ApiOperation({
    summary:
      'My profile and my current class (group, branch, room, teachers, weekly slots)',
  })
  @ApiOkResponse({ type: StudentWorkspaceDto })
  workspaceBundle(
    @CurrentUser() user: AuthPrincipal,
  ): Promise<StudentWorkspaceDto> {
    return this.workspace.studentWorkspace(user.userId);
  }
}

@ApiTags('admin / dashboard')
@AdminApi()
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(private readonly workspace: WorkspaceService) {}

  @Get()
  @ApiOperation({ summary: 'Key figures of the admin home page (counts only)' })
  @ApiOkResponse({ type: DashboardStatsDto })
  stats(): Promise<DashboardStatsDto> {
    return this.workspace.dashboard();
  }
}
