import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/**
 * Opts a route out of the global JWT guard (health, Swagger, login, refresh
 * and, later, the public website API). Everything else requires a token.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
