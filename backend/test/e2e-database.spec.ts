import { resolveTestDatabase } from './e2e-database.js';

/** Unit test of the E2E safety guards (no database involved). */
describe('E2E test-database guards', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  const withEnv = (env: Record<string, string | undefined>) => {
    process.env = { ...saved, ...env };
    return () => resolveTestDatabase();
  };

  it('accepts a local *_test database distinct from DATABASE_URL', () => {
    const db = withEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/quran_platform_dev',
      TEST_DATABASE_URL: 'postgresql://u:p@localhost:5432/quran_platform_test',
    })();
    expect(db.name).toBe('quran_platform_test');
  });

  it('refuses the development database, a non-test name, production and remote hosts', () => {
    const dev = 'postgresql://u:p@localhost:5432/quran_platform_dev';
    expect(withEnv({ TEST_DATABASE_URL: undefined })).toThrow(
      /TEST_DATABASE_URL/,
    );
    expect(withEnv({ DATABASE_URL: dev, TEST_DATABASE_URL: dev })).toThrow(
      /_test/,
    );
    expect(
      withEnv({
        DATABASE_URL: 'postgresql://u:p@localhost:5432/x_test',
        TEST_DATABASE_URL: 'postgresql://u:p@localhost:5432/x_test',
      }),
    ).toThrow(/same database/);
    expect(
      withEnv({
        NODE_ENV: 'production',
        TEST_DATABASE_URL: 'postgresql://u:p@localhost:5432/a_test',
      }),
    ).toThrow(/production/);
    expect(
      withEnv({
        NODE_ENV: 'test',
        TEST_DATABASE_URL: 'postgresql://u:p@db.example.com:5432/a_test',
      }),
    ).toThrow(/not local/);
  });
});
