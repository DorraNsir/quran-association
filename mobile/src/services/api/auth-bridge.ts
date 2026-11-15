import type { ApiError } from './errors';

/**
 * The seam between the HTTP client and the auth module, so the client never
 * imports auth code (src/features/auth/session.ts installs the bridge).
 *
 * Backend contract (backend/src/auth): the access token is a short-lived
 * JWT sent as "Authorization: Bearer <token>"; a 401 means it expired or the
 * session was revoked, and the auth module may try ONE refresh.
 */
export interface AuthBridge {
  /** Current access token (kept in memory only), or null when signed out. */
  getAccessToken(): string | null;
  /**
   * Obtains a new access token after a 401. Must be single-flight (refresh
   * tokens rotate; a replay revokes the session).
   * - 'renewed': retry the request;
   * - 'expired': the session is definitively gone (already cleared locally).
   * Network / server failures are THROWN, never reported as 'expired', so
   * being offline never signs the user out.
   */
  refresh(): Promise<'renewed' | 'expired'>;
  /** The session ended (refresh refused, or the account was deactivated). */
  onSessionEnded(reason: 'expired' | 'inactive', error?: ApiError): void;
}

let bridge: AuthBridge | null = null;

export function setAuthBridge(next: AuthBridge | null): void {
  bridge = next;
}

export function getAuthBridge(): AuthBridge | null {
  return bridge;
}
