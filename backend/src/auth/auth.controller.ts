import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';

import type { EnvironmentVariables } from '../config/env.validation.js';
import { parseOrigins } from '../config/frontend-origins.js';
import { AuthService, type AuthResult } from './auth.service.js';
import { AuthErrorCode, type AuthPrincipal } from './auth.types.js';
import { AllowPendingPasswordChange } from './decorators/allow-pending-password-change.decorator.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { AuthResponseDto, MeDto } from './dto/auth-response.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import {
  clearRefreshCookie,
  readRefreshCookie,
  REFRESH_COOKIE,
  setRefreshCookie,
} from './refresh-cookie.js';
import { SessionService } from './session.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly env: EnvironmentVariables;
  private readonly allowedOrigins: string[];

  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.env = {
      NODE_ENV: config.get('NODE_ENV', { infer: true }),
      REFRESH_COOKIE_SAMESITE: config.get('REFRESH_COOKIE_SAMESITE', {
        infer: true,
      }),
    } as EnvironmentVariables;
    this.allowedOrigins = parseOrigins(
      config.get('FRONTEND_URL', { infer: true }),
    );
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Sign in with username + password (sets the HttpOnly refresh cookie)',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid body' })
  @ApiUnauthorizedResponse({
    description:
      'INVALID_CREDENTIALS (same answer for unknown user / wrong password)',
  })
  @ApiForbiddenResponse({ description: 'ACCOUNT_INACTIVE' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    return this.respond(res, await this.auth.login(dto));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({
    summary: 'Rotate the refresh cookie and get a new access token',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({
    description:
      'SESSION_INVALID (missing, expired, revoked or replayed token)',
  })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    this.assertAllowedOrigin(req);
    try {
      return this.respond(res, await this.auth.refresh(readRefreshCookie(req)));
    } catch (error) {
      clearRefreshCookie(res, this.env);
      throw error;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({
    summary:
      'End the current session (works even with an expired access token)',
  })
  @ApiNoContentResponse()
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    this.assertAllowedOrigin(req);
    await this.auth.logout(readRefreshCookie(req));
    clearRefreshCookie(res, this.env);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @AllowPendingPasswordChange()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'End every session of the current user (all devices)',
  })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse()
  async logoutAll(
    @CurrentUser() user: AuthPrincipal,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logoutAll(user);
    clearRefreshCookie(res, this.env);
  }

  @Get('me')
  @AllowPendingPasswordChange()
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'The signed-in account: profile, roles, workspace ids, mustChangePassword',
  })
  @ApiOkResponse({ type: MeDto })
  @ApiUnauthorizedResponse()
  me(@CurrentUser() user: AuthPrincipal): Promise<MeDto> {
    return this.auth.me(user.userId);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @AllowPendingPasswordChange()
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Change own password (clears mustChangePassword, ends the other sessions)',
  })
  @ApiOkResponse({
    type: AuthResponseDto,
    description: 'New tokens for the current session',
  })
  @ApiBadRequestResponse({
    description:
      'WRONG_CURRENT_PASSWORD or policy violation (8–128 characters)',
  })
  @ApiUnauthorizedResponse()
  async changePassword(
    @CurrentUser() user: AuthPrincipal,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    return this.respond(res, await this.auth.changePassword(user, dto));
  }

  private respond(res: Response, result: AuthResult): AuthResponseDto {
    setRefreshCookie(res, this.env, result.refresh.token, this.sessions.ttlMs);
    return result.body;
  }

  /**
   * Cookie-authenticated endpoints: a browser request coming from another
   * site is refused (CSRF defence in depth on top of SameSite). Requests
   * without an Origin header (server-side Next.js, curl) are allowed.
   */
  private assertAllowedOrigin(req: Request) {
    const origin = req.headers.origin;
    if (origin && !this.allowedOrigins.includes(origin.replace(/\/+$/, ''))) {
      throw new ForbiddenException({
        code: AuthErrorCode.ForbiddenOrigin,
        message: 'مصدر الطلب غير مسموح به',
      });
    }
  }
}
