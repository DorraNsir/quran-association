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
import { StudentAccessService } from '../student-space/student-access.service.js';
import { StudentApi } from '../student-space/student-api.decorator.js';
import { TeacherApi } from '../teaching/teacher-api.decorator.js';
import { TeacherAccessService } from '../teaching/teacher-access.service.js';
import {
  AttendanceChangeDto,
  TeacherAttendanceGroupDto,
  TeacherAttendanceListDto,
  TeacherAttendanceQueryDto,
  TeacherSummaryQueryDto,
  TeachersSummaryQueryDto,
  TeacherSummaryLineDto,
  AttendanceSummaryDto,
  SaveAttendanceDto,
  SessionAttendanceDto,
  StudentAttendanceListDto,
  StudentAttendanceQueryDto,
  StudentsSummaryQueryDto,
  StudentSummaryLineDto,
  SummaryQueryDto,
} from './attendance.dto.js';
import { AttendanceService } from './attendance.service.js';

const SAVE_DOC = {
  summary: 'Save attendance of students and/or teachers (bulk, all-or-nothing)',
  description:
    'Creates/updates the listed students (`records`) and teachers of the session team (`teachers`) only — nothing else is touched or marked absent. Each real change is audited; when an ASSISTANT changes saved statuses, the session supervisor gets ONE notification. `expectedStatus` refuses stale overwrites (409 ATTENDANCE_CHANGED). The session becomes COMPLETED (source ATTENDANCE) when every expected student is recorded; partial saves and empty rosters never complete it; corrections never reopen it.',
};
const SAVE_ERRORS_400 =
  'ATTENDANCE_EMPTY, ATTENDANCE_DUPLICATE_STUDENT, ATTENDANCE_DUPLICATE_TEACHER, ATTENDANCE_STUDENT_NOT_IN_SESSION, ATTENDANCE_TEACHER_NOT_IN_SESSION, invalid status / note';
const SAVE_ERRORS_409 =
  'ATTENDANCE_SESSION_CANCELLED, ATTENDANCE_SESSION_FUTURE, ATTENDANCE_CHANGED';
const HISTORY_DOC = {
  summary:
    '«سجل التعديلات»: every first recording and real change of student/teacher attendance, newest first',
};

