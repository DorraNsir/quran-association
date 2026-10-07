import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Role } from '../../generated/prisma/enums.js';
import type { AuthPrincipal } from '../auth.types.js';
import { RolesGuard } from './roles.guard.js';

function contextFor(required: Role[] | undefined, roles: Role[]) {
  const reflector = {
    getAllAndOverride: () => required,
  } as unknown as Reflector;
  const user: AuthPrincipal = {
    userId: 'u',
    sessionId: 's',
    roles,
    mustChangePassword: false,
  };
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return { guard: new RolesGuard(reflector), context };
}

describe('RolesGuard', () => {
  it('lets routes without @Roles through', () => {
    const { guard, context } = contextFor(undefined, []);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('treats roles as cumulative: ADMIN + TEACHER passes ADMIN and TEACHER routes', () => {
    for (const required of [
      [Role.ADMIN],
      [Role.TEACHER],
      [Role.STUDENT, Role.TEACHER],
    ]) {
      const { guard, context } = contextFor(required, [
        Role.ADMIN,
        Role.TEACHER,
      ]);
      expect(guard.canActivate(context)).toBe(true);
    }
  });

  it('refuses a user holding none of the required roles', () => {
    const { guard, context } = contextFor(
      [Role.STUDENT],
      [Role.ADMIN, Role.TEACHER],
    );
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
