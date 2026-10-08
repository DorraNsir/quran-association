import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { AdminApi } from '../academic/admin-api.decorator.js';
import type { AuthPrincipal } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { SettingsDto, UpdateSettingsDto } from './settings.dto.js';
import { SettingsService } from './settings.service.js';

@ApiTags('admin / settings')
@AdminApi()
@Controller('admin/settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Association, platform and website settings (no secrets)',
    description:
      'The public subset stays at GET /api/public/site-settings. timezone and currentAcademicYear are read-only here.',
  })
  @ApiOkResponse({ type: SettingsDto })
  get(): Promise<SettingsDto> {
    return this.settings.get();
  }

  @Patch()
  @ApiOperation({
    summary: 'Partial update of one or more sections (only sent fields change)',
    description:
      'Unknown fields (timezone, ids, academic year…) are rejected. Logo: an ASSOCIATION_LOGO upload id.',
  })
  @ApiOkResponse({ type: SettingsDto })
  @ApiBadRequestResponse({
    description:
      'Validation (Tunisian phone, email…), SETTINGS_EMPTY_UPDATE, SETTINGS_INVALID_URL, FILE_PURPOSE_MISMATCH, FILE_TYPE_NOT_ALLOWED',
  })
  @ApiNotFoundResponse({ description: 'FILE_NOT_FOUND (logo)' })
  @ApiConflictResponse({ description: 'SETTINGS_NOT_INITIALIZED' })
  update(
    @Body() dto: UpdateSettingsDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<SettingsDto> {
    return this.settings.update(dto, user.userId);
  }
}
