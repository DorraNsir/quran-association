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
import { SetActivationStatusDto } from '../shared.dto.js';
import {
  CreateTeacherDto,
  TeacherDetailDto,
  TeacherListDto,
  TeacherListQueryDto,
  UpdateTeacherDto,
} from './teacher.dto.js';
import { TeachersService } from './teachers.service.js';

@ApiTags('admin / teachers')
@AdminApi()
@Controller('admin/teachers')
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  @ApiOperation({
    summary:
      'Teachers (paginated; search first/last name or phone; filter status)',
  })
  @ApiOkResponse({ type: TeacherListDto })
  list(@Query() query: TeacherListQueryDto): Promise<TeacherListDto> {
    return this.teachers.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Teacher with supervised and assisted classes (explicit assignments)',
  })
  @ApiOkResponse({ type: TeacherDetailDto })
  @ApiNotFoundResponse({ description: 'TEACHER_NOT_FOUND' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<TeacherDetailDto> {
    return this.teachers.get(id);
  }

  @Post()
  @ApiOperation({
    summary:
      'Create a teacher profile for an existing Person (personId) or a new one (person)',
  })
  @ApiCreatedResponse({ type: TeacherDetailDto })
  @ApiBadRequestResponse({ description: 'PERSON_REQUIRED, invalid fields' })
  @ApiNotFoundResponse({ description: 'PERSON_NOT_FOUND' })
  @ApiConflictResponse({ description: 'TEACHER_PROFILE_EXISTS' })
  create(@Body() dto: CreateTeacherDto): Promise<TeacherDetailDto> {
    return this.teachers.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit teacher fields and the canonical Person (one transaction)',
  })
  @ApiOkResponse({ type: TeacherDetailDto })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeacherDto,
  ): Promise<TeacherDetailDto> {
    return this.teachers.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary:
      'Activate / deactivate (assignments kept; account roles untouched)',
  })
  @ApiOkResponse({ type: TeacherDetailDto })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetActivationStatusDto,
  ): Promise<TeacherDetailDto> {
    return this.teachers.setStatus(id, dto.status);
  }
}
