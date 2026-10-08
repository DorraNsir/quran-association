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
import { SetActivationStatusDto } from '../shared.dto.js';
import {
  CreateRoomDto,
  RoomDto,
  RoomListDto,
  RoomListQueryDto,
  UpdateRoomDto,
} from './room.dto.js';
import { RoomsService } from './rooms.service.js';

@ApiTags('admin / rooms')
@AdminApi()
@Controller('admin/rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  @ApiOperation({
    summary: 'Rooms (paginated; filter branchId, status; search name)',
  })
  @ApiOkResponse({ type: RoomListDto })
  list(@Query() query: RoomListQueryDto): Promise<RoomListDto> {
    return this.rooms.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: RoomDto })
  @ApiNotFoundResponse({ description: 'ROOM_NOT_FOUND' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<RoomDto> {
    return this.rooms.get(id);
  }

  @Post()
  @ApiCreatedResponse({ type: RoomDto })
  @ApiNotFoundResponse({ description: 'BRANCH_NOT_FOUND' })
  @ApiConflictResponse({ description: 'BRANCH_INACTIVE, ROOM_NAME_TAKEN' })
  create(@Body() dto: CreateRoomDto): Promise<RoomDto> {
    return this.rooms.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename (a room never changes branch)' })
  @ApiOkResponse({ type: RoomDto })
  @ApiConflictResponse({ description: 'ROOM_NAME_TAKEN' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoomDto,
  ): Promise<RoomDto> {
    return this.rooms.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOkResponse({ type: RoomDto })
  @ApiConflictResponse({ description: 'BRANCH_INACTIVE (activation)' })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetActivationStatusDto,
  ): Promise<RoomDto> {
    return this.rooms.setStatus(id, dto.status);
  }
}
