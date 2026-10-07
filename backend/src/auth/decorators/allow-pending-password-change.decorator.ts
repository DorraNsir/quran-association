import { SetMetadata } from '@nestjs/common';

export const ALLOW_PENDING_PASSWORD_CHANGE_KEY =
  'auth:allowPendingPasswordChange';

/**
 * Marks the few authenticated routes still usable while mustChangePassword
 * is true (me, change-password, logout-all). Every other protected route
 * answers 403 PASSWORD_CHANGE_REQUIRED until the password is changed.
 */
export const AllowPendingPasswordChange = () =>
  SetMetadata(ALLOW_PENDING_PASSWORD_CHANGE_KEY, true);
