import { NodeEnv, validateEnv } from './env.validation.js';

const BASE = {
  DATABASE_URL: 'postgresql://user:secret@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(48),
};

describe('validateEnv', () => {
  it('applies defaults (port 4000, development, Next.js origin, 15m / 7d, lax)', () => {
    const env = validateEnv(BASE);
    expect(env).toMatchObject({
      PORT: 4000,
      NODE_ENV: NodeEnv.Development,
      FRONTEND_URL: 'http://localhost:3000',
      JWT_ACCESS_EXPIRES_IN: '15m',
      REFRESH_TOKEN_EXPIRES_IN: '7d',
      REFRESH_COOKIE_SAMESITE: 'lax',
    });
  });

  it('converts PORT from a string', () => {
    expect(validateEnv({ ...BASE, PORT: '5000' }).PORT).toBe(5000);
  });

  it('rejects a missing or non-postgres DATABASE_URL', () => {
    expect(() =>
      validateEnv({ JWT_ACCESS_SECRET: BASE.JWT_ACCESS_SECRET }),
    ).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ ...BASE, DATABASE_URL: 'mysql://x' })).toThrow(
      /postgresql/,
    );
  });

  it('requires a strong access-token secret', () => {
    expect(() => validateEnv({ DATABASE_URL: BASE.DATABASE_URL })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
    expect(() => validateEnv({ ...BASE, JWT_ACCESS_SECRET: 'short' })).toThrow(
      /32 characters/,
    );
  });

  it('refuses a placeholder secret in production', () => {
    expect(() =>
      validateEnv({
        ...BASE,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'change-me-'.repeat(5),
      }),
    ).toThrow(/placeholder/);
  });

  it('validates durations, origins and SameSite', () => {
    expect(() =>
      validateEnv({ ...BASE, JWT_ACCESS_EXPIRES_IN: '15 minutes' }),
    ).toThrow(/JWT_ACCESS_EXPIRES_IN/);
    expect(() => validateEnv({ ...BASE, FRONTEND_URL: '*' })).toThrow(
      /FRONTEND_URL/,
    );
    expect(() =>
      validateEnv({ ...BASE, REFRESH_COOKIE_SAMESITE: 'whatever' }),
    ).toThrow();
    expect(
      validateEnv({ ...BASE, FRONTEND_URL: 'https://a.tn, https://b.tn' })
        .FRONTEND_URL,
    ).toContain('b.tn');
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ ...BASE, NODE_ENV: 'staging' })).toThrow(
      /NODE_ENV/,
    );
  });
});

describe('validateEnv — TEACHER_ATTENDANCE_WINDOW_DAYS', () => {
  const BASE = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_ACCESS_SECRET: 'x'.repeat(48),
  };

  it('defaults to 7 and accepts 1–366', () => {
    expect(validateEnv(BASE).TEACHER_ATTENDANCE_WINDOW_DAYS).toBe(7);
    expect(
      validateEnv({ ...BASE, TEACHER_ATTENDANCE_WINDOW_DAYS: '30' })
        .TEACHER_ATTENDANCE_WINDOW_DAYS,
    ).toBe(30);
    expect(
      validateEnv({ ...BASE, TEACHER_ATTENDANCE_WINDOW_DAYS: '1' })
        .TEACHER_ATTENDANCE_WINDOW_DAYS,
    ).toBe(1);
  });

  it('rejects 0, more than 366 and non-integers', () => {
    for (const value of ['0', '367', '2.5', 'week']) {
      expect(() =>
        validateEnv({ ...BASE, TEACHER_ATTENDANCE_WINDOW_DAYS: value }),
      ).toThrow(/TEACHER_ATTENDANCE_WINDOW_DAYS/);
    }
  });
});

describe('validateEnv — registration rate limit', () => {
  const BASE = {
    DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
    JWT_ACCESS_SECRET: 'x'.repeat(48),
  };

  it('defaults to 5 submissions per 900 seconds', () => {
    const env = validateEnv(BASE);
    expect(env.REGISTRATION_RATE_LIMIT_MAX).toBe(5);
    expect(env.REGISTRATION_RATE_LIMIT_WINDOW_SECONDS).toBe(900);
    expect(
      validateEnv({ ...BASE, REGISTRATION_RATE_LIMIT_MAX: '20' })
        .REGISTRATION_RATE_LIMIT_MAX,
    ).toBe(20);
  });

  it('rejects 0 and non-integers', () => {
    for (const key of [
      'REGISTRATION_RATE_LIMIT_MAX',
      'REGISTRATION_RATE_LIMIT_WINDOW_SECONDS',
    ]) {
      for (const value of ['0', '1.5', 'many']) {
        expect(() => validateEnv({ ...BASE, [key]: value })).toThrow(
          new RegExp(key),
        );
      }
    }
  });
});
