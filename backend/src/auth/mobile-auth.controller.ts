import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { AuthRateLimiter, withRetryAfter } from './auth-rate-limit.js';
import { AuthService, type AuthResult } from './auth.service.js';
import { AuthErrorCode, type AuthPrincipal } from './auth.types.js';
import { AllowPendingPasswordChange } from './decorators/allow-pending-password-change.decorator.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import {
  MobileAuthResponseDto,
  MobileRefreshTokenDto,
} from './dto/mobile-auth.dto.js';

/**
 * Native-app variant of the auth endpoints: the refresh token travels in the
 * JSON body instead of the HttpOnly cookie (React Native has no secure
 * cookie jar). Every rule lives in the SAME AuthService / SessionService as
 * the web — rotation, reuse detection, inactive accounts, forced password
 * change, revocation — and the SAME rate limiter counters.
 *
 * Origin: native clients send no Origin header; browsers always do on these
 * POSTs. Refusing any Origin keeps body refresh tokens out of browser
 * JavaScript. This is defence in depth only — it does NOT authenticate the
 * client (any non-browser HTTP client can omit the header); the credentials
 * and tokens are what authenticate.
 */
@ApiTags('auth-mobile')
@Controller('auth/mobile')
export class MobileAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly limiter: AuthRateLimiter,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Native app sign-in (refresh token in the body)' })
  @ApiOkResponse({ type: MobileAuthResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid body' })
  @ApiUnauthorizedResponse({ description: 'INVALID_CREDENTIALS' })
  @ApiForbiddenResponse({ description: 'ACCOUNT_INACTIVE, FORBIDDEN_ORIGIN' })
  @ApiTooManyRequestsResponse({
    description: 'TOO_MANY_REQUESTS (Retry-After)',
  })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MobileAuthResponseDto> {
    assertNativeClient(req);
    return toMobile(
      await withRetryAfter(res, () =>
        this.limiter.login(req.ip ?? '', dto.username, () =>
          this.auth.login(dto),
        ),
      ),
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Rotate the refresh token (the old one stops working; replaying it revokes the session)',
  })
  @ApiOkResponse({ type: MobileAuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'SESSION_INVALID' })
  @ApiForbiddenResponse({ description: 'ACCOUNT_INACTIVE, FORBIDDEN_ORIGIN' })
  async refresh(
    @Body() dto: MobileRefreshTokenDto,
    @Req() req: Request,
  ): Promise<MobileAuthResponseDto> {
    assertNativeClient(req);
    return toMobile(await this.auth.refresh(dto.refreshToken));
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'End this session (idempotent; works with an expired access token)',
  })
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'FORBIDDEN_ORIGIN' })
  async logout(
    @Body() dto: MobileRefreshTokenDto,
    @Req() req: Request,
  ): Promise<void> {
    assertNativeClient(req);
    await this.auth.logout(dto.refreshToken);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @AllowPendingPasswordChange()
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Change own password: new session tokens in the body, every other session ended',
  })
  @ApiOkResponse({ type: MobileAuthResponseDto })
  @ApiBadRequestResponse({
    description: 'WRONG_CURRENT_PASSWORD or policy violation',
  })
  @ApiUnauthorizedResponse()
  @ApiForbiddenResponse({ description: 'FORBIDDEN_ORIGIN' })
  @ApiTooManyRequestsResponse({
    description: 'TOO_MANY_REQUESTS (Retry-After)',
  })
  async changePassword(
    @CurrentUser() user: AuthPrincipal,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MobileAuthResponseDto> {
    assertNativeClient(req);
    return toMobile(
      await withRetryAfter(res, () =>
        this.limiter.changePassword(user.userId, () =>
          this.auth.changePassword(user, dto),
        ),
      ),
    );
  }
}

function assertNativeClient(req: Request) {
  if (req.headers.origin !== undefined) {
    throw new ForbiddenException({
      code: AuthErrorCode.ForbiddenOrigin,
      message: 'هذه الواجهة مخصّصة لتطبيق الهاتف',
    });
  }
}

const toMobile = ({ body, refresh }: AuthResult): MobileAuthResponseDto => ({
  accessToken: body.accessToken,
  expiresIn: body.expiresIn,
  user: body.user,
  refreshToken: refresh.token,
  refreshExpiresAt: refresh.expiresAt.toISOString(),
});
