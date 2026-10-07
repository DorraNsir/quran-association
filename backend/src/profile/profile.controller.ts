import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { AuthPrincipal } from '../auth/auth.types.js';
import { AllowPendingPasswordChange } from '../auth/decorators/allow-pending-password-change.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { ProfileDto, UpdateProfileDto } from './dto/profile.dto.js';
import { ProfileService } from './profile.service.js';

/** ملفي الشخصي — any authenticated user, about THEMSELVES only (no id in the URL). */
@ApiTags('profile')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing / invalid access token' })
@Controller('profile')
export class ProfileController {
  constructor(private readonly profile: ProfileService) {}

  @Get()
  @AllowPendingPasswordChange() // readable while the temporary password is still pending
  @ApiOperation({
    summary:
      'My profile: person, account (read-only), teacher / student profile',
  })
  @ApiOkResponse({ type: ProfileDto })
  get(@CurrentUser() user: AuthPrincipal): Promise<ProfileDto> {
    return this.profile.get(user.userId);
  }

  @Patch()
  @ApiOperation({
    summary: 'Edit my contact details (phone, email, address)',
    description:
      'Name, username, roles, status and photo are not editable here (400 if sent).',
  })
  @ApiOkResponse({ type: ProfileDto })
  @ApiBadRequestResponse({
    description: 'Invalid value or a non-editable field',
  })
  @ApiForbiddenResponse({ description: 'PASSWORD_CHANGE_REQUIRED' })
  update(
    @CurrentUser() user: AuthPrincipal,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileDto> {
    return this.profile.update(user.userId, dto);
  }
}
