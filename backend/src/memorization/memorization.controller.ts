import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AdminApi } from '../academic/admin-api.decorator.js';
import type { AuthPrincipal } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { StudentAccessService } from '../student-space/student-access.service.js';
import { StudentApi } from '../student-space/student-api.decorator.js';
import { TeacherApi } from '../teaching/teacher-api.decorator.js';
import {
  ClassMemorizationDto,
  MemorizationRecordDto,
  SemesterRefDto,
  SessionMemorizationDto,
  SessionMemorizationQueryDto,
  StudentMemorizationQueryDto,
  UpsertMemorizationDto,
} from './memorization.dto.js';
import { MemorizationService } from './memorization.service.js';

const UPSERT_DOC = {
  summary:
    'Set the last memorized surah for one semester (creates or updates THE record)',
  description:
    'Canonical surah number 1–114; no progression rule between semesters (students may memorize from An-Nas upward).',
};

@ApiTags('admin / memorization')
@AdminApi()
@Controller('admin')
export class AdminMemorizationController {
  constructor(private readonly memorization: MemorizationService) {}

  @Get('students/:studentId/memorization')
  @ApiOperation({
    summary:
      'All memorization records of a student (optionally one academic year)',
  })
  @ApiOkResponse({ type: MemorizationRecordDto, isArray: true })
  @ApiNotFoundResponse({
    description: 'STUDENT_NOT_FOUND, ACADEMIC_YEAR_NOT_FOUND',
  })
  forStudent(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: StudentMemorizationQueryDto,
  ): Promise<MemorizationRecordDto[]> {
    return this.memorization.forStudent(studentId, query);
  }

  @Put('students/:studentId/memorization')
  @ApiOperation(UPSERT_DOC)
  @ApiOkResponse({ type: MemorizationRecordDto })
  @ApiBadRequestResponse({
    description: 'Invalid semester (FIRST/SECOND) or surah (1–114)',
  })
  @ApiNotFoundResponse({
    description: 'STUDENT_NOT_FOUND, ACADEMIC_YEAR_NOT_FOUND',
  })
  @ApiConflictResponse({
    description:
      'MEMORIZATION_STUDENT_NOT_ENROLLED (not in any class during that semester)',
  })
  upsert(
    @CurrentUser() user: AuthPrincipal,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: UpsertMemorizationDto,
  ): Promise<MemorizationRecordDto> {
    return this.memorization.upsert(studentId, dto, {
      kind: 'admin',
      userId: user.userId,
    });
  }

  @Get('group-classes/:groupClassId/memorization')
  @ApiOperation({
    summary:
      'Students of the class during a semester with their last memorized surah (null = not recorded)',
  })
  @ApiOkResponse({ type: ClassMemorizationDto })
  @ApiNotFoundResponse({
    description: 'GROUP_CLASS_NOT_FOUND, ACADEMIC_YEAR_NOT_FOUND',
  })
  forClass(
    @CurrentUser() user: AuthPrincipal,
    @Param('groupClassId', ParseUUIDPipe) groupClassId: string,
    @Query() query: SemesterRefDto,
  ): Promise<ClassMemorizationDto> {
    return this.memorization.forClass(groupClassId, query, {
      kind: 'admin',
      userId: user.userId,
    });
  }

  @Get('sessions/:sessionId/memorization')
  @ApiOperation({
    summary:
      "A session's students with their last memorized surah — the combined list of a shared session (default period: the semester of the session date)",
  })
  @ApiOkResponse({ type: SessionMemorizationDto })
  @ApiBadRequestResponse({ description: 'MEMORIZATION_PERIOD_INCOMPLETE' })
  @ApiNotFoundResponse({
    description: 'SESSION_NOT_FOUND, ACADEMIC_YEAR_NOT_FOUND',
  })
  forSession(
    @CurrentUser() user: AuthPrincipal,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Query() query: SessionMemorizationQueryDto,
  ): Promise<SessionMemorizationDto> {
    return this.memorization.forSession(sessionId, query, {
      kind: 'admin',
      userId: user.userId,
    });
  }
}

