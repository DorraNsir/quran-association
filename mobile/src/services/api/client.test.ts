import { api, setAuthBridge, type AuthBridge } from '@/services/api';

type FakeResponse = { status: number; ok: boolean; text: () => Promise<string> };
const reply = (status: number, body?: unknown): FakeResponse => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => (body === undefined ? '' : JSON.stringify(body)),
});

const fetchMock = jest.fn<Promise<FakeResponse>, [string, RequestInit]>();
const authHeader = (call: number) =>
  (fetchMock.mock.calls[call]![1].headers as Record<string, string>).Authorization;

function bridge(refresh: AuthBridge['refresh']) {
  let token = 'access-1';
  const b = {
    getAccessToken: jest.fn(() => token),
    refresh: jest.fn(async () => {
      const outcome = await refresh();
      if (outcome === 'renewed') token = 'access-2';
      return outcome;
    }),
    onSessionEnded: jest.fn(),
  };
  setAuthBridge(b);
  return b;
}

beforeEach(() => {
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => setAuthBridge(null));

describe('api client', () => {
  it('sends the access token as a Bearer header', async () => {
    bridge(async () => 'renewed');
    fetchMock.mockResolvedValueOnce(reply(200, { ok: true }));
    await expect(api('/auth/me')).resolves.toEqual({ ok: true });
    expect(authHeader(0)).toBe('Bearer access-1');
  });

  it('401 → one refresh → one retry with the new token; never loops', async () => {
    const b = bridge(async () => 'renewed');
    fetchMock.mockResolvedValueOnce(reply(401)).mockResolvedValueOnce(reply(401, { code: 'SESSION_INVALID' }));
    await expect(api('/teacher/workspace')).rejects.toMatchObject({ status: 401 });
    expect(b.refresh).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authHeader(1)).toBe('Bearer access-2');
  });

  it('refresh "expired" → SESSION_EXPIRED and the session is ended', async () => {
    const b = bridge(async () => 'expired');
    fetchMock.mockResolvedValueOnce(reply(401));
    await expect(api('/auth/me')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(b.onSessionEnded).toHaveBeenCalledWith('expired', expect.anything());
  });

  it('offline during the refresh: the network error surfaces and the user is NOT signed out', async () => {
    const b = bridge(async () => {
      throw Object.assign(new Error('offline'), { name: 'TypeError' });
    });
    fetchMock.mockResolvedValueOnce(reply(401));
    await expect(api('/auth/me')).rejects.toThrow('offline');
    expect(b.onSessionEnded).not.toHaveBeenCalled();
  });

  it('public calls (auth: false) send no token and never refresh', async () => {
    const b = bridge(async () => 'renewed');
    fetchMock.mockResolvedValueOnce(reply(401, { code: 'INVALID_CREDENTIALS', message: 'اسم المستخدم أو كلمة المرور غير صحيحة' }));
    await expect(
      api('/auth/mobile/login', { method: 'POST', body: {}, auth: false }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    expect(authHeader(0)).toBeUndefined();
    expect(b.refresh).not.toHaveBeenCalled();
  });

  it('403 ACCOUNT_INACTIVE ends the session; other 403s do not', async () => {
    const b = bridge(async () => 'renewed');
    fetchMock.mockResolvedValueOnce(reply(403, { code: 'FORBIDDEN_ROLE' }));
    await expect(api('/admin/dashboard')).rejects.toMatchObject({ code: 'FORBIDDEN_ROLE' });
    expect(b.onSessionEnded).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(reply(403, { code: 'ACCOUNT_INACTIVE' }));
    await expect(api('/auth/me')).rejects.toMatchObject({ code: 'ACCOUNT_INACTIVE' });
    expect(b.onSessionEnded).toHaveBeenCalledWith('inactive', expect.anything());
  });

  it('a transport failure becomes an Arabic NETWORK_ERROR (status 0)', async () => {
    setAuthBridge(null);
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(api('/health', { auth: false })).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
    });
  });

  it('429 keeps the server Arabic message', async () => {
    fetchMock.mockResolvedValueOnce(
      reply(429, { code: 'TOO_MANY_REQUESTS', message: 'عدد كبير من المحاولات — يرجى المحاولة لاحقًا' }),
    );
    await expect(api('/auth/mobile/login', { auth: false })).rejects.toMatchObject({
      status: 429,
      message: 'عدد كبير من المحاولات — يرجى المحاولة لاحقًا',
    });
  });
});
