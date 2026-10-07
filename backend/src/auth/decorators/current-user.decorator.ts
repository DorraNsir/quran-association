import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import type { AuthPrincipal } from '../auth.types.js';

/** The authenticated principal (only on routes behind the JWT guard). */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthPrincipal => {
    const user = ctx.switchToHttp().getRequest<Request>().user as
      AuthPrincipal | undefined;
    if (!user) throw new UnauthorizedException();
    return user;
  },
);
