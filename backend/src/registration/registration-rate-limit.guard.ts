import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import type { EnvironmentVariables } from '../config/env.validation.js';

/** Above this many tracked clients, expired windows are swept on each hit. */
const SWEEP_THRESHOLD = 10_000;

/**
 * Fixed-window limit of public registration submissions per client IP
 * (REGISTRATION_RATE_LIMIT_MAX per REGISTRATION_RATE_LIMIT_WINDOW_SECONDS).
 * In-memory: the API runs as a single process (no Redis in this project);
 * behind a reverse proxy, Express `trust proxy` must be set so req.ip is the
 * client address.
 */
@Injectable()
export class RegistrationRateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private readonly max: number;
  private readonly windowMs: number;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.max = config.get('REGISTRATION_RATE_LIMIT_MAX', { infer: true });
    this.windowMs =
      config.get('REGISTRATION_RATE_LIMIT_WINDOW_SECONDS', { infer: true }) *
      1000;
  }

  /** Counts one submission; false when the client is over the limit. */
  hit(key: string, now = Date.now()): boolean {
    if (this.hits.size > SWEEP_THRESHOLD) {
      for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    }
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (entry.count >= this.max) return false;
    entry.count += 1;
    return true;
  }

  /** Forget every counter (tests). */
  reset() {
    this.hits.clear();
  }
}

@Injectable()
export class RegistrationRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: RegistrationRateLimiter) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!this.limiter.hit(request.ip ?? 'unknown')) {
      throw new HttpException(
        {
          code: 'TOO_MANY_REQUESTS',
          message: 'عدد كبير من الطلبات — يرجى المحاولة لاحقًا',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
