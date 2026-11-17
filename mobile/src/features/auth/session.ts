import { ApiError, setAuthBridge, type AuthBridge } from '@/services/api';

import * as authApi from './auth.api';
import { secureTokenStorage, type TokenStorage } from './token-storage';
import type { MobileAuthResponse, SessionUser } from './types';

export type SessionStatus =
  /** Reading SecureStore / refreshing at launch */
  | 'restoring'
  /** No usable session: login screen */
  | 'signedOut'
  | 'signedIn'
  /** A stored session exists but the server could not be reached: retry, never sign out */
  | 'offline';

export interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
  /** Why the last session ended (shown once on the login screen) */
  endedReason: 'expired' | 'inactive' | null;
  /** The restore failure while offline (network / 5xx / 429) */
  restoreError: ApiError | null;
}

export type AuthApi = Pick<
  typeof authApi,
  'mobileLogin' | 'mobileRefresh' | 'mobileLogout' | 'mobileChangePassword'
>;

/** Refresh is refused for good on these statuses (401 SESSION_INVALID, 403 ACCOUNT_INACTIVE, 400 malformed). */
const isDefinitiveRefusal = (error: unknown) =>
  error instanceof ApiError && [400, 401, 403].includes(error.status);

/**
 * The mobile session, outside React so the HTTP client can use it (through
 * the AuthBridge) and so it can be unit-tested.
 *
 * Secrets: the access token lives in this closure only (memory); the
 * refresh token only in SecureStore. Neither is ever put in React state,
 * React Query, navigation params or logs — the UI sees `user` only.
 */
export function createSessionManager(
  storage: TokenStorage = secureTokenStorage,
  endpoints: AuthApi = authApi,
  now: () => number = Date.now,
) {
  let accessToken: string | null = null;
  let accessExpiresAt = 0;
  let refreshing: Promise<'renewed' | 'expired'> | null = null;
  let state: SessionState = {
    status: 'restoring',
    user: null,
    endedReason: null,
    restoreError: null,
  };
  const listeners = new Set<() => void>();
  const signedOutListeners = new Set<() => void>();

  function setState(next: Partial<SessionState>) {
    const wasSignedIn = state.status === 'signedIn' || state.status === 'offline';
    state = { ...state, ...next };
    listeners.forEach((l) => l());
    if (wasSignedIn && state.status === 'signedOut')
      signedOutListeners.forEach((l) => l());
  }

  /** New tokens: persist the rotated refresh token FIRST, then use the session. */
  async function adopt(response: MobileAuthResponse) {
    await storage.set(response.refreshToken);
    accessToken = response.accessToken;
    accessExpiresAt = now() + response.expiresIn * 1000;
    setState({
      status: 'signedIn',
      user: response.user,
      endedReason: null,
      restoreError: null,
    });
  }

  async function clearLocal(reason: SessionState['endedReason']) {
    accessToken = null;
    accessExpiresAt = 0;
    await storage.clear().catch(() => undefined);
    setState({ status: 'signedOut', user: null, endedReason: reason, restoreError: null });
  }

  /** Single-flight refresh: concurrent callers share one request. */
  function refresh(): Promise<'renewed' | 'expired'> {
    refreshing ??= (async () => {
      try {
        const token = await storage.get();
        if (!token) {
          await clearLocal(state.status === 'signedIn' ? 'expired' : null);
          return 'expired' as const;
        }
        let response: MobileAuthResponse;
        try {
          response = await endpoints.mobileRefresh(token);
        } catch (error) {
          if (!isDefinitiveRefusal(error)) throw error; // offline / 5xx / 429: keep the token
          const inactive = error instanceof ApiError && error.code === 'ACCOUNT_INACTIVE';
          await clearLocal(inactive ? 'inactive' : 'expired');
          return 'expired' as const;
        }
        await adopt(response);
        return 'renewed' as const;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  const bridge: AuthBridge = {
    getAccessToken: () => accessToken,
    refresh,
    onSessionEnded: (reason) => {
      if (state.status === 'signedOut') return;
      void logout(reason);
    },
  };

  /** Launch: SecureStore → refresh. Offline keeps the stored session for a retry. */
  async function restore(): Promise<void> {
    setState({ status: 'restoring', restoreError: null });
    try {
      const outcome = await refresh();
      if (outcome === 'expired') setState({ status: 'signedOut', user: null });
    } catch (error) {
      setState({
        status: 'offline',
        restoreError: error instanceof ApiError ? error : null,
      });
    }
  }

  async function login(username: string, password: string): Promise<void> {
    await adopt(await endpoints.mobileLogin(username, password));
  }

  async function changePassword(currentPassword: string, newPassword: string) {
    await adopt(await endpoints.mobileChangePassword(currentPassword, newPassword));
  }

  /**
   * Local credentials are cleared FIRST (works offline); the server-side
   * revocation is best effort with a short timeout.
   */
  async function logout(reason: SessionState['endedReason'] = null): Promise<void> {
    const token = await storage.get().catch(() => null);
    await clearLocal(reason);
    if (token) await endpoints.mobileLogout(token).catch(() => undefined);
  }

  /**
   * The server CONFIRMED a new own photo (PUT/DELETE …/profile/photo answered
   * with its photoUrl): the signed-in person shows it at once. Tokens untouched.
   */
  function setOwnPhoto(photoUrl: string | null): void {
    if (!state.user) return;
    setState({ user: { ...state.user, person: { ...state.user.person, photoUrl } } });
  }

  /** Foreground: renew ahead of expiry so the next request does not hit a 401. */
  async function refreshIfExpiringSoon(marginMs = 60_000): Promise<void> {
    if (state.status !== 'signedIn' || !accessToken) return;
    if (accessExpiresAt - now() > marginMs) return;
    await refresh().catch(() => undefined);
  }

  return {
    bridge,
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Fired when a signed-in session ends (clear user-specific caches). */
    onSignedOut(listener: () => void) {
      signedOutListeners.add(listener);
      return () => signedOutListeners.delete(listener);
    },
    restore,
    login,
    changePassword,
    setOwnPhoto,
    logout,
    refresh,
    refreshIfExpiringSoon,
  };
}

export type SessionManager = ReturnType<typeof createSessionManager>;

/** The app's session; installs itself as the HTTP client's auth bridge. */
export const session = createSessionManager();
setAuthBridge(session.bridge);
