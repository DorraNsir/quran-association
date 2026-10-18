import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Injectable,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiProduces,
  ApiTags,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { memoryStorage } from 'multer';

import { AdminApi } from '../academic/admin-api.decorator.js';
import type { AuthPrincipal } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import {
  RegistrationRateLimiter,
  RegistrationRateLimitGuard,
} from '../registration/registration-rate-limit.guard.js';
import { OnboardingEnabledGuard } from './onboarding-enabled.guard.js';
import {
  ApproveOnboardingSubmissionDto,
  CreateOnboardingLinkDto,
  EditOnboardingSubmissionDto,
  ExtendOnboardingLinkDto,
  LinkOnboardingSubmissionDto,
  OnboardingLinkCreatedDto,
  OnboardingLinkDto,
  OnboardingLinkInfoDto,
  OnboardingLinkListQueryDto,
  OnboardingLinkUrlDto,
  OnboardingStatusDto,
  OnboardingSubmissionDetailDto,
  OnboardingSubmissionListDto,
  OnboardingSubmissionListQueryDto,
  OnboardingSubmitAckDto,
  OnboardingSubmitDto,
  OnboardingTokenDto,
  RejectOnboardingSubmissionDto,
} from './student-onboarding.dto.js';
import {
  type IncomingPhoto,
  StudentOnboardingService,
} from './student-onboarding.service.js';

/** Its own per-IP counters (same limits as the public registration form). */
@Injectable()
export class OnboardingRateLimiter extends RegistrationRateLimiter {
  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super(config);
  }
}

@Injectable()
export class OnboardingRateLimitGuard extends RegistrationRateLimitGuard {
  constructor(limiter: OnboardingRateLimiter) {
    super(limiter);
  }
}

const SUBMISSION_ERRORS = {
  conflict: {
    description:
      'ONBOARDING_NOT_PENDING, ONBOARDING_SUBMISSION_CHANGED (stale version), ONBOARDING_POSSIBLE_DUPLICATE (body.possibleMatches — confirm with confirmNoDuplicate), GROUP_CLASS_INACTIVE…',
  },
};

/**
 * TEMPORARY «استكمال بيانات الطلبة» — admin side. Reads stay available when
 * STUDENT_ONBOARDING_ENABLED is false (stored submissions remain readable);
 * every change is refused then.
 */
@ApiTags('admin / student onboarding (temporary)')
@AdminApi()
@UseGuards(OnboardingEnabledGuard)
@Controller('admin/student-onboarding')
export class AdminStudentOnboardingController {
  constructor(private readonly onboarding: StudentOnboardingService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Whether the temporary module is enabled (menu visibility)',
  })
  @ApiOkResponse({ type: OnboardingStatusDto })
  status(): OnboardingStatusDto {
    return { enabled: this.onboarding.enabled() };
  }

  @Get('links')
  @ApiOperation({
    summary: 'Links with their class, status and submission counts (no token)',
  })
  @ApiOkResponse({ type: OnboardingLinkDto, isArray: true })
  links(@Query() query: OnboardingLinkListQueryDto) {
    return this.onboarding.listLinks(query);
  }

  @Post('links')
  @ApiOperation({
    summary:
      'Create the link of a class (one open link per class) — returns its URL once',
  })
  @ApiCreatedResponse({ type: OnboardingLinkCreatedDto })
  @ApiBadRequestResponse({ description: 'ONBOARDING_EXPIRY_PAST, validation' })
  @ApiConflictResponse({
    description: 'ONBOARDING_LINK_EXISTS (body.linkId — extend or replace it)',
  })
  createLink(
    @Body() dto: CreateOnboardingLinkDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.onboarding.createLink(dto, user.userId);
  }

  @Get('links/:id/url')
  @ApiOperation({ summary: 'Reveal the shareable URL of a link (copy / QR)' })
  @ApiOkResponse({ type: OnboardingLinkUrlDto })
  linkUrl(@Param('id', ParseUUIDPipe) id: string) {
    return this.onboarding.linkUrl(id);
  }

  @Patch('links/:id')
  @ApiOperation({
    summary: 'Extend the expiry (re-opens an expired, not revoked link)',
  })
  @ApiOkResponse({ type: OnboardingLinkDto })
  @ApiConflictResponse({ description: 'ONBOARDING_LINK_REVOKED' })
  extendLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExtendOnboardingLinkDto,
  ) {
    return this.onboarding.extendLink(id, dto);
  }

  @Post('links/:id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Disable a link (no new submission; existing ones are kept)',
  })
  @ApiOkResponse({ type: OnboardingLinkDto })
  revokeLink(@Param('id', ParseUUIDPipe) id: string) {
    return this.onboarding.revokeLink(id);
  }

  @Post('links/:id/replace')
  @ApiOperation({
    summary: 'Replace a link: the old one stops at once, a new URL is returned',
  })
  @ApiCreatedResponse({ type: OnboardingLinkCreatedDto })
  replaceLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExtendOnboardingLinkDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.onboarding.replaceLink(id, dto, user.userId);
  }

  @Get('submissions')
  @ApiOkResponse({ type: OnboardingSubmissionListDto })
  submissions(@Query() query: OnboardingSubmissionListQueryDto) {
    return this.onboarding.listSubmissions(query);
  }

  @Get('submissions/:id')
  @ApiOperation({
    summary: 'One submission, its original data and possible duplicates',
  })
  @ApiOkResponse({ type: OnboardingSubmissionDetailDto })
  submission(@Param('id', ParseUUIDPipe) id: string) {
    return this.onboarding.getSubmission(id);
  }

  @Get('submissions/:id/photo')
  @ApiOperation({ summary: 'The photo sent with a submission (image bytes)' })
  @ApiProduces('image/jpeg', 'image/png', 'image/webp')
  @ApiNotFoundResponse({ description: 'ONBOARDING_PHOTO_NOT_FOUND' })
  async photo(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const photo = await this.onboarding.photo(id);
    res.set({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(Buffer.from(photo.data), {
      type: photo.mimeType,
      length: photo.size,
      disposition: 'inline',
    });
  }

  @Patch('submissions/:id')
  @ApiOperation({
    summary: 'Correct the data before approval (the original is kept)',
  })
  @ApiOkResponse({ type: OnboardingSubmissionDetailDto })
  @ApiConflictResponse(SUBMISSION_ERRORS.conflict)
  edit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EditOnboardingSubmissionDto,
  ) {
    return this.onboarding.editSubmission(id, dto);
  }

  @Post('submissions/:id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Approve: create the student in the link’s class (regular student creation)',
  })
  @ApiOkResponse({ type: OnboardingSubmissionDetailDto })
  @ApiConflictResponse(SUBMISSION_ERRORS.conflict)
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveOnboardingSubmissionDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.onboarding.approve(id, dto, user.userId);
  }

  @Post('submissions/:id/link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Approve by matching an existing student (placed in the link’s class; data not overwritten)',
  })
  @ApiOkResponse({ type: OnboardingSubmissionDetailDto })
  @ApiConflictResponse(SUBMISSION_ERRORS.conflict)
  link(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LinkOnboardingSubmissionDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.onboarding.linkExisting(id, dto, user.userId);
  }

  @Post('submissions/:id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: OnboardingSubmissionDetailDto })
  @ApiConflictResponse(SUBMISSION_ERRORS.conflict)
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectOnboardingSubmissionDto,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.onboarding.reject(id, dto, user.userId);
  }
}

