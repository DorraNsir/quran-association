import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { Role } from '../../generated/prisma/enums.js';
import { AuthErrorCode, type AuthPrincipal } from '../auth.types.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';

/**
 * @Roles(...) check: passes when the user holds ANY of the listed roles
 * (cumulative roles: ADMIN + TEACHER passes both @Roles(ADMIN) and
 * @Roles(TEACHER)). Resource ownership is NOT decided here — see
 * roles.decorator.ts.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;
    const principal = context.switchToHttp().getRequest<Request>().user as
      AuthPrincipal | undefined;
    if (principal && required.some((role) => principal.roles.includes(role)))
      return true;
    throw new ForbiddenException({
      code: AuthErrorCode.ForbiddenRole,
      message: 'ليست لديك صلاحية الوصول إلى هذا المورد',
    });
  }
}
