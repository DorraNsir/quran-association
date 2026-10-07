import { NodeEnv, validateEnv } from './env.validation.js';

const DATABASE_URL = 'postgresql://user:secret@localhost:5432/db';

describe('validateEnv', () => {
  it('applies defaults (port 4000, development, Next.js origin)', () => {
    const env = validateEnv({ DATABASE_URL });
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe(NodeEnv.Development);
    expect(env.CORS_ORIGINS).toBe('http://localhost:3000');
  });

  it('converts PORT from a string', () => {
    expect(validateEnv({ DATABASE_URL, PORT: '5000' }).PORT).toBe(5000);
  });

  it('rejects a missing or non-postgres DATABASE_URL', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ DATABASE_URL: 'mysql://x' })).toThrow(
      /postgresql/,
    );
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(() => validateEnv({ DATABASE_URL, NODE_ENV: 'staging' })).toThrow();
  });
});
