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
  CreateGroupClassDto,
  GroupClassDetailDto,
  GroupClassListDto,
  GroupClassListQueryDto,
  UpdateGroupClassDto,
} from './group-class.dto.js';
import { GroupClassesService } from './group-classes.service.js';

@ApiTags('admin / group classes')
@AdminApi()
@Controller('admin/group-classes')
export class GroupClassesController {
  constructor(private readonly classes: GroupClassesService) {}

  @Get()
  @ApiOperation({
    summary:
      'Classes (paginated; filter group, branch, room, supervisor, teacher, status)',
  })
  @ApiOkResponse({ type: GroupClassListDto })
  list(@Query() query: GroupClassListQueryDto): Promise<GroupClassListDto> {
    return this.classes.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Class with group, branch, room, supervisor, assistants and current students',
  })
  @ApiOkResponse({ type: GroupClassDetailDto })
  @ApiNotFoundResponse({ description: 'GROUP_CLASS_NOT_FOUND' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<GroupClassDetailDto> {
    return this.classes.get(id);
  }

  @Post()
  @ApiCreatedResponse({ type: GroupClassDetailDto })
  @ApiBadRequestResponse({
    description:
      'ROOM_NOT_IN_BRANCH, SUPERVISOR_IS_ASSISTANT, DUPLICATE_ASSISTANT',
  })
  @ApiNotFoundResponse({
    description: 'GROUP / BRANCH / ROOM / TEACHER _NOT_FOUND',
  })
  @ApiConflictResponse({
    description:
      'GROUP_INACTIVE, BRANCH_INACTIVE, ROOM_INACTIVE, TEACHER_INACTIVE',
  })
  create(@Body() dto: CreateGroupClassDto): Promise<GroupClassDetailDto> {
    return this.classes.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Move (branch + room) and/or change supervisor / replace the assistant list',
  })
  @ApiOkResponse({ type: GroupClassDetailDto })
  @ApiBadRequestResponse({
    description:
      'ROOM_NOT_IN_BRANCH, SUPERVISOR_IS_ASSISTANT, DUPLICATE_ASSISTANT',
  })
  @ApiConflictResponse({
    description: 'BRANCH_INACTIVE, ROOM_INACTIVE, TEACHER_INACTIVE',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGroupClassDto,
  ): Promise<GroupClassDetailDto> {
    return this.classes.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary:
      'ACTIVE / INACTIVE / ARCHIVED (activation re-checks group, branch, room, supervisor)',
  })
  @ApiOkResponse({ type: GroupClassDetailDto })
  @ApiConflictResponse({
    description:
      'GROUP_INACTIVE, BRANCH_INACTIVE, ROOM_INACTIVE, TEACHER_INACTIVE',
  })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRecordStatusDto,
  ): Promise<GroupClassDetailDto> {
    return this.classes.setStatus(id, dto.status);
  }
}
