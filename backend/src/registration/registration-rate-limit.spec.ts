import type { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../config/env.validation.js';
import { RegistrationRateLimiter } from './registration-rate-limit.guard.js';

const limiter = (max: number, windowSeconds: number) =>
  new RegistrationRateLimiter({
    get: (key: string) =>
      key === 'REGISTRATION_RATE_LIMIT_MAX' ? max : windowSeconds,
  } as unknown as ConfigService<EnvironmentVariables, true>);

describe('RegistrationRateLimiter', () => {
  it('allows `max` hits per window and per client', () => {
    const l = limiter(3, 60);
    expect([1, 2, 3, 4].map(() => l.hit('a', 1000))).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(l.hit('b', 1000)).toBe(true);
  });

  it('opens a new window once the previous one has expired', () => {
    const l = limiter(1, 60);
    expect(l.hit('a', 0)).toBe(true);
    expect(l.hit('a', 59_999)).toBe(false);
    expect(l.hit('a', 60_000)).toBe(true);
  });

  it('reset() forgets every client', () => {
    const l = limiter(1, 60);
    l.hit('a', 0);
    l.reset();
    expect(l.hit('a', 1)).toBe(true);
  });
});
