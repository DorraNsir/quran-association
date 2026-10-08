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
  AttendanceSummaryDto,
  SaveAttendanceDto,
  SessionAttendanceDto,
  StudentAttendanceListDto,
  StudentAttendanceQueryDto,
  SummaryQueryDto,
} from './attendance.dto.js';
import { AttendanceService } from './attendance.service.js';

const SAVE_DOC = {
  summary: 'Save attendance (bulk, all-or-nothing)',
  description:
    'Creates/updates the listed students only. The session becomes COMPLETED (source ATTENDANCE) when every expected student is recorded; partial saves and empty rosters never complete it; corrections never reopen it.',
};
const SAVE_ERRORS_400 =
  'ATTENDANCE_DUPLICATE_STUDENT, ATTENDANCE_STUDENT_NOT_IN_SESSION, invalid status / note';
const SAVE_ERRORS_409 =
  'ATTENDANCE_SESSION_CANCELLED, ATTENDANCE_SESSION_FUTURE';

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
    description: `${SAVE_DOC.description} Teachers: sessions dated within the last TEACHER_ATTENDANCE_WINDOW_DAYS days (default 7, today included); admins at any time.`,
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
}
