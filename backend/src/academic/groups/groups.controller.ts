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
  CreateGroupDto,
  GroupDetailDto,
  GroupListDto,
  GroupListQueryDto,
  UpdateGroupDto,
} from './group.dto.js';
import { GroupsService } from './groups.service.js';

@ApiTags('admin / groups')
@AdminApi()
@Controller('admin/groups')
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Groups (paginated; search name/audience; filter status) with class/student counts',
  })
  @ApiOkResponse({ type: GroupListDto })
  list(@Query() query: GroupListQueryDto): Promise<GroupListDto> {
    return this.groups.list(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Group with its classes (branch, room, supervisor, counts)',
  })
  @ApiOkResponse({ type: GroupDetailDto })
  @ApiNotFoundResponse({ description: 'GROUP_NOT_FOUND' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<GroupDetailDto> {
    return this.groups.get(id);
  }

  @Post()
  @ApiCreatedResponse({ type: GroupDetailDto })
  @ApiConflictResponse({ description: 'GROUP_NAME_TAKEN' })
  create(@Body() dto: CreateGroupDto): Promise<GroupDetailDto> {
    return this.groups.create(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: GroupDetailDto })
  @ApiConflictResponse({ description: 'GROUP_NAME_TAKEN' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGroupDto,
  ): Promise<GroupDetailDto> {
    return this.groups.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'ACTIVE / INACTIVE / ARCHIVED (classes keep their own status)',
  })
  @ApiOkResponse({ type: GroupDetailDto })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRecordStatusDto,
  ): Promise<GroupDetailDto> {
    return this.groups.setStatus(id, dto.status);
  }
}
