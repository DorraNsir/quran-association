import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';

import { AuthErrorCode } from '../auth.types.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

/** Global guard: every route needs a valid access token unless marked @Public(). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    return isPublic ? true : super.canActivate(context);
  }

  // Missing / malformed / expired token → uniform 401; errors thrown by the
  // strategy (revoked session, inactive account) pass through unchanged.
  handleRequest<TUser>(error: unknown, user: TUser | false): TUser {
    if (error) throw error;
    if (!user) {
      throw new UnauthorizedException({
        code: AuthErrorCode.Unauthenticated,
        message: 'يجب تسجيل الدخول',
      });
    }
    return user;
  }
}
