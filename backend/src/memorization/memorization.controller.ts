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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AdminApi } from '../academic/admin-api.decorator.js';
import type { AuthPrincipal } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { TeacherApi } from '../teaching/teacher-api.decorator.js';
import {
  ClassMemorizationDto,
  MemorizationRecordDto,
  SemesterRefDto,
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
}
