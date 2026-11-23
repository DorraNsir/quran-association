import {
  Body,
  Controller,
  Get,
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
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';

import { AdminApi } from '../academic/admin-api.decorator.js';
import type { AuthPrincipal } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { PaginationQueryDto } from '../common/pagination.js';
import { Role } from '../generated/prisma/enums.js';
import { StudentApi } from '../student-space/student-api.decorator.js';
import { TeacherApi } from '../teaching/teacher-api.decorator.js';
import {
  AdminFeedbackDto,
  AdminFeedbackListDto,
  AdminFeedbackQueryDto,
  CreateFeedbackDto,
  FeedbackDto,
  FeedbackListDto,
  UpdateFeedbackDto,
} from './feedback.dto.js';
import {
  FeedbackService,
  type FeedbackSenderRole,
} from './feedback.service.js';

const SEND_ERRORS =
  'Validation (category, title, description, lengths, unknown fields such as status or sender), FILE_PURPOSE_MISMATCH, FILE_TYPE_NOT_ALLOWED';

/** The same three routes for a teacher and a student: always the ACCOUNT's own feedback. */
function senderRoutes(role: FeedbackSenderRole) {
  class SenderFeedbackRoutes {
    constructor(readonly feedback: FeedbackService) {}

    @Post()
    @ApiOperation({
      summary: 'Send feedback (the sender is the authenticated account)',
    })
    @ApiCreatedResponse({ type: FeedbackDto })
    @ApiBadRequestResponse({ description: SEND_ERRORS })
    @ApiNotFoundResponse({
      description: 'FILE_NOT_FOUND (a screenshot I did not upload)',
    })
    @ApiTooManyRequestsResponse({ description: 'FEEDBACK_RATE_LIMITED' })
    create(
      @CurrentUser() user: AuthPrincipal,
      @Body() dto: CreateFeedbackDto,
    ): Promise<FeedbackDto> {
      return this.feedback.create(user.userId, role, dto);
    }

    @Get()
    @ApiOperation({ summary: '«ملاحظاتي»: my submissions, newest first' })
    @ApiOkResponse({ type: FeedbackListDto })
    list(
      @CurrentUser() user: AuthPrincipal,
      @Query() query: PaginationQueryDto,
    ): Promise<FeedbackListDto> {
      return this.feedback.listMine(user.userId, query);
    }

    @Get(':id')
    @ApiOperation({ summary: 'One of my submissions (another one: 404)' })
    @ApiOkResponse({ type: FeedbackDto })
    @ApiNotFoundResponse({ description: 'FEEDBACK_NOT_FOUND' })
    get(
      @CurrentUser() user: AuthPrincipal,
      @Param('id', ParseUUIDPipe) id: string,
    ): Promise<FeedbackDto> {
      return this.feedback.getMine(user.userId, id);
    }
  }
  return SenderFeedbackRoutes;
}

@ApiTags('teacher / feedback')
@TeacherApi()
@Controller('teacher/feedback')
export class TeacherFeedbackController extends senderRoutes(Role.TEACHER) {
  constructor(feedback: FeedbackService) {
    super(feedback);
  }
}

@ApiTags('student / feedback')
@StudentApi()
@Controller('student/feedback')
export class StudentFeedbackController extends senderRoutes(Role.STUDENT) {
  constructor(feedback: FeedbackService) {
    super(feedback);
  }
}

@ApiTags('admin / feedback')
@AdminApi()
@Controller('admin/feedback')
export class AdminFeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  @ApiOperation({
    summary:
      'All feedback (filters: status, category, search by title or sender)',
  })
  @ApiOkResponse({ type: AdminFeedbackListDto })
  list(@Query() query: AdminFeedbackQueryDto): Promise<AdminFeedbackListDto> {
    return this.feedback.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: AdminFeedbackDto })
  @ApiNotFoundResponse({ description: 'FEEDBACK_NOT_FOUND' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminFeedbackDto> {
    return this.feedback.get(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Change its status and / or the response (the sender is told once)',
  })
  @ApiOkResponse({ type: AdminFeedbackDto })
  @ApiNotFoundResponse({ description: 'FEEDBACK_NOT_FOUND' })
  @ApiConflictResponse({ description: 'FEEDBACK_CHANGED (stale version)' })
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFeedbackDto,
  ): Promise<AdminFeedbackDto> {
    return this.feedback.update(user.userId, id, dto);
  }
}
