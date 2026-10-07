import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { AuthErrorCode, type AuthPrincipal } from '../auth.types.js';
import { ALLOW_PENDING_PASSWORD_CHANGE_KEY } from '../decorators/allow-pending-password-change.decorator.js';

/**
 * While mustChangePassword is true (temporary password set by an admin),
 * only routes marked @AllowPendingPasswordChange() are reachable.
 */
@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const principal = context.switchToHttp().getRequest<Request>().user as
      AuthPrincipal | undefined;
    if (!principal?.mustChangePassword) return true; // public route, or nothing pending
    const allowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PENDING_PASSWORD_CHANGE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowed) return true;
    throw new ForbiddenException({
      code: AuthErrorCode.PasswordChangeRequired,
      message: 'يجب تغيير كلمة المرور المؤقتة قبل المتابعة',
    });
  }
}
