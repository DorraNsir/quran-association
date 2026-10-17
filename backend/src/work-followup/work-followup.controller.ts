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
} from '@nestjs/swagger';

import { AdminApi } from '../academic/admin-api.decorator.js';
import type { AuthPrincipal } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { StudentAccessService } from '../student-space/student-access.service.js';
import { StudentApi } from '../student-space/student-api.decorator.js';
import { TeacherApi } from '../teaching/teacher-api.decorator.js';
import {
  AddWorkItemsDto,
  CreateWorkProgramDto,
  EligibleSessionDto,
  EligibleSessionsQueryDto,
  EvaluateWorkItemDto,
  EvaluateWorkProgramDto,
  NextRecitationDto,
  ScheduleWorkItemDto,
  StudentWorkProgramDto,
  StudentWorkProgramListDto,
  StudentWorkProgramQueryDto,
  UpdateWorkProgramDto,
  WorkItemEditDto,
  WorkProgramDto,
  WorkProgramListDto,
  WorkProgramListQueryDto,
  WorkSessionDto,
} from './work-followup.dto.js';
import {
  WorkFollowupService,
  type WorkActor,
} from './work-followup.service.js';

const DOC = {
  conflict: {
    description:
      'WORK_PROGRAM_EXISTS (body.programId), WORK_SESSION_CANCELLED, WORK_SESSION_NOT_UPCOMING, WORK_ITEM_NOT_TRANSFERABLE, WORK_ITEM_ALREADY_TRANSFERRED, WORK_RECITATION_ALREADY_PLANNED, WORK_ITEM_CHANGED / WORK_PROGRAM_CHANGED (stale version — reload)',
  },
  bad: {
    description:
      'Validation, WORK_STUDENT_NOT_IN_SESSION, WORK_TARGET_SESSION_NOT_LATER, WORK_ITEM_NOT_RECITATION, WORK_RECITATION_NUMBER_REQUIRED, WORK_ITEM_TYPE_LOCKED, WORK_PROGRAM_VERSION_REQUIRED',
  },
  missing: {
    description:
      'WORK_PROGRAM_NOT_FOUND, WORK_ITEM_NOT_FOUND, STUDENT_NOT_FOUND, SESSION_NOT_FOUND',
  },
};

/**
 * The same «متابعة العمل» operations for both workspaces; only the actor
 * differs (an admin acts on any session, a teacher only on sessions of their
 * team snapshot — checked by the service on every call).
 */
abstract class WorkFollowupRoutes {
  constructor(protected readonly work: WorkFollowupService) {}
  protected abstract actor(user: AuthPrincipal): WorkActor;

  @Get('work-programs')
  @ApiOperation({
    summary:
      'Work programs (filters, pagination); each with its items and progress',
  })
  @ApiOkResponse({ type: WorkProgramListDto })
  list(
    @CurrentUser() user: AuthPrincipal,
    @Query() query: WorkProgramListQueryDto,
  ) {
    return this.work.list(this.actor(user), query);
  }

  @Get('work-programs/session-options')
  @ApiOperation({
    summary: 'Sessions that have work programs (the session filter)',
  })
  @ApiOkResponse({ type: WorkSessionDto, isArray: true })
  sessionOptions(@CurrentUser() user: AuthPrincipal) {
    return this.work.sessionOptions(this.actor(user));
  }

  @Get('work-programs/eligible-sessions')
  @ApiOperation({
    summary:
      "A student's existing upcoming sessions that may receive work (never a free date)",
  })
  @ApiOkResponse({ type: EligibleSessionDto, isArray: true })
  @ApiNotFoundResponse(DOC.missing)
  eligibleSessions(
    @CurrentUser() user: AuthPrincipal,
    @Query() query: EligibleSessionsQueryDto,
  ) {
    return this.work.eligibleSessions(this.actor(user), query);
  }

  @Get('work-programs/:id')
  @ApiOkResponse({ type: WorkProgramDto })
  @ApiNotFoundResponse(DOC.missing)
  get(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.work.get(this.actor(user), id);
  }

  @Post('work-programs')
  @ApiOperation({
    summary: 'Create a program (one per student per session) with its items',
  })
  @ApiCreatedResponse({ type: WorkProgramDto })
  @ApiBadRequestResponse(DOC.bad)
  @ApiNotFoundResponse(DOC.missing)
  @ApiConflictResponse(DOC.conflict)
  create(
    @CurrentUser() user: AuthPrincipal,
    @Body() dto: CreateWorkProgramDto,
  ) {
    return this.work.create(this.actor(user), dto);
  }

  @Patch('work-programs/:id')
  @ApiOperation({
    summary:
      'Edit a program at once: notes, saved items (planning only), new items — saved items are never deleted',
  })
  @ApiOkResponse({ type: WorkProgramDto })
  @ApiBadRequestResponse(DOC.bad)
  @ApiNotFoundResponse(DOC.missing)
  @ApiConflictResponse(DOC.conflict)
  update(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkProgramDto,
  ) {
    return this.work.update(this.actor(user), id, dto);
  }

