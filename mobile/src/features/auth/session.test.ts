import { ApiError, networkError } from '@/services/api';

import { createSessionManager, type AuthApi } from './session';
import type { TokenStorage } from './token-storage';
import type { MobileAuthResponse, SessionUser } from './types';

// The OS keystore has no JS implementation under Jest; the manager under
// test receives an in-memory TokenStorage instead.
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 0,
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const USER: SessionUser = {
  id: 'u1',
  username: 'teacher.one',
  person: { id: 'p1', firstName: 'أ', lastName: 'ب', photoUrl: null, email: null, phone: null },
  roles: ['TEACHER'],
  mustChangePassword: false,
  teacherId: 't1',
  studentId: null,
};

const tokens = (n: number, user: SessionUser = USER): MobileAuthResponse => ({
  accessToken: `access-${n}`,
  expiresIn: 900,
  refreshToken: `refresh-${n}`,
  refreshExpiresAt: '2030-01-01T00:00:00.000Z',
  user,
});

function memoryStorage(initial: string | null = null) {
  let value = initial;
  const log: string[] = [];
  const storage: TokenStorage = {
    get: jest.fn(async () => value),
    set: jest.fn(async (token: string) => {
      log.push(`set:${token}`);
      value = token;
    }),
    clear: jest.fn(async () => {
      log.push('clear');
      value = null;
    }),
  };
  return { storage, log, current: () => value };
}

function endpoints(overrides: Partial<AuthApi> = {}): jest.Mocked<AuthApi> {
  return {
    mobileLogin: jest.fn(async () => tokens(1)),
    mobileRefresh: jest.fn(async () => tokens(2)),
    mobileLogout: jest.fn(async () => undefined),
    mobileChangePassword: jest.fn(async () => tokens(3)),
    ...overrides,
  } as jest.Mocked<AuthApi>;
}

const refused = (status: number, code: string) => new ApiError(status, code, 'x');

describe('session restore', () => {
  it('no stored token → signed out without any network call', async () => {
    const { storage } = memoryStorage();
    const api = endpoints();
    const s = createSessionManager(storage, api);
    await s.restore();
    expect(s.getState().status).toBe('signedOut');
    expect(api.mobileRefresh).not.toHaveBeenCalled();
  });

  it('stored token → refresh; the rotated token is persisted BEFORE the session is used', async () => {
    const mem = memoryStorage('refresh-0');
    const api = endpoints();
    const s = createSessionManager(mem.storage, api);
    const seen: string[] = [];
    s.subscribe(() => seen.push(`${s.getState().status}:${mem.current()}`));
    await s.restore();
    expect(api.mobileRefresh).toHaveBeenCalledWith('refresh-0');
    expect(s.getState()).toMatchObject({ status: 'signedIn', user: USER });
    expect(mem.current()).toBe('refresh-2');
    expect(seen).toContain('signedIn:refresh-2');
    expect(s.bridge.getAccessToken()).toBe('access-2');
  });

  it('offline at launch keeps the stored session (never signs out) and retries later', async () => {
    const mem = memoryStorage('refresh-0');
    const api = endpoints({ mobileRefresh: jest.fn().mockRejectedValueOnce(networkError()) });
    const s = createSessionManager(mem.storage, api);
    await s.restore();
    expect(s.getState().status).toBe('offline');
    expect(s.getState().restoreError?.code).toBe('NETWORK_ERROR');
    expect(mem.current()).toBe('refresh-0');
    expect(mem.storage.clear).not.toHaveBeenCalled();

    api.mobileRefresh.mockResolvedValueOnce(tokens(2));
    await s.restore();
    expect(s.getState().status).toBe('signedIn');
  });

  it.each([
    [500, 'HTTP_500'],
    [503, 'HTTP_503'],
    [429, 'TOO_MANY_REQUESTS'],
  ])('a %i during restore is treated as offline, not as an expired session', async (status, code) => {
    const mem = memoryStorage('refresh-0');
    const s = createSessionManager(
      mem.storage,
      endpoints({ mobileRefresh: jest.fn().mockRejectedValue(refused(status, code)) }),
    );
    await s.restore();
    expect(s.getState().status).toBe('offline');
    expect(mem.current()).toBe('refresh-0');
  });

  it('401 SESSION_INVALID → signed out and the stored token deleted', async () => {
    const mem = memoryStorage('refresh-0');
    const s = createSessionManager(
      mem.storage,
      endpoints({ mobileRefresh: jest.fn().mockRejectedValue(refused(401, 'SESSION_INVALID')) }),
    );
    await s.restore();
    expect(s.getState().status).toBe('signedOut');
    expect(mem.current()).toBeNull();
  });

  it('403 ACCOUNT_INACTIVE → signed out with the "inactive" notice', async () => {
    const mem = memoryStorage('refresh-0');
    const s = createSessionManager(
      mem.storage,
      endpoints({ mobileRefresh: jest.fn().mockRejectedValue(refused(403, 'ACCOUNT_INACTIVE')) }),
    );
    await s.restore();
    expect(s.getState()).toMatchObject({ status: 'signedOut', endedReason: 'inactive' });
    expect(mem.current()).toBeNull();
  });
});

