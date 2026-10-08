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

import type { AuthPrincipal } from '../../auth/auth.types.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { AdminApi } from '../admin-api.decorator.js';
import {
  AssignStudentGroupClassDto,
  CreateStudentDto,
  StudentDto,
  SetStudentStatusDto,
  StudentEnrollmentDto,
  StudentStatusChangeDto,
  StudentListDto,
  StudentListQueryDto,
  UpdateStudentDto,
} from './student.dto.js';
import { StudentsService } from './students.service.js';

@ApiTags('admin / students')
@AdminApi()
@Controller('admin/students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Students (paginated; search name / phone / guardian phone / CIN; filter status, class, group, branch, supervisor)',
  })
  @ApiOkResponse({ type: StudentListDto })
  list(@Query() query: StudentListQueryDto): Promise<StudentListDto> {
    return this.students.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: StudentDto })
  @ApiNotFoundResponse({ description: 'STUDENT_NOT_FOUND' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<StudentDto> {
    return this.students.get(id);
  }

  @Post()
  @ApiOperation({
    summary:
      'Create a student (existing Person or new one) in one ACTIVE class',
  })
  @ApiCreatedResponse({ type: StudentDto })
  @ApiBadRequestResponse({
    description:
      'PERSON_REQUIRED, DATE_OF_BIRTH_REQUIRED, PHONE_REQUIRED, GUARDIAN_PHONE_REQUIRED',
  })
  @ApiNotFoundResponse({
    description: 'PERSON_NOT_FOUND, GROUP_CLASS_NOT_FOUND',
  })
  @ApiConflictResponse({
    description: 'STUDENT_PROFILE_EXISTS, CIN_TAKEN, GROUP_CLASS_INACTIVE',
  })
  create(
    @CurrentUser() actor: AuthPrincipal,
    @Body() dto: CreateStudentDto,
  ): Promise<StudentDto> {
    return this.students.create(dto, actor.userId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit student fields and the canonical Person (one transaction)',
  })
  @ApiOkResponse({ type: StudentDto })
  @ApiConflictResponse({ description: 'CIN_TAKEN' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
  ): Promise<StudentDto> {
    return this.students.update(id, dto);
  }

  @Patch(':id/group-class')
  @ApiOperation({
    summary:
      'Assign / move to another ACTIVE class at an effective date (closes the open enrollment, opens a new one; no payment created)',
  })
  @ApiOkResponse({ type: StudentDto })
  @ApiNotFoundResponse({
    description: 'STUDENT_NOT_FOUND, GROUP_CLASS_NOT_FOUND',
  })
  @ApiBadRequestResponse({ description: 'FUTURE_EFFECTIVE_DATE' })
  @ApiConflictResponse({
    description: 'GROUP_CLASS_INACTIVE, EFFECTIVE_DATE_BEFORE_CURRENT',
  })
  assignGroupClass(
    @CurrentUser() actor: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignStudentGroupClassDto,
  ): Promise<StudentDto> {
    return this.students.assignGroupClass(
      id,
      dto.groupClassId,
      dto.effectiveDate,
      actor.userId,
    );
  }

  @Get(':id/enrollments')
  @ApiOperation({
    summary:
      'Class-membership history with effective dates (newest first; endDate exclusive)',
  })
  @ApiOkResponse({ type: StudentEnrollmentDto, isArray: true })
  @ApiNotFoundResponse({ description: 'STUDENT_NOT_FOUND' })
  enrollments(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StudentEnrollmentDto[]> {
    return this.students.enrollments(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary:
      'ACTIVE / INACTIVE / ARCHIVED (activation needs an active class; account roles untouched)',
  })
  @ApiOkResponse({ type: StudentDto })
  @ApiBadRequestResponse({
    description: 'FUTURE_EFFECTIVE_DATE, EFFECTIVE_DATE_BEFORE_REGISTRATION',
  })
  @ApiConflictResponse({
    description: 'GROUP_CLASS_INACTIVE, GROUP_CLASS_REQUIRED',
  })
  setStatus(
    @CurrentUser() actor: AuthPrincipal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetStudentStatusDto,
  ): Promise<StudentDto> {
    return this.students.setStatus(
      id,
      dto.status,
      dto.effectiveDate,
      actor.userId,
    );
  }

  @Get(':id/status-history')
  @ApiOperation({
    summary: 'Status history with effective dates (newest first)',
  })
  @ApiOkResponse({ type: StudentStatusChangeDto, isArray: true })
  @ApiNotFoundResponse({ description: 'STUDENT_NOT_FOUND' })
  statusHistory(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StudentStatusChangeDto[]> {
    return this.students.statusHistory(id);
  }
}
