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
  UpdateWeeklyScheduleDto,
  WeeklyScheduleDto,
  WeeklyScheduleQueryDto,
} from './schedule.dto.js';
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
  @ApiCreatedResponse({ type: WeeklyScheduleDto })
  @ApiBadRequestResponse({ description: 'SCHEDULE_TIME_INVALID' })
  @ApiNotFoundResponse({ description: 'GROUP_CLASS_NOT_FOUND' })
  @ApiConflictResponse({ type: SchedulingConflictDto, description: CONFLICTS })
  create(
    @Param('groupClassId', ParseUUIDPipe) groupClassId: string,
    @Body() dto: CreateWeeklyScheduleDto,
  ): Promise<WeeklyScheduleDto> {
    return this.schedules.create(groupClassId, dto);
  }

  @Patch('group-classes/:groupClassId/schedules/:scheduleId')
  @ApiOperation({
    summary: 'Edit a weekly slot (sessions already generated are not changed)',
  })
  @ApiOkResponse({ type: WeeklyScheduleDto })
  @ApiBadRequestResponse({ description: 'SCHEDULE_TIME_INVALID' })
  @ApiNotFoundResponse({ description: 'SCHEDULE_NOT_FOUND' })
  @ApiConflictResponse({ type: SchedulingConflictDto, description: CONFLICTS })
  update(
    @Param('groupClassId', ParseUUIDPipe) groupClassId: string,
    @Param('scheduleId', ParseUUIDPipe) scheduleId: string,
    @Body() dto: UpdateWeeklyScheduleDto,
  ): Promise<WeeklyScheduleDto> {
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
