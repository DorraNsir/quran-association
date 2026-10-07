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
