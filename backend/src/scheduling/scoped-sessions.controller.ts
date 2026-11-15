import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
  OmitType,
} from '@nestjs/swagger';

import type { AuthPrincipal } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { PaginationMetaDto, paginationMeta } from '../common/pagination.js';
import { StudentAccessService } from '../student-space/student-access.service.js';
import { StudentApi } from '../student-space/student-api.decorator.js';
import { TeacherAccessService } from '../teaching/teacher-access.service.js';
import { TeacherApi } from '../teaching/teacher-api.decorator.js';
import { SessionStatus } from '../generated/prisma/enums.js';
import { SchedulingConflictDto } from './schedule.dto.js';
import {
  CancelSessionDto,
  CreateExtraSessionDto,
  SessionCalendarQueryDto,
  SessionDto,
  SessionListDto,
  SessionListQueryDto,
} from './session.dto.js';
import { SessionsService } from './sessions.service.js';

/** What a student sees of a lesson (no administrative attention flags or completion audit). */
export class StudentSessionDto extends OmitType(SessionDto, [
  'attention',
  'completion',
] as const) {}

export class StudentSessionListDto {
  @ApiProperty({ type: [StudentSessionDto] }) data!: StudentSessionDto[];
  @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
}

const forStudent = ({
  attention: _attention,
  completion: _completion,
  ...session
}: SessionDto): StudentSessionDto => session;

/**
 * Teacher sessions: the lessons whose team snapshot includes me (supervisor
 * or assistant when the lesson was planned) — the same rule as attendance.
 * The teacher filter always comes from the account, never from the query.
 */
@ApiTags('teacher / sessions')
@TeacherApi()
@Controller('teacher/sessions')
export class TeacherSessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly access: TeacherAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'My sessions (paginated, filters)' })
  @ApiOkResponse({ type: SessionListDto })
  @ApiBadRequestResponse({ description: 'DATE_RANGE_INVALID' })
  async list(
    @CurrentUser() user: AuthPrincipal,
    @Query() query: SessionListQueryDto,
  ): Promise<SessionListDto> {
    // The teacher filter is always the authenticated teacher
    query.teacherId = await this.access.teacherIdOf(user.userId);
    return this.sessions.list(query);
  }

  @Get('calendar')
  @ApiOperation({ summary: 'My sessions of a bounded range (≤ 62 days)' })
  @ApiOkResponse({ type: [SessionDto] })
  @ApiBadRequestResponse({
    description: 'DATE_RANGE_INVALID, DATE_RANGE_TOO_LONG',
  })
  async calendar(
    @CurrentUser() user: AuthPrincipal,
    @Query() query: SessionCalendarQueryDto,
  ): Promise<SessionDto[]> {
    query.teacherId = await this.access.teacherIdOf(user.userId);
    return this.sessions.calendar(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One of my sessions' })
  @ApiOkResponse({ type: SessionDto })
  @ApiNotFoundResponse({ description: 'SESSION_NOT_FOUND' })
  async get(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SessionDto> {
    await this.access.assertSessionAccess(user.userId, id);
    return this.sessions.get(id);
  }

  /**
   * «إضافة حصة إضافية» by the SUPERVISOR of the host class (an assistant or
   * any other teacher: 403). Same rules as the admin endpoint, and the
   * administration is told.
   */
  @Post('extra')
  @ApiOperation({
    summary: 'Extra one-off session of a class I supervise (not started yet)',
  })
  @ApiCreatedResponse({ type: SessionDto })
  @ApiBadRequestResponse({
    description: 'SESSION_TIME_INVALID, SESSION_DATE_PAST',
  })
  @ApiForbiddenResponse({
    description:
      'TEACHER_PROFILE_REQUIRED, TEACHER_INACTIVE, TEACHER_NOT_SUPERVISOR',
  })
  @ApiConflictResponse({
    type: SchedulingConflictDto,
    description:
      'GROUP_CLASS_INACTIVE, SUPERVISOR_INACTIVE, ROOM_*, CLASS_SESSION_CONFLICT, ROOM_SESSION_CONFLICT, TEACHER_SESSION_CONFLICT, SHARED_*',
  })
  async createExtra(
    @CurrentUser() user: AuthPrincipal,
    @Body() dto: CreateExtraSessionDto,
  ): Promise<SessionDto> {
    const teacherId = await this.access.teacherIdOf(user.userId);
    return this.sessions.createExtra(dto, user.userId, { teacherId });
  }

  /**
   * «إلغاء الحصة» by the SUPERVISOR of the lesson (its team snapshot): a
   * SCHEDULED lesson not started yet and without attendance. Kept as history
   * (status CANCELLED); restoring / completing stays with the administration.
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel one of my upcoming lessons (supervisor)' })
  @ApiOkResponse({ type: SessionDto })
  @ApiNotFoundResponse({ description: 'SESSION_NOT_FOUND' })
  @ApiForbiddenResponse({
    description:
      'TEACHER_PROFILE_REQUIRED, TEACHER_INACTIVE, TEACHER_NOT_SUPERVISOR',
  })
  @ApiConflictResponse({
    description:
      'SESSION_NOT_CANCELLABLE, SESSION_ALREADY_STARTED, SESSION_HAS_ATTENDANCE',
  })
  async cancel(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelSessionDto,
  ): Promise<SessionDto> {
    const teacherId = await this.access.teacherIdOf(user.userId);
    return this.sessions.setStatus(
      id,
      {
        status: SessionStatus.CANCELLED,
        cancellationReason: dto.cancellationReason,
      },
      user.userId,
      { teacherId },
    );
  }
}

/** Student sessions: the lessons of MY CURRENT class only (none when not placed in a class). */
@ApiTags('student / sessions')
@StudentApi()
@Controller('student/sessions')
export class StudentSessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly access: StudentAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Sessions of my class (paginated)' })
  @ApiOkResponse({ type: StudentSessionListDto })
  @ApiBadRequestResponse({ description: 'DATE_RANGE_INVALID' })
  async list(
    @CurrentUser() user: AuthPrincipal,
    @Query() query: SessionListQueryDto,
  ): Promise<StudentSessionListDto> {
    const { groupClassId } = await this.access.scopeOf(user.userId);
    if (!groupClassId)
      return {
        data: [],
        meta: paginationMeta(query.page, query.pageSize ?? 10, 0),
      };
    query.teacherId = undefined;
    query.groupClassId = groupClassId;
    const page = await this.sessions.list(query);
    return { data: page.data.map(forStudent), meta: page.meta };
  }

  @Get('calendar')
  @ApiOperation({
    summary: 'Sessions of my class over a bounded range (≤ 62 days)',
  })
  @ApiOkResponse({ type: [StudentSessionDto] })
  @ApiBadRequestResponse({
    description: 'DATE_RANGE_INVALID, DATE_RANGE_TOO_LONG',
  })
  async calendar(
    @CurrentUser() user: AuthPrincipal,
    @Query() query: SessionCalendarQueryDto,
  ): Promise<StudentSessionDto[]> {
    const { groupClassId } = await this.access.scopeOf(user.userId);
    if (!groupClassId) return [];
    query.teacherId = undefined;
    query.groupClassId = groupClassId;
    const rows = await this.sessions.calendar(query);
    return rows.map(forStudent);
  }
}
