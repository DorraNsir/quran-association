import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

import {
  AttemptCounter,
  AuthRateLimitedException,
  AuthRateLimiter,
  type AuthRateLimits,
} from './auth-rate-limit.js';
import { AuthErrorCode } from './auth.types.js';

const LIMITS: AuthRateLimits = {
  windowMs: 60_000,
  loginPerIp: 4,
  loginPerUsername: 3,
  passwordChangePerUser: 2,
};

const invalid = () =>
  Promise.reject(
    new UnauthorizedException({ code: AuthErrorCode.InvalidCredentials }),
  );
const inactive = () =>
  Promise.reject(
    new ForbiddenException({ code: AuthErrorCode.AccountInactive }),
  );
const wrongCurrent = () =>
  Promise.reject(
    new BadRequestException({ code: AuthErrorCode.WrongCurrentPassword }),
  );
const ok = () => Promise.resolve('ok');

function limiterAt(start = 1_000_000) {
  const limiter = new AuthRateLimiter(LIMITS);
  let now = start;
  limiter.now = () => now;
  return { limiter, advance: (ms: number) => (now += ms) };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('AttemptCounter', () => {
  it('blocks at max within the window and reopens after it', () => {
    const counter = new AttemptCounter(2, 1000);
    counter.reserve('k', 0);
    expect(counter.retryAfterSeconds('k', 0)).toBe(0);
    counter.reserve('k', 0);
    expect(counter.retryAfterSeconds('k', 0)).toBe(1);
    expect(counter.retryAfterSeconds('k', 1000)).toBe(0);
  });

  it('refund gives a slot back and drops empty windows', () => {
    const counter = new AttemptCounter(2, 1000);
    counter.reserve('k', 0);
    counter.reserve('k', 0);
    counter.refund('k', 10);
    expect(counter.retryAfterSeconds('k', 10)).toBe(0);
    counter.refund('k', 10);
    expect(counter.size).toBe(0);
  });
});

describe('AuthRateLimiter.login', () => {
  it('blocks a username after N failures (429 + retry-after) before running the attempt', async () => {
    const { limiter } = limiterAt();
    for (let i = 0; i < LIMITS.loginPerUsername; i++)
      await rejection(limiter.login(`1.1.1.${i}`, 'alice', invalid));

    let ran = false;
    const error = await rejection(
      limiter.login('9.9.9.9', 'alice', () => {
        ran = true;
        return ok();
      }),
    );
    expect(error).toBeInstanceOf(AuthRateLimitedException);
    expect((error as AuthRateLimitedException).getStatus()).toBe(429);
    expect((error as AuthRateLimitedException).retryAfterSeconds).toBe(60);
    expect(ran).toBe(false); // no password hashing while blocked
  });

  it('counts unknown and existing usernames identically (no enumeration signal)', async () => {
    const { limiter } = limiterAt();
    // The limiter only sees the submitted name and the outcome code, which
    // AuthService makes identical for an unknown user and a wrong password.
    for (let i = 0; i < LIMITS.loginPerUsername; i++) {
      await rejection(limiter.login('1.1.1.1', 'exists', invalid));
      await rejection(limiter.login('2.2.2.2', 'ghost', invalid));
    }
    const a = await rejection(limiter.login('3.3.3.3', 'exists', ok));
    const b = await rejection(limiter.login('3.3.3.3', 'ghost', ok));
    expect(a).toBeInstanceOf(AuthRateLimitedException);
    expect(b).toBeInstanceOf(AuthRateLimitedException);
    expect((a as AuthRateLimitedException).getResponse()).toEqual(
      (b as AuthRateLimitedException).getResponse(),
    );
  });

  it('blocks an IP after N failures across different usernames', async () => {
    const { limiter } = limiterAt();
    for (let i = 0; i < LIMITS.loginPerIp; i++)
      await rejection(limiter.login('5.5.5.5', `user${i}`, invalid));
    expect(
      await rejection(limiter.login('5.5.5.5', 'fresh', ok)),
    ).toBeInstanceOf(AuthRateLimitedException);
    await expect(limiter.login('6.6.6.6', 'fresh', ok)).resolves.toBe('ok');
  });

  it('successful logins consume no IP capacity and clear the username failures', async () => {
    const { limiter } = limiterAt();
    for (let i = 0; i < LIMITS.loginPerIp * 3; i++)
      await limiter.login('7.7.7.7', `u${i}`, ok);
    await rejection(limiter.login('7.7.7.7', 'bob', invalid));
    await rejection(limiter.login('7.7.7.7', 'bob', invalid));
    await limiter.login('7.7.7.7', 'bob', ok);
    // bob's failures were cleared: a full allowance again (other IPs)
    for (let i = 0; i < LIMITS.loginPerUsername - 1; i++)
      await rejection(limiter.login(`8.8.8.${i}`, 'bob', invalid));
    await expect(limiter.login('8.8.8.200', 'bob', ok)).resolves.toBe('ok');
  });

  it('ACCOUNT_INACTIVE (password proven) consumes neither IP nor username capacity', async () => {
    const { limiter } = limiterAt();
    for (let i = 0; i < 10; i++)
      expect(
        await rejection(limiter.login('4.4.4.4', 'sleepy', inactive)),
      ).toBeInstanceOf(ForbiddenException);
    await expect(limiter.login('4.4.4.4', 'sleepy', ok)).resolves.toBe('ok');
  });

  it('parallel attempts cannot exceed the limit while the password check runs', async () => {
    const { limiter } = limiterAt();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const slow = () => gate.then(invalid);
    const pending = Promise.allSettled(
      Array.from({ length: 10 }, () => limiter.login('1.2.3.4', 'race', slow)),
    );
    release();
    const settled = await pending;
    const limited = settled.filter(
      (s) =>
        s.status === 'rejected' && s.reason instanceof AuthRateLimitedException,
    ).length;
    expect(limited).toBe(10 - LIMITS.loginPerUsername);
  });

  it('reopens once the window has passed (temporary lockout, never permanent)', async () => {
    const { limiter, advance } = limiterAt();
    for (let i = 0; i < LIMITS.loginPerUsername; i++)
      await rejection(limiter.login('1.1.1.1', 'carol', invalid));
    advance(LIMITS.windowMs);
    await expect(limiter.login('1.1.1.1', 'carol', ok)).resolves.toBe('ok');
  });
});

describe('AuthRateLimiter.changePassword', () => {
  it('only WRONG_CURRENT_PASSWORD counts; success clears the account', async () => {
    const { limiter } = limiterAt();
    // Policy violations (another 400) do not count
    for (let i = 0; i < 5; i++)
      await rejection(
        limiter.changePassword('u1', () =>
          Promise.reject(new BadRequestException({ message: 'policy' })),
        ),
      );
    await rejection(limiter.changePassword('u1', wrongCurrent));
    await limiter.changePassword('u1', ok);
    for (let i = 0; i < LIMITS.passwordChangePerUser; i++)
      await rejection(limiter.changePassword('u1', wrongCurrent));
    expect(await rejection(limiter.changePassword('u1', ok))).toBeInstanceOf(
      AuthRateLimitedException,
    );
    await expect(limiter.changePassword('u2', ok)).resolves.toBe('ok');
  });
});
