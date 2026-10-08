import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import {
  AcademicYearDto,
  CreateAcademicYearDto,
  UpdateAcademicYearDto,
} from './academic-year.dto.js';
import { AcademicYearsService } from './academic-years.service.js';

@ApiTags('admin / academic years')
@AdminApi()
@Controller('admin/academic-years')
export class AcademicYearsController {
  constructor(private readonly years: AcademicYearsService) {}

  @Get()
  @ApiOperation({
    summary:
      'All academic years, newest first (a handful of rows — not paginated)',
  })
  @ApiOkResponse({ type: AcademicYearDto, isArray: true })
  list(): Promise<AcademicYearDto[]> {
    return this.years.list();
  }

  @Get(':id')
  @ApiOkResponse({ type: AcademicYearDto })
  @ApiNotFoundResponse({ description: 'ACADEMIC_YEAR_NOT_FOUND' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AcademicYearDto> {
    return this.years.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a year (not current until set-current)' })
  @ApiCreatedResponse({ type: AcademicYearDto })
  @ApiBadRequestResponse({ description: 'INVALID_DATES, INVALID_SEMESTERS' })
  @ApiConflictResponse({ description: 'LABEL_TAKEN, YEARS_OVERLAP' })
  create(@Body() dto: CreateAcademicYearDto): Promise<AcademicYearDto> {
    return this.years.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit label / dates / second-semester start' })
  @ApiOkResponse({ type: AcademicYearDto })
  @ApiConflictResponse({ description: 'LABEL_TAKEN, YEARS_OVERLAP' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAcademicYearDto,
  ): Promise<AcademicYearDto> {
    return this.years.update(id, dto);
  }

  @Post(':id/set-current')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Make this the ONLY current year (atomic; historical data untouched)',
  })
  @ApiOkResponse({ type: AcademicYearDto })
  @ApiConflictResponse({
    description: 'CURRENT_YEAR_CONFLICT (concurrent switch)',
  })
  setCurrent(@Param('id', ParseUUIDPipe) id: string): Promise<AcademicYearDto> {
    return this.years.setCurrent(id);
  }
}