/** multer's hard cap; the configured image limit (FILE_MAX_IMAGE_BYTES) is checked by the service. */
const PHOTO_UPLOAD_CAP = 10 * 1024 * 1024;
/** The global ValidationPipe's options, for the multipart `data` field. */
const SUBMIT_PIPE = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequestException({
      code: 'INVALID_BODY',
      message: 'بيانات الاستمارة غير صالحة',
    });
  }
};

/**
 * TEMPORARY public side: no account needed. The token travels in the BODY
 * (never in a URL the API logs); the class always comes from the link.
 */
@ApiTags('public / student onboarding (temporary)')
@Public()
@UseGuards(OnboardingEnabledGuard)
@Controller('public/student-onboarding')
export class PublicStudentOnboardingController {
  constructor(private readonly onboarding: StudentOnboardingService) {}

  @Post('resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check a link and get its (read-only) class' })
  @ApiOkResponse({ type: OnboardingLinkInfoDto })
  @ApiNotFoundResponse({
    description:
      'ONBOARDING_LINK_INVALID (unknown or disabled), STUDENT_ONBOARDING_DISABLED',
  })
  @ApiGoneResponse({ description: 'ONBOARDING_LINK_EXPIRED' })
  resolve(@Body() dto: OnboardingTokenDto) {
    return this.onboarding.resolve(dto.token);
  }

  @Post('submissions')
  @UseGuards(OnboardingRateLimitGuard)
  @ApiOperation({
    summary:
      'Submit the student information (PENDING — never a student or an account)',
  })
  @ApiCreatedResponse({ type: OnboardingSubmitAckDto })
  @ApiBadRequestResponse({
    description:
      'Validation, GUARDIAN_PHONE_REQUIRED, PHONE_REQUIRED, DATE_OF_BIRTH_INVALID',
  })
  @ApiNotFoundResponse({
    description: 'ONBOARDING_LINK_INVALID, STUDENT_ONBOARDING_DISABLED',
  })
  @ApiGoneResponse({ description: 'ONBOARDING_LINK_EXPIRED' })
  @ApiTooManyRequestsResponse({ description: 'TOO_MANY_REQUESTS' })
  @ApiPayloadTooLargeResponse({ description: 'FILE_TOO_LARGE (the photo)' })
  @ApiConsumes('application/json', 'multipart/form-data')
  // Guards (flag, rate limit) run BEFORE the body is read; the photo stays in memory (small images only)
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: PHOTO_UPLOAD_CAP, files: 1, fields: 1, parts: 2 },
    }),
  )
  async submit(
    @Body() body: Record<string, unknown>,
    @UploadedFile() photo?: IncomingPhoto,
  ) {
    // JSON body, or multipart: field `data` (the same JSON) + optional file `photo`
    const raw = typeof body?.data === 'string' ? parseJson(body.data) : body;
    const dto = (await SUBMIT_PIPE.transform(raw, {
      type: 'body',
      metatype: OnboardingSubmitDto,
    })) as OnboardingSubmitDto;
    return this.onboarding.submit(dto, photo);
  }
}
