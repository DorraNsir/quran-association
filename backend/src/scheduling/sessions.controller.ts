import {
  Body,
  Controller,
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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AdminApi } from '../academic/admin-api.decorator.js';
import { SchedulingConflictDto } from './schedule.dto.js';
import {
  CreateSessionDto,
  GenerateSessionsDto,
  GenerateSessionsResultDto,
  SessionCalendarQueryDto,
  SessionDto,
  SessionListDto,
  SessionListQueryDto,
  SetSessionStatusDto,
  UpdateSessionDto,
} from './session.dto.js';
import { SessionsService } from './sessions.service.js';

const CONFLICTS =
  'CLASS_SESSION_CONFLICT, ROOM_SESSION_CONFLICT, TEACHER_SESSION_CONFLICT (cancelled sessions never block)';

@ApiTags('admin / sessions')
@AdminApi()
@Controller('admin/sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Sessions (paginated; date range, class, group, branch, room, teacher, status)',
  })
  @ApiOkResponse({ type: SessionListDto })
  list(@Query() query: SessionListQueryDto): Promise<SessionListDto> {
    return this.sessions.list(query);
  }

  @Get('calendar')
  @ApiOperation({
    summary:
      'All sessions of a date range (≤ 62 days) for the calendar — not paginated',
  })
  @ApiOkResponse({ type: SessionDto, isArray: true })
  @ApiBadRequestResponse({
    description: 'DATE_RANGE_INVALID, DATE_RANGE_TOO_LONG',
  })
  calendar(@Query() query: SessionCalendarQueryDto): Promise<SessionDto[]> {
    return this.sessions.calendar(query);
  }

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Generate SCHEDULED sessions from weekly slots of running classes (explicit, idempotent)',
    description:
      'Never duplicates, never recreates a cancelled occurrence, never modifies existing sessions; conflicting occurrences are reported, not created.',
  })
  @ApiOkResponse({ type: GenerateSessionsResultDto })
  @ApiBadRequestResponse({
    description: 'DATE_RANGE_INVALID, DATE_RANGE_TOO_LONG (≤ 366 days)',
  })
  generate(
    @Body() dto: GenerateSessionsDto,
  ): Promise<GenerateSessionsResultDto> {
    return this.sessions.generate(dto);
  }

  @Get(':id')
  @ApiOkResponse({ type: SessionDto })
  @ApiNotFoundResponse({ description: 'SESSION_NOT_FOUND' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<SessionDto> {
    return this.sessions.get(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a session manually (the weekly schedule is not modified)',
  })
  @ApiCreatedResponse({ type: SessionDto })
  @ApiBadRequestResponse({
    description: 'SESSION_TIME_INVALID, SESSION_IN_FUTURE',
  })
  @ApiNotFoundResponse({ description: 'GROUP_CLASS_NOT_FOUND' })
  @ApiConflictResponse({
    type: SchedulingConflictDto,
    description: `GROUP_CLASS_INACTIVE, ${CONFLICTS}`,
  })
  create(@Body() dto: CreateSessionDto): Promise<SessionDto> {
    return this.sessions.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Reschedule a SCHEDULED session (date / times)' })
  @ApiOkResponse({ type: SessionDto })
  @ApiBadRequestResponse({ description: 'SESSION_TIME_INVALID' })
  @ApiConflictResponse({
    type: SchedulingConflictDto,
    description: `SESSION_NOT_EDITABLE, ${CONFLICTS}`,
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSessionDto,
  ): Promise<SessionDto> {
    return this.sessions.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary:
      'Cancel (kept as history), complete (explicit, not in the future), restore or reopen',
    description:
      'SCHEDULED→CANCELLED|COMPLETED, CANCELLED→SCHEDULED (conflicts re-checked), COMPLETED→SCHEDULED',
  })
  @ApiOkResponse({ type: SessionDto })
  @ApiBadRequestResponse({
    description: 'SESSION_IN_FUTURE, CANCELLATION_REASON_UNEXPECTED',
  })
  @ApiConflictResponse({
    type: SchedulingConflictDto,
    description: `INVALID_STATUS_TRANSITION, ${CONFLICTS}`,
  })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetSessionStatusDto,
  ): Promise<SessionDto> {
    return this.sessions.setStatus(id, dto);
  }
}
