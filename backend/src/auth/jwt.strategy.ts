import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { EnvironmentVariables } from '../config/env.validation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AuthErrorCode,
  type AccessTokenPayload,
  type AuthPrincipal,
} from './auth.types.js';

/**
 * Bearer access token → principal. The JWT proves identity cheaply; ONE
 * indexed query then re-checks the account and its session, so a
 * deactivated user, a removed role or a revoked session (logout, logout-all,
 * password change) loses access immediately instead of at token expiry.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_ACCESS_SECRET', { infer: true }),
      algorithms: ['HS256'],
      ignoreExpiration: false,
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthPrincipal> {
    const user =
      typeof payload.sub === 'string' && typeof payload.sid === 'string'
        ? await this.prisma.user.findUnique({
            where: { id: payload.sub },
            select: {
              isActive: true,
              mustChangePassword: true,
              roles: { select: { role: true } },
              sessions: {
                where: { id: payload.sid },
                select: { revokedAt: true, expiresAt: true },
              },
            },
          })
        : null;
    const session = user?.sessions[0];
    if (
      !user ||
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    ) {
      throw new UnauthorizedException({
        code: AuthErrorCode.SessionInvalid,
        message: 'انتهت الجلسة، يرجى تسجيل الدخول من جديد',
      });
    }
    if (!user.isActive) {
      throw new ForbiddenException({
        code: AuthErrorCode.AccountInactive,
        message: 'هذا الحساب غير مفعّل',
      });
    }
    return {
      userId: payload.sub,
      sessionId: payload.sid,
      roles: user.roles.map((r) => r.role),
      mustChangePassword: user.mustChangePassword,
    };
  }
}