  @Post('work-programs/:id/items')
  @ApiOperation({ summary: 'Add items to a program' })
  @ApiCreatedResponse({ type: WorkProgramDto })
  @ApiNotFoundResponse(DOC.missing)
  @ApiConflictResponse(DOC.conflict)
  addItems(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddWorkItemsDto,
  ) {
    return this.work.addItems(this.actor(user), id, dto);
  }

  @Patch('work-programs/:id/evaluation')
  @ApiOperation({
    summary: 'Evaluate several items (and notes) at once — «حفظ التقييم»',
  })
  @ApiOkResponse({ type: WorkProgramDto })
  @ApiNotFoundResponse(DOC.missing)
  @ApiConflictResponse(DOC.conflict)
  evaluate(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EvaluateWorkProgramDto,
  ) {
    return this.work.evaluate(this.actor(user), id, dto);
  }

  @Patch('work-items/:id')
  @ApiOperation({
    summary: "Edit one item's planning (type, description, number)",
  })
  @ApiOkResponse({ type: WorkProgramDto })
  @ApiBadRequestResponse(DOC.bad)
  @ApiNotFoundResponse(DOC.missing)
  @ApiConflictResponse(DOC.conflict)
  updateItem(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WorkItemEditDto,
  ) {
    return this.work.updateItem(this.actor(user), id, dto);
  }

  @Patch('work-items/:id/evaluation')
  @ApiOperation({ summary: 'Evaluate one item (status + comment)' })
  @ApiOkResponse({ type: WorkProgramDto })
  @ApiNotFoundResponse(DOC.missing)
  @ApiConflictResponse(DOC.conflict)
  evaluateItem(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EvaluateWorkItemDto,
  ) {
    return this.work.evaluateItem(this.actor(user), id, dto);
  }

  @Post('work-items/:id/transfer')
  @ApiOperation({
    summary:
      '«نقل إلى الحصة القادمة»: the same unfinished task into a later upcoming session (returns the target program)',
  })
  @ApiCreatedResponse({ type: WorkProgramDto })
  @ApiBadRequestResponse(DOC.bad)
  @ApiNotFoundResponse(DOC.missing)
  @ApiConflictResponse(DOC.conflict)
  transfer(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ScheduleWorkItemDto,
  ) {
    return this.work.transfer(this.actor(user), id, dto);
  }

  @Post('work-items/:id/next-recitation')
  @ApiOperation({
    summary:
      '«إضافة العرضة التالية»: recitation number + 1 into a later upcoming session (returns the target program)',
  })
  @ApiCreatedResponse({ type: WorkProgramDto })
  @ApiBadRequestResponse(DOC.bad)
  @ApiNotFoundResponse(DOC.missing)
  @ApiConflictResponse(DOC.conflict)
  nextRecitation(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NextRecitationDto,
  ) {
    return this.work.nextRecitation(this.actor(user), id, dto);
  }
}

@ApiTags('admin / work follow-up')
@AdminApi()
@Controller('admin')
export class AdminWorkFollowupController extends WorkFollowupRoutes {
  constructor(work: WorkFollowupService) {
    super(work);
  }
  protected actor(user: AuthPrincipal): WorkActor {
    return { kind: 'admin', userId: user.userId };
  }
}

@ApiTags('teacher / work follow-up')
@TeacherApi()
@Controller('teacher')
export class TeacherWorkFollowupController extends WorkFollowupRoutes {
  constructor(work: WorkFollowupService) {
    super(work);
  }
  protected actor(user: AuthPrincipal): WorkActor {
    return { kind: 'teacher', userId: user.userId };
  }
}

/**
 * The signed-in student's OWN work programs — read-only (GET only: no
 * creation, edit, evaluation or transfer). The student comes from the
 * account (StudentAccessService), never from the request.
 */
@ApiTags('student / work follow-up')
@StudentApi()
@Controller('student/work-programs')
export class StudentWorkFollowupController {
  constructor(
    private readonly work: WorkFollowupService,
    private readonly access: StudentAccessService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'My work programs (upcoming / past), with items and results',
  })
  @ApiOkResponse({ type: StudentWorkProgramListDto })
  async list(
    @CurrentUser() user: AuthPrincipal,
    @Query() query: StudentWorkProgramQueryDto,
  ) {
    const { studentId } = await this.access.scopeOf(user.userId);
    return this.work.listForStudent(studentId, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: StudentWorkProgramDto })
  @ApiNotFoundResponse({
    description: 'WORK_PROGRAM_NOT_FOUND (also for another student’s program)',
  })
  async get(
    @CurrentUser() user: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const { studentId } = await this.access.scopeOf(user.userId);
    return this.work.getForStudent(studentId, id);
  }
}