@ApiTags('admin / attendance')
@AdminApi()
@Controller('admin')
export class AdminAttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('sessions/:sessionId/attendance')
  @ApiOperation({
    summary:
      'Roster of the session (enrollment on the session date) with recorded statuses',
  })
  @ApiOkResponse({ type: SessionAttendanceDto })
  @ApiNotFoundResponse({ description: 'SESSION_NOT_FOUND' })
  roster(
    @CurrentUser() user: AuthPrincipal,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<SessionAttendanceDto> {
    return this.attendance.sessionAttendance(sessionId, {
      kind: 'admin',
      userId: user.userId,
    });
  }

  @Put('sessions/:sessionId/attendance')
  @ApiOperation(SAVE_DOC)
  @ApiOkResponse({ type: SessionAttendanceDto })
  @ApiBadRequestResponse({ description: SAVE_ERRORS_400 })
  @ApiConflictResponse({ description: SAVE_ERRORS_409 })
  save(
    @CurrentUser() user: AuthPrincipal,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: SaveAttendanceDto,
  ): Promise<SessionAttendanceDto> {
    return this.attendance.save(sessionId, dto, {
      kind: 'admin',
      userId: user.userId,
    });
  }

  @Get('sessions/:sessionId/attendance/history')
  @ApiOperation(HISTORY_DOC)
  @ApiOkResponse({ type: [AttendanceChangeDto] })
  @ApiNotFoundResponse({ description: 'SESSION_NOT_FOUND' })
  history(
    @CurrentUser() user: AuthPrincipal,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<AttendanceChangeDto[]> {
    return this.attendance.history(sessionId, {
      kind: 'admin',
      userId: user.userId,
    });
  }

  @Get('attendance/teachers-summary')
  @ApiOperation({
    summary:
      'Counts per teacher (their own attendance) over non-cancelled sessions (same filters as students-summary)',
  })
  @ApiOkResponse({ type: [TeacherSummaryLineDto] })
  @ApiNotFoundResponse({ description: 'ACADEMIC_YEAR_NOT_FOUND' })
  teachersSummary(
    @Query() query: TeachersSummaryQueryDto,
  ): Promise<TeacherSummaryLineDto[]> {
    return this.attendance.teachersSummary(query);
  }

  @Get('teachers/:teacherId/attendance')
  @ApiOperation({ summary: 'A teacher’s own attendance records (paginated)' })
  @ApiOkResponse({ type: TeacherAttendanceListDto })
  @ApiNotFoundResponse({
    description: 'TEACHER_NOT_FOUND, ACADEMIC_YEAR_NOT_FOUND',
  })
  teacherRecords(
    @Param('teacherId', ParseUUIDPipe) teacherId: string,
    @Query() query: TeacherAttendanceQueryDto,
  ): Promise<TeacherAttendanceListDto> {
    return this.attendance.teacherRecords(teacherId, query);
  }

  @Get('teachers/:teacherId/attendance/groups')
  @ApiOperation({
    summary:
      "The groups of a teacher's group filter: groups of the sessions they have attendance records in, and of their current assignments",
  })
  @ApiOkResponse({ type: TeacherAttendanceGroupDto, isArray: true })
  @ApiNotFoundResponse({ description: 'TEACHER_NOT_FOUND' })
  teacherGroups(
    @Param('teacherId', ParseUUIDPipe) teacherId: string,
  ): Promise<TeacherAttendanceGroupDto[]> {
    return this.attendance.teacherGroups(teacherId);
  }

  @Get('teachers/:teacherId/attendance/summary')
  @ApiOperation({
    summary: 'A teacher’s own totals + rate (same rule as students)',
  })
  @ApiOkResponse({ type: AttendanceSummaryDto })
  @ApiNotFoundResponse({
    description: 'TEACHER_NOT_FOUND, ACADEMIC_YEAR_NOT_FOUND',
  })
  teacherSummary(
    @Param('teacherId', ParseUUIDPipe) teacherId: string,
    @Query() query: TeacherSummaryQueryDto,
  ): Promise<AttendanceSummaryDto> {
    return this.attendance.teacherSummary(teacherId, query);
  }

  @Get('attendance/students-summary')
  @ApiOperation({
    summary:
      'Counts per student over non-cancelled sessions (filters: period / academic year, group, class, branch)',
  })
  @ApiOkResponse({ type: [StudentSummaryLineDto] })
  @ApiNotFoundResponse({ description: 'ACADEMIC_YEAR_NOT_FOUND' })
  studentsSummary(
    @Query() query: StudentsSummaryQueryDto,
  ): Promise<StudentSummaryLineDto[]> {
    return this.attendance.studentsSummary(query);
  }

  @Get('students/:studentId/attendance')
  @ApiOperation({
    summary:
      'A student’s attendance records (paginated; academic year / date range)',
  })
  @ApiOkResponse({ type: StudentAttendanceListDto })
  @ApiNotFoundResponse({
    description: 'STUDENT_NOT_FOUND, ACADEMIC_YEAR_NOT_FOUND',
  })
  records(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: StudentAttendanceQueryDto,
  ): Promise<StudentAttendanceListDto> {
    return this.attendance.studentRecords(studentId, query);
  }

  @Get('students/:studentId/attendance/summary')
  @ApiOperation({
    summary:
      'Counts per status + rate (cancelled sessions excluded, unrecorded never counted as absent)',
  })
  @ApiOkResponse({ type: AttendanceSummaryDto })
  @ApiNotFoundResponse({
    description: 'STUDENT_NOT_FOUND, ACADEMIC_YEAR_NOT_FOUND',
  })
  summary(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: SummaryQueryDto,
  ): Promise<AttendanceSummaryDto> {
    return this.attendance.summary(studentId, query);
  }
}

@ApiTags('teacher / attendance')
@TeacherApi()
@Controller('teacher/sessions/:sessionId/attendance')
export class TeacherAttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get()
  @ApiOperation({ summary: 'Roster of one of MY sessions (I am in its team)' })
  @ApiOkResponse({ type: SessionAttendanceDto })
  @ApiNotFoundResponse({ description: 'SESSION_NOT_FOUND' })
  roster(
    @CurrentUser() user: AuthPrincipal,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<SessionAttendanceDto> {
    return this.attendance.sessionAttendance(sessionId, {
      kind: 'teacher',
      userId: user.userId,
    });
  }

  @Put()
  @ApiOperation({
    ...SAVE_DOC,
    description: `${SAVE_DOC.description} Teachers: a first status can be recorded at any time (not for a future or cancelled session); changing a saved status or note only for sessions dated within the last TEACHER_ATTENDANCE_WINDOW_DAYS days (default 7, today included) — 409 ATTENDANCE_CORRECTION_WINDOW_CLOSED otherwise. Admins at any time.`,
  })
  @ApiOkResponse({ type: SessionAttendanceDto })
  @ApiBadRequestResponse({ description: SAVE_ERRORS_400 })
  @ApiConflictResponse({
    description: `${SAVE_ERRORS_409}, ATTENDANCE_CORRECTION_WINDOW_CLOSED`,
  })
  save(
    @CurrentUser() user: AuthPrincipal,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body() dto: SaveAttendanceDto,
  ): Promise<SessionAttendanceDto> {
    return this.attendance.save(sessionId, dto, {
      kind: 'teacher',
      userId: user.userId,
    });
  }

  @Get('history')
  @ApiOperation(HISTORY_DOC)
  @ApiOkResponse({ type: [AttendanceChangeDto] })
  @ApiNotFoundResponse({ description: 'SESSION_NOT_FOUND' })
  history(
    @CurrentUser() user: AuthPrincipal,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ): Promise<AttendanceChangeDto[]> {
    return this.attendance.history(sessionId, {
      kind: 'teacher',
      userId: user.userId,
    });
  }
}

@ApiTags('teacher / attendance')
@TeacherApi()
@Controller('teacher/attendance')
export class TeacherOwnAttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly access: TeacherAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'MY attendance as a teacher (paginated)' })
  @ApiOkResponse({ type: TeacherAttendanceListDto })
  async records(
    @CurrentUser() user: AuthPrincipal,
    @Query() query: StudentAttendanceQueryDto,
  ): Promise<TeacherAttendanceListDto> {
    return this.attendance.teacherRecords(
      await this.access.teacherIdOf(user.userId),
      query,
    );
  }

  @Get('summary')
  @ApiOperation({ summary: 'MY totals + rate as a teacher' })
  @ApiOkResponse({ type: AttendanceSummaryDto })
  async summary(
    @CurrentUser() user: AuthPrincipal,
    @Query() query: SummaryQueryDto,
  ): Promise<AttendanceSummaryDto> {
    return this.attendance.teacherSummary(
      await this.access.teacherIdOf(user.userId),
      query,
    );
  }
}

