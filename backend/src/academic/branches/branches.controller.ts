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
  BranchDto,
  BranchListDto,
  BranchListQueryDto,
  CreateBranchDto,
  UpdateBranchDto,
} from './branch.dto.js';
import { BranchesService } from './branches.service.js';

@ApiTags('admin / branches')
@AdminApi()
@Controller('admin/branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @ApiOperation({
    summary: 'Branches (paginated; search name/address; filter status)',
  })
  @ApiOkResponse({ type: BranchListDto })
  list(@Query() query: BranchListQueryDto): Promise<BranchListDto> {
    return this.branches.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: BranchDto })
  @ApiNotFoundResponse({ description: 'BRANCH_NOT_FOUND' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<BranchDto> {
    return this.branches.get(id);
  }

  @Post()
  @ApiCreatedResponse({ type: BranchDto })
  @ApiConflictResponse({ description: 'BRANCH_NAME_TAKEN' })
  create(@Body() dto: CreateBranchDto): Promise<BranchDto> {
    return this.branches.create(dto);
  }

  @Patch(':id')
  @ApiOkResponse({ type: BranchDto })
  @ApiConflictResponse({ description: 'BRANCH_NAME_TAKEN' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
  ): Promise<BranchDto> {
    return this.branches.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary:
      'Activate / deactivate (never deleted: rooms, classes and history reference it)',
  })
  @ApiOkResponse({ type: BranchDto })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetActivationStatusDto,
  ): Promise<BranchDto> {
    return this.branches.setStatus(id, dto.status);
  }
}
