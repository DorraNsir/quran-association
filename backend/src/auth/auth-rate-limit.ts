import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  type Provider,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';

import type { EnvironmentVariables } from '../config/env.validation.js';
import { AuthErrorCode } from './auth.types.js';

/** Above this many tracked keys, expired windows are swept on each hit. */
const SWEEP_THRESHOLD = 10_000;
/** Hard memory bound: past it the oldest windows are dropped (fail-open on memory, never on correctness of a live key's earlier hits). */
const MAX_KEYS = 50_000;

/**
 * Fixed-window counter of credential attempts per key.
 *
 * Attempts are RESERVED before the password is verified (so N parallel
 * requests cannot all pass the check while Argon2 runs), then REFUNDED when
 * the attempt turned out not to be a credential failure.
 */
export class AttemptCounter {
  private readonly windows = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Seconds until the key may try again, or 0 when it is not blocked. */
  retryAfterSeconds(key: string, now: number): number {
    const entry = this.windows.get(key);
    if (!entry || entry.resetAt <= now || entry.count < this.max) return 0;
    return Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  }

  reserve(key: string, now: number): void {
    this.sweep(now);
    const entry = this.windows.get(key);
    if (!entry || entry.resetAt <= now) {
      this.windows.delete(key); // re-insert: Map order = age, for the hard bound
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
    } else {
      entry.count += 1;
    }
  }

  refund(key: string, now: number): void {
    const entry = this.windows.get(key);
    if (!entry || entry.resetAt <= now) return;
    entry.count -= 1;
    if (entry.count <= 0) this.windows.delete(key);
  }

  clear(key: string): void {
    this.windows.delete(key);
  }

  get size(): number {
    return this.windows.size;
  }

  private sweep(now: number) {
    if (this.windows.size <= SWEEP_THRESHOLD) return;
    for (const [key, entry] of this.windows)
      if (entry.resetAt <= now) this.windows.delete(key);
    for (const key of this.windows.keys()) {
      if (this.windows.size <= MAX_KEYS) break;
      this.windows.delete(key);
    }
  }
}

export interface AuthRateLimits {
  windowMs: number;
  /** Failed logins per client IP (shared by every username) */
  loginPerIp: number;
  /** Failed logins per username (any IP) */
  loginPerUsername: number;
  /** Wrong current passwords per account on change-password */
  passwordChangePerUser: number;
}

export const AUTH_RATE_LIMITS = Symbol('AUTH_RATE_LIMITS');

export const authRateLimitsProvider: Provider = {
  provide: AUTH_RATE_LIMITS,
  inject: [ConfigService],
  useFactory: (
    config: ConfigService<EnvironmentVariables, true>,
  ): AuthRateLimits => ({
    windowMs:
      config.get('LOGIN_RATE_LIMIT_WINDOW_SECONDS', { infer: true }) * 1000,
    loginPerIp: config.get('LOGIN_RATE_LIMIT_IP_MAX', { infer: true }),
    loginPerUsername: config.get('LOGIN_RATE_LIMIT_USERNAME_MAX', {
      infer: true,
    }),
    passwordChangePerUser: config.get('PASSWORD_CHANGE_RATE_LIMIT_MAX', {
      infer: true,
    }),
  }),
};

/** 429 with a stable code and the seconds to wait (also sent as Retry-After). */
export class AuthRateLimitedException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    super(
      {
        code: AuthErrorCode.TooManyRequests,
        message: 'عدد كبير من المحاولات — يرجى المحاولة لاحقًا',
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

const errorCode = (error: unknown): unknown =>
  error instanceof HttpException
    ? (error.getResponse() as { code?: unknown }).code
    : undefined;

/**
 * Brute-force protection of the credential endpoints (web AND mobile share
 * the same counters, so neither can be used to bypass the other).
 *
 * In-memory, like the registration limit: correct for the single API process
 * this project runs. With several instances (PM2 cluster, replicas) each one
 * keeps its own counters, multiplying the effective limit by the instance
 * count — a shared store (e.g. Redis) would then be required.
 *
 * The IP is Express `req.ip`, which honours X-Forwarded-For ONLY when
 * TRUST_PROXY is set to the verified number of reverse-proxy hops; with the
 * default 0 it is the socket address and client headers are ignored.
 */
@Injectable()
export class AuthRateLimiter {
  private readonly loginIp: AttemptCounter;
  private readonly loginUser: AttemptCounter;
  private readonly passwordChange: AttemptCounter;

  constructor(@Inject(AUTH_RATE_LIMITS) limits: AuthRateLimits) {
    this.loginIp = new AttemptCounter(limits.loginPerIp, limits.windowMs);
    this.loginUser = new AttemptCounter(
      limits.loginPerUsername,
      limits.windowMs,
    );
    this.passwordChange = new AttemptCounter(
      limits.passwordChangePerUser,
      limits.windowMs,
    );
  }

  /** Clock, overridable by unit tests. */
  now = () => Date.now();

  /**
   * Runs a login attempt under the per-IP and per-username limits. Blocked
   * requests are refused BEFORE any password hashing. Only
   * INVALID_CREDENTIALS keeps its reserved slot; a success clears the
   * username's failures.
   */
  async login<T>(
    ip: string,
    username: string,
    attempt: () => Promise<T>,
  ): Promise<T> {
    const ipKey = ip || 'unknown';
    const userKey = username;
    const now = this.now();
    const wait = Math.max(
      this.loginIp.retryAfterSeconds(ipKey, now),
      this.loginUser.retryAfterSeconds(userKey, now),
    );
    if (wait > 0) throw new AuthRateLimitedException(wait);

    this.loginIp.reserve(ipKey, now);
    this.loginUser.reserve(userKey, now);
    try {
      const result = await attempt();
      this.loginIp.refund(ipKey, this.now());
      this.loginUser.clear(userKey);
      return result;
    } catch (error) {
      if (errorCode(error) !== AuthErrorCode.InvalidCredentials) {
        const later = this.now();
        this.loginIp.refund(ipKey, later);
        this.loginUser.refund(userKey, later);
      }
      throw error;
    }
  }

  /** Change-password attempts per account: only WRONG_CURRENT_PASSWORD counts. */
  async changePassword<T>(
    userId: string,
    attempt: () => Promise<T>,
  ): Promise<T> {
    const now = this.now();
    const wait = this.passwordChange.retryAfterSeconds(userId, now);
    if (wait > 0) throw new AuthRateLimitedException(wait);

    this.passwordChange.reserve(userId, now);
    try {
      const result = await attempt();
      this.passwordChange.clear(userId);
      return result;
    } catch (error) {
      if (errorCode(error) !== AuthErrorCode.WrongCurrentPassword)
        this.passwordChange.refund(userId, this.now());
      throw error;
    }
  }
}

/** Adds the Retry-After header when a rate-limited call is refused. */
export async function withRetryAfter<T>(
  res: Response,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AuthRateLimitedException)
      res.setHeader('Retry-After', String(error.retryAfterSeconds));
    throw error;
  }
}