@ApiTags('teacher / attendance')
@TeacherApi()
@Controller('teacher/students/:studentId/attendance')
export class TeacherStudentAttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get()
  @ApiOperation({
    summary:
      'Attendance records of a student I teach (default period: the current academic year; I must have taught them during it)',
  })
  @ApiOkResponse({ type: StudentAttendanceListDto })
  @ApiNotFoundResponse({
    description: 'STUDENT_NOT_FOUND, ACADEMIC_YEAR_NOT_FOUND',
  })
  async records(
    @CurrentUser() user: AuthPrincipal,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: StudentAttendanceQueryDto,
  ): Promise<StudentAttendanceListDto> {
    const range = await this.attendance.teacherStudentRange(
      user.userId,
      studentId,
      query,
    );
    return this.attendance.studentRecords(studentId, {
      page: query.page,
      pageSize: query.pageSize,
      ...range,
    });
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Attendance summary of a student I teach (same period rule)',
  })
  @ApiOkResponse({ type: AttendanceSummaryDto })
  @ApiNotFoundResponse({
    description: 'STUDENT_NOT_FOUND, ACADEMIC_YEAR_NOT_FOUND',
  })
  async summary(
    @CurrentUser() user: AuthPrincipal,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() query: SummaryQueryDto,
  ): Promise<AttendanceSummaryDto> {
    const range = await this.attendance.teacherStudentRange(
      user.userId,
      studentId,
      query,
    );
    return this.attendance.summary(studentId, range);
  }
}

/** My own attendance (the student profile of the authenticated account). */
@ApiTags('student / attendance')
@StudentApi()
@Controller('student/attendance')
export class StudentAttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly access: StudentAccessService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'My attendance records (paginated; academic year / date range)',
  })
  @ApiOkResponse({ type: StudentAttendanceListDto })
  @ApiNotFoundResponse({ description: 'ACADEMIC_YEAR_NOT_FOUND' })
  async records(
    @CurrentUser() user: AuthPrincipal,
    @Query() query: StudentAttendanceQueryDto,
  ): Promise<StudentAttendanceListDto> {
    const { studentId } = await this.access.scopeOf(user.userId);
    return this.attendance.studentRecords(studentId, query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'My attendance summary' })
  @ApiOkResponse({ type: AttendanceSummaryDto })
  @ApiNotFoundResponse({ description: 'ACADEMIC_YEAR_NOT_FOUND' })
  async summary(
    @CurrentUser() user: AuthPrincipal,
    @Query() query: SummaryQueryDto,
  ): Promise<AttendanceSummaryDto> {
    const { studentId } = await this.access.scopeOf(user.userId);
    return this.attendance.summary(studentId, query);
  }
}