describe('refresh', () => {
  it('is single-flight: concurrent callers share ONE request (a rotated token is never replayed)', async () => {
    const mem = memoryStorage('refresh-0');
    let resolve!: (value: MobileAuthResponse) => void;
    const api = endpoints({
      mobileRefresh: jest.fn(() => new Promise<MobileAuthResponse>((r) => (resolve = r))),
    });
    const s = createSessionManager(mem.storage, api);
    const a = s.refresh();
    const b = s.refresh();
    const c = s.bridge.refresh();
    await Promise.resolve();
    await Promise.resolve();
    resolve(tokens(2));
    await expect(Promise.all([a, b, c])).resolves.toEqual(['renewed', 'renewed', 'renewed']);
    expect(api.mobileRefresh).toHaveBeenCalledTimes(1);

    // The next refresh is a new request with the rotated token
    api.mobileRefresh.mockResolvedValueOnce(tokens(3));
    await s.refresh();
    expect(api.mobileRefresh).toHaveBeenLastCalledWith('refresh-2');
  });

  it('a network failure is thrown (not "expired") and keeps the session', async () => {
    const mem = memoryStorage('refresh-0');
    const api = endpoints();
    const s = createSessionManager(mem.storage, api);
    await s.restore();
    api.mobileRefresh.mockRejectedValueOnce(networkError());
    await expect(s.refresh()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(s.getState().status).toBe('signedIn');
    expect(mem.current()).toBe('refresh-2');
  });

  it('renews ahead of expiry when the app returns to the foreground', async () => {
    let clock = 0;
    const api = endpoints();
    const s = createSessionManager(memoryStorage('refresh-0').storage, api, () => clock);
    await s.restore();
    expect(api.mobileRefresh).toHaveBeenCalledTimes(1);
    clock = 10 * 60_000; // 5 min left of 15
    await s.refreshIfExpiringSoon();
    expect(api.mobileRefresh).toHaveBeenCalledTimes(1);
    clock = 14.5 * 60_000; // 30 s left
    await s.refreshIfExpiringSoon();
    expect(api.mobileRefresh).toHaveBeenCalledTimes(2);
  });
});

describe('login / change password / logout', () => {
  it('login stores the refresh token in the keystore; tokens never appear in the UI state', async () => {
    const mem = memoryStorage();
    const s = createSessionManager(mem.storage, endpoints());
    await s.login('teacher.one', 'secret-123');
    expect(mem.current()).toBe('refresh-1');
    expect(s.bridge.getAccessToken()).toBe('access-1');
    const visible = JSON.stringify(s.getState());
    expect(visible).not.toContain('access-1');
    expect(visible).not.toContain('refresh-1');
  });

  it('a failed login leaves no credentials behind', async () => {
    const mem = memoryStorage();
    const s = createSessionManager(
      mem.storage,
      endpoints({ mobileLogin: jest.fn().mockRejectedValue(refused(401, 'INVALID_CREDENTIALS')) }),
    );
    await s.restore();
    await expect(s.login('x', 'y')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(mem.current()).toBeNull();
    expect(s.getState().status).toBe('signedOut');
  });

  it('forced password change: the new session replaces the old one', async () => {
    const mem = memoryStorage();
    const api = endpoints({ mobileLogin: jest.fn(async () => tokens(1, { ...USER, mustChangePassword: true })) });
    const s = createSessionManager(mem.storage, api);
    await s.login('teacher.one', 'temporary-1');
    expect(s.getState().user?.mustChangePassword).toBe(true);
    await s.changePassword('temporary-1', 'my-new-password');
    expect(api.mobileChangePassword).toHaveBeenCalledWith('temporary-1', 'my-new-password');
    expect(s.getState().user?.mustChangePassword).toBe(false);
    expect(mem.current()).toBe('refresh-3');
    expect(s.bridge.getAccessToken()).toBe('access-3');
  });

  it('logout clears local credentials FIRST, even when the server cannot be reached', async () => {
    const mem = memoryStorage();
    const api = endpoints({ mobileLogout: jest.fn().mockRejectedValue(networkError()) });
    const s = createSessionManager(mem.storage, api);
    const cleared = jest.fn();
    s.onSignedOut(cleared);
    await s.login('teacher.one', 'secret-123');
    await s.logout();
    expect(mem.log.indexOf('clear')).toBeGreaterThan(-1);
    expect(mem.current()).toBeNull();
    expect(s.bridge.getAccessToken()).toBeNull();
    expect(s.getState()).toMatchObject({ status: 'signedOut', user: null });
    expect(api.mobileLogout).toHaveBeenCalledWith('refresh-1');
    expect(cleared).toHaveBeenCalledTimes(1); // user-specific caches are wiped
  });

  it('a deactivation reported by the API signs out with the "inactive" notice', async () => {
    const mem = memoryStorage();
    const s = createSessionManager(mem.storage, endpoints());
    await s.login('teacher.one', 'secret-123');
    s.bridge.onSessionEnded('inactive');
    await new Promise<void>((resolve) => setTimeout(resolve, 0)); // let the async sign-out finish
    expect(s.getState()).toMatchObject({ status: 'signedOut', endedReason: 'inactive' });
    expect(mem.current()).toBeNull();
  });
});
