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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AdminApi } from '../academic/admin-api.decorator.js';
import {
  CreateWeeklyScheduleDto,
  SchedulingConflictDto,
  StartDateImpactDto,
  StartDateImpactQueryDto,
  UpdateWeeklyScheduleDto,
  WeeklyScheduleDto,
  WeeklyScheduleQueryDto,
} from './schedule.dto.js';
import { WeeklyScheduleWriteDto } from './session.dto.js';
import { SchedulesService } from './schedules.service.js';

const CONFLICTS =
  'CLASS_SCHEDULE_CONFLICT, ROOM_SCHEDULE_CONFLICT, TEACHER_SCHEDULE_CONFLICT (overlap ⇔ newStart < existingEnd AND newEnd > existingStart)';

@ApiTags('admin / weekly schedules')
@AdminApi()
@Controller('admin')
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  @Get('schedules')
  @ApiOperation({
    summary:
      'Weekly slots across classes for the calendar week view (running classes by default)',
  })
  @ApiOkResponse({ type: WeeklyScheduleDto, isArray: true })
  list(@Query() query: WeeklyScheduleQueryDto): Promise<WeeklyScheduleDto[]> {
    return this.schedules.list(query);
  }

  @Get('group-classes/:groupClassId/schedules')
  @ApiOperation({ summary: 'Weekly slots of one class' })
  @ApiOkResponse({ type: WeeklyScheduleDto, isArray: true })
  @ApiNotFoundResponse({ description: 'GROUP_CLASS_NOT_FOUND' })
  listForClass(
    @Param('groupClassId', ParseUUIDPipe) groupClassId: string,
  ): Promise<WeeklyScheduleDto[]> {
    return this.schedules.listForClass(groupClassId);
  }

  @Post('group-classes/:groupClassId/schedules')
  @ApiOperation({
    summary:
      'Add a weekly slot (conflicts checked against the class itself and other running classes)',
  })
  @ApiCreatedResponse({ type: WeeklyScheduleWriteDto })
  @ApiBadRequestResponse({ description: 'SCHEDULE_TIME_INVALID' })
  @ApiNotFoundResponse({ description: 'GROUP_CLASS_NOT_FOUND' })
  @ApiConflictResponse({ type: SchedulingConflictDto, description: CONFLICTS })
  create(
    @Param('groupClassId', ParseUUIDPipe) groupClassId: string,
    @Body() dto: CreateWeeklyScheduleDto,
  ): Promise<WeeklyScheduleWriteDto> {
    return this.schedules.create(groupClassId, dto);
  }

  @Get('group-classes/:groupClassId/schedules/:scheduleId/start-date-impact')
  @ApiOperation({
    summary:
      '«تاريخ بداية الحصص»: the lessons a new start date would remove (unused) or that prevent it (protected) — read-only',
  })
  @ApiOkResponse({ type: StartDateImpactDto })
  @ApiBadRequestResponse({ description: 'SCHEDULE_START_OUTSIDE_YEAR' })
  @ApiNotFoundResponse({ description: 'SCHEDULE_NOT_FOUND' })
  @ApiConflictResponse({ description: 'SCHEDULE_START_NO_ACADEMIC_YEAR' })
  startDateImpact(
    @Param('groupClassId', ParseUUIDPipe) groupClassId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @Query() query: StartDateImpactQueryDto,
  ): Promise<StartDateImpactDto> {
    return this.schedules.startDateImpact(
      groupClassId,
      scheduleId,
      query.startDate,
    );
  }

  @Patch('group-classes/:groupClassId/schedules/:scheduleId')
  @ApiOperation({
    summary: 'Edit a weekly slot (sessions already generated are not changed)',
  })
  @ApiOkResponse({ type: WeeklyScheduleWriteDto })
  @ApiBadRequestResponse({ description: 'SCHEDULE_TIME_INVALID' })
  @ApiNotFoundResponse({ description: 'SCHEDULE_NOT_FOUND' })
  @ApiConflictResponse({
    type: SchedulingConflictDto,
    description: `${CONFLICTS}, SCHEDULE_START_HAS_SESSIONS, SCHEDULE_START_PROTECTED_SESSIONS, SCHEDULE_START_CONFIRMATION_STALE, SCHEDULE_START_NO_ACADEMIC_YEAR`,
  })
  update(
    @Param('groupClassId', ParseUUIDPipe) groupClassId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @Body() dto: UpdateWeeklyScheduleDto,
  ): Promise<WeeklyScheduleWriteDto> {
    return this.schedules.update(groupClassId, scheduleId, dto);
  }

  @Delete('group-classes/:groupClassId/schedules/:scheduleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Remove a weekly slot (its generated sessions are kept as history)',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'SCHEDULE_NOT_FOUND' })
  remove(
    @Param('groupClassId', ParseUUIDPipe) groupClassId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
  ): Promise<void> {
    return this.schedules.remove(groupClassId, scheduleId);
  }
}
