import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import { durationToMs } from '../common/duration.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AuthErrorCode,
  type AccessTokenPayload,
  type AuthPrincipal,
} from './auth.types.js';
import type { AuthResponseDto, MeDto } from './dto/auth-response.dto.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import { PasswordService } from './password.service.js';
import { SessionService, type IssuedRefreshToken } from './session.service.js';

/** Result of a credential operation: the JSON body + the refresh token for the cookie. */
export interface AuthResult {
  body: AuthResponseDto;
  refresh: IssuedRefreshToken;
}

const invalidCredentials = () =>
  new UnauthorizedException({
    code: AuthErrorCode.InvalidCredentials,
    message: 'اسم المستخدم أو كلمة المرور غير صحيحة',
  });

const inactiveAccount = () =>
  new ForbiddenException({
    code: AuthErrorCode.AccountInactive,
    message: 'هذا الحساب غير مفعّل',
  });

const sessionInvalid = () =>
  new UnauthorizedException({
    code: AuthErrorCode.SessionInvalid,
    message: 'انتهت الجلسة، يرجى تسجيل الدخول من جديد',
  });

@Injectable()
export class AuthService {
  private readonly accessTtlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly jwt: JwtService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.accessTtlSeconds =
      durationToMs(config.get('JWT_ACCESS_EXPIRES_IN', { infer: true })) / 1000;
  }

  /**
   * username + password → session. The same generic 401 for an unknown user
   * and a wrong password (with equal Argon2 work); "inactive" is only
   * revealed once the password has been proven.
   */
  async login({ username, password }: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true, passwordHash: true, isActive: true },
    });
    if (!user) {
      await this.passwords.verifyAgainstDummy(password);
      throw invalidCredentials();
    }
    if (!(await this.passwords.verify(user.passwordHash, password)))
      throw invalidCredentials();
    if (!user.isActive) throw inactiveAccount();

    const refresh = await this.sessions.create(user.id);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return { body: await this.issue(user.id, refresh.sessionId), refresh };
  }

  /** Rotates the refresh token and issues a fresh access token. */
  async refresh(refreshToken: string | undefined): Promise<AuthResult> {
    const refresh = await this.sessions.rotate(refreshToken);
    if (!refresh) throw sessionInvalid();
    const user = await this.prisma.user.findUnique({
      where: { id: refresh.userId },
      select: { isActive: true },
    });
    if (!user?.isActive) {
      await this.sessions.revoke(refresh.sessionId);
      throw user ? inactiveAccount() : sessionInvalid();
    }
    return {
      body: await this.issue(refresh.userId, refresh.sessionId),
      refresh,
    };
  }

  /** Revokes the session owning this refresh token (idempotent). */
  async logout(refreshToken: string | undefined) {
    const sessionId = await this.sessions.resolve(refreshToken);
    if (sessionId) await this.sessions.revoke(sessionId);
  }

  async logoutAll(principal: AuthPrincipal) {
    await this.sessions.revokeAllForUser(principal.userId);
  }

  /**
   * Self-service change: proves the current password, stores a new Argon2id
   * hash, clears mustChangePassword, revokes every OTHER session and rotates
   * the current one (an old copy of its refresh token stops working too).
   */
  async changePassword(
    principal: AuthPrincipal,
    dto: ChangePasswordDto,
  ): Promise<AuthResult> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: principal.userId },
      select: { passwordHash: true },
    });
    if (
      !(await this.passwords.verify(user.passwordHash, dto.currentPassword))
    ) {
      throw new BadRequestException({
        code: AuthErrorCode.WrongCurrentPassword,
        message: 'كلمة المرور الحالية غير صحيحة',
      });
    }
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException({
        message: 'يجب أن تختلف كلمة المرور الجديدة عن الحالية',
      });
    }

    await this.prisma.user.update({
      where: { id: principal.userId },
      data: {
        passwordHash: await this.passwords.hash(dto.newPassword),
        mustChangePassword: false,
      },
    });
    await this.sessions.revokeAllForUser(principal.userId, principal.sessionId);
    await this.sessions.revoke(principal.sessionId);
    const refresh = await this.sessions.create(principal.userId);
    return {
      body: await this.issue(principal.userId, refresh.sessionId),
      refresh,
    };
  }

  /** Safe account view for the frontend (header, user menu, workspace selection). */
  async me(userId: string): Promise<MeDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        mustChangePassword: true,
        roles: { select: { role: true }, orderBy: { role: 'asc' } },
        person: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            photoUrl: true,
            email: true,
            phone: true,
            teacher: { select: { id: true } },
            student: { select: { id: true } },
          },
        },
      },
    });
    const { teacher, student, ...person } = user.person;
    return {
      id: user.id,
      username: user.username,
      person,
      roles: user.roles.map((r) => r.role),
      mustChangePassword: user.mustChangePassword,
      teacherId: teacher?.id ?? null,
      studentId: student?.id ?? null,
    };
  }

  private async issue(
    userId: string,
    sessionId: string,
  ): Promise<AuthResponseDto> {
    const user = await this.me(userId);
    const payload: AccessTokenPayload = {
      sub: userId,
      sid: sessionId,
      roles: user.roles,
    };
    return {
      accessToken: await this.jwt.signAsync(payload, {
        expiresIn: this.accessTtlSeconds,
      }),
      expiresIn: this.accessTtlSeconds,
      user,
    };
  }
}
