/**
 * E2E tests run ONLY against a dedicated, disposable test database
 * (TEST_DATABASE_URL, e.g. …/quran_platform_test). These guards refuse to run
 * against anything that looks like development or production data.
 */
import 'dotenv/config';

const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export interface TestDatabase {
  url: string;
  name: string;
}

function databaseName(url: string) {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

export function resolveTestDatabase(): TestDatabase {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('E2E refused: NODE_ENV=production.');
  }
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'E2E refused: TEST_DATABASE_URL is not set (see .env.example — a dedicated *_test database).',
    );
  }
  const name = databaseName(url);
  const { hostname } = new URL(url);
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(
      `E2E refused: the test database name must end with "_test" (got "${name}").`,
    );
  }
  const devUrl = process.env.DATABASE_URL;
  if (
    devUrl &&
    databaseName(devUrl) === name &&
    new URL(devUrl).host === new URL(url).host
  ) {
    throw new Error(
      'E2E refused: TEST_DATABASE_URL points to the same database as DATABASE_URL.',
    );
  }
  if (
    !ALLOWED_HOSTS.has(hostname) &&
    process.env.E2E_ALLOW_REMOTE_DB !== 'true'
  ) {
    throw new Error(
      `E2E refused: test database host "${hostname}" is not local (set E2E_ALLOW_REMOTE_DB=true to override).`,
    );
  }
  return { url, name };
}