@ApiTags('teacher / memorization')
@TeacherApi()
@Controller('teacher')
export class TeacherMemorizationController {
  constructor(private readonly memorization: MemorizationService) {}

  @Get('students/:studentId/memorization')
  @ApiOperation({
    summary: 'One semester of a student I teach (null when not recorded)',
  })
  @ApiOkResponse({ type: MemorizationRecordDto })
  @ApiNotFoundResponse({
    description: 'STUDENT_NOT_FOUND, ACADEMIC_YEAR_NOT_FOUND',
  })
  one(
    @CurrentUser() user: AuthPrincipal,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: SemesterRefDto,
  ): Promise<MemorizationRecordDto | null> {
    return this.memorization.one(studentId, query, {
      kind: 'teacher',
      userId: user.userId,
    });
  }

  @Put('students/:studentId/memorization')
  @ApiOperation({
    ...UPSERT_DOC,
    summary: `${UPSERT_DOC.summary} — students of my classes for that semester`,
  })
  @ApiOkResponse({ type: MemorizationRecordDto })
  @ApiBadRequestResponse({
    description: 'Invalid semester (FIRST/SECOND) or surah (1–114)',
  })
  @ApiConflictResponse({ description: 'MEMORIZATION_STUDENT_NOT_ENROLLED' })
  upsert(
    @CurrentUser() user: AuthPrincipal,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body() dto: UpsertMemorizationDto,
  ): Promise<MemorizationRecordDto> {
    return this.memorization.upsert(studentId, dto, {
      kind: 'teacher',
      userId: user.userId,
    });
  }

  @Get('group-classes/:groupClassId/memorization')
  @ApiOperation({
    summary: 'Memorization list of one of MY classes for a semester',
  })
  @ApiOkResponse({ type: ClassMemorizationDto })
  @ApiNotFoundResponse({
    description: 'GROUP_CLASS_NOT_FOUND, ACADEMIC_YEAR_NOT_FOUND',
  })
  forClass(
    @CurrentUser() user: AuthPrincipal,
    @Param('groupClassId', ParseUUIDPipe) groupClassId: string,
    @Query() query: SemesterRefDto,
  ): Promise<ClassMemorizationDto> {
    return this.memorization.forClass(groupClassId, query, {
      kind: 'teacher',
      userId: user.userId,
    });
  }

  @Get('sessions/:sessionId/memorization')
  @ApiOperation({
    summary:
      'A session I teach: its students with their last memorized surah (shared session: the combined list — an assistant only sees the classes they are assigned to)',
  })
  @ApiOkResponse({ type: SessionMemorizationDto })
  @ApiBadRequestResponse({ description: 'MEMORIZATION_PERIOD_INCOMPLETE' })
  @ApiNotFoundResponse({
    description: 'SESSION_NOT_FOUND, ACADEMIC_YEAR_NOT_FOUND',
  })
  @ApiForbiddenResponse({
    description: 'Not in the session team (TEACHER_CLASS_ACCESS_DENIED)',
  })
  forSession(
    @CurrentUser() user: AuthPrincipal,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Query() query: SessionMemorizationQueryDto,
  ): Promise<SessionMemorizationDto> {
    return this.memorization.forSession(sessionId, query, {
      kind: 'teacher',
      userId: user.userId,
    });
  }
}

/** My own memorization progress (the student profile of the authenticated account). */
@ApiTags('student / memorization')
@StudentApi()
@Controller('student/memorization')
export class StudentMemorizationController {
  constructor(
    private readonly memorization: MemorizationService,
    private readonly access: StudentAccessService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'My records (newest year first; optional academic year)',
  })
  @ApiOkResponse({ type: [MemorizationRecordDto] })
  @ApiNotFoundResponse({ description: 'ACADEMIC_YEAR_NOT_FOUND' })
  async mine(
    @CurrentUser() user: AuthPrincipal,
    @Query() query: StudentMemorizationQueryDto,
  ): Promise<MemorizationRecordDto[]> {
    const { studentId } = await this.access.scopeOf(user.userId);
    return this.memorization.forStudent(studentId, query);
  }
}
