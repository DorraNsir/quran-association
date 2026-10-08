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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';

import { AdminApi } from '../academic/admin-api.decorator.js';
import type { AuthPrincipal } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { RegistrationRateLimitGuard } from './registration-rate-limit.guard.js';
import {
  AcceptRegistrationRequestDto,
  AcceptRegistrationResultDto,
  PublicRegistrationAckDto,
  RegistrationFieldsDto,
  RegistrationRequestDto,
  RegistrationRequestListDto,
  RegistrationRequestListQueryDto,
  RejectRegistrationRequestDto,
  UpdateRegistrationRequestDto,
} from './registration.dto.js';
import { RegistrationService } from './registration.service.js';

@ApiTags('public / registration')
@Public()
@Controller('public/registration-requests')
export class PublicRegistrationController {
  constructor(private readonly registration: RegistrationService) {}

  @Post()
  @UseGuards(RegistrationRateLimitGuard)
  @ApiOperation({
    summary: 'Submit a registration request from the public website',
    description:
      'No authentication. Always stored as source PUBLIC_WEBSITE, status PENDING; status/source/reviewer/student fields are not accepted. Never creates an account or a student. Rate-limited per IP.',
  })
  @ApiCreatedResponse({ type: PublicRegistrationAckDto })
  @ApiBadRequestResponse({
    description:
      'Validation, BIRTH_DATE_OR_AGE_REQUIRED, INVALID_BIRTH_DATE, GUARDIAN_PHONE_REQUIRED, INTERESTED_GROUP_INVALID',
  })
  @ApiTooManyRequestsResponse({ description: 'TOO_MANY_REQUESTS' })
  submit(
    @Body() dto: RegistrationFieldsDto,
  ): Promise<PublicRegistrationAckDto> {
    return this.registration.submitPublic(dto);
  }
}

@ApiTags('admin / registration requests')
@AdminApi()
@Controller('admin/registration-requests')
export class AdminRegistrationController {
  constructor(private readonly registration: RegistrationService) {}

  @Get()
  @ApiOperation({
    summary:
      'Registration requests (filters: status, source, interested group, submission dates, search by name/phone)',
  })
  @ApiOkResponse({ type: RegistrationRequestListDto })
  list(
    @Query() query: RegistrationRequestListQueryDto,
  ): Promise<RegistrationRequestListDto> {
    return this.registration.list(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: RegistrationRequestDto })
  @ApiNotFoundResponse({ description: 'REGISTRATION_REQUEST_NOT_FOUND' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<RegistrationRequestDto> {
    return this.registration.get(id);
  }

  @Post()
  @ApiOperation({
    summary:
      'Enter a request on behalf of an applicant (source ADMIN, PENDING)',
  })
  @ApiCreatedResponse({ type: RegistrationRequestDto })
  @ApiBadRequestResponse({
    description:
      'BIRTH_DATE_OR_AGE_REQUIRED, INVALID_BIRTH_DATE, GUARDIAN_PHONE_REQUIRED',
  })
  @ApiNotFoundResponse({ description: 'GROUP_NOT_FOUND' })
  @ApiConflictResponse({ description: 'GROUP_INACTIVE' })
  create(
    @Body() dto: RegistrationFieldsDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<RegistrationRequestDto> {
    return this.registration.create(dto, user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit a PENDING request' })
  @ApiOkResponse({ type: RegistrationRequestDto })
  @ApiConflictResponse({ description: 'REGISTRATION_REQUEST_ALREADY_REVIEWED' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRegistrationRequestDto,
  ): Promise<RegistrationRequestDto> {
    return this.registration.update(id, dto);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Accept: create (or explicitly link) the student, atomically',
    description:
      'Locks the request; the class, its group and branch must be active. Creates Person + Student + first enrollment + first status (or links `personId`), then marks the request ACCEPTED with the reviewer and time. Creates no account and no payment obligation. Same name/phone as an existing person → 409 POSSIBLE_DUPLICATE_PERSON (link with personId or set confirmNewPerson).',
  })
  @ApiOkResponse({ type: AcceptRegistrationResultDto })
  @ApiBadRequestResponse({
    description:
      'ACCEPTANCE_DATA_MISSING, PERSON_CHOICE_AMBIGUOUS, REGISTRATION_DATE_IN_FUTURE, DATE_OF_BIRTH_REQUIRED, GUARDIAN_PHONE_REQUIRED, PHONE_REQUIRED',
  })
  @ApiNotFoundResponse({
    description:
      'REGISTRATION_REQUEST_NOT_FOUND, GROUP_CLASS_NOT_FOUND, PERSON_NOT_FOUND',
  })
  @ApiConflictResponse({
    description:
      'REGISTRATION_REQUEST_ALREADY_REVIEWED, GROUP_CLASS_INACTIVE, GROUP_INACTIVE, BRANCH_INACTIVE, POSSIBLE_DUPLICATE_PERSON, STUDENT_PROFILE_EXISTS, CIN_TAKEN',
  })
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AcceptRegistrationRequestDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<AcceptRegistrationResultDto> {
    return this.registration.accept(id, dto, user.userId);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refuse a PENDING request (optional reason; nothing is created)',
  })
  @ApiOkResponse({ type: RegistrationRequestDto })
  @ApiNotFoundResponse({ description: 'REGISTRATION_REQUEST_NOT_FOUND' })
  @ApiConflictResponse({ description: 'REGISTRATION_REQUEST_ALREADY_REVIEWED' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectRegistrationRequestDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<RegistrationRequestDto> {
    return this.registration.reject(id, dto, user.userId);
  }
}
