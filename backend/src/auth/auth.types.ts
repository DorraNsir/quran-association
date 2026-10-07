import type { Role } from '../generated/prisma/enums.js';

/** Claims of the access JWT — deliberately minimal (no profile, no secrets). */
export interface AccessTokenPayload {
  /** User id */
  sub: string;
  /** AuthSession id — lets logout / password change cut access immediately */
  sid: string;
  /** Informational for clients; the server re-reads roles from the database */
  roles: Role[];
}

/**
 * The authenticated principal attached to the request (via @CurrentUser()).
 * Built from the database on every request, so deactivation, role changes
 * and session revocation take effect without waiting for token expiry.
 */
export interface AuthPrincipal {
  userId: string;
  sessionId: string;
  roles: Role[];
  mustChangePassword: boolean;
}

/** Stable machine-readable error codes (messages are Arabic, for display). */
export const AuthErrorCode = {
  InvalidCredentials: 'INVALID_CREDENTIALS',
  AccountInactive: 'ACCOUNT_INACTIVE',
  Unauthenticated: 'UNAUTHENTICATED',
  SessionInvalid: 'SESSION_INVALID',
  PasswordChangeRequired: 'PASSWORD_CHANGE_REQUIRED',
  WrongCurrentPassword: 'WRONG_CURRENT_PASSWORD',
  ForbiddenRole: 'FORBIDDEN_ROLE',
  ForbiddenOrigin: 'FORBIDDEN_ORIGIN',
} as const;
