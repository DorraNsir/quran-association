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

import { AdminApi } from '../admin-api.decorator.js';
import { SetRecordStatusDto } from '../shared.dto.js';
import {
  AssignStudentGroupClassDto,
  CreateStudentDto,
  StudentDto,
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
  create(@Body() dto: CreateStudentDto): Promise<StudentDto> {
    return this.students.create(dto);
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
      'Assign / move to another ACTIVE class (always exactly one current class)',
  })
  @ApiOkResponse({ type: StudentDto })
  @ApiNotFoundResponse({
    description: 'STUDENT_NOT_FOUND, GROUP_CLASS_NOT_FOUND',
  })
  @ApiConflictResponse({ description: 'GROUP_CLASS_INACTIVE' })
  assignGroupClass(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignStudentGroupClassDto,
  ): Promise<StudentDto> {
    return this.students.assignGroupClass(id, dto.groupClassId);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary:
      'ACTIVE / INACTIVE / ARCHIVED (activation needs an active class; account roles untouched)',
  })
  @ApiOkResponse({ type: StudentDto })
  @ApiConflictResponse({
    description: 'GROUP_CLASS_INACTIVE, GROUP_CLASS_REQUIRED',
  })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRecordStatusDto,
  ): Promise<StudentDto> {
    return this.students.setStatus(id, dto.status);
  }
}
