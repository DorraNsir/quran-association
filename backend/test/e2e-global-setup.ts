import { execFileSync } from 'node:child_process';

import pg from 'pg';

import { resolveTestDatabase } from './e2e-database.js';

/**
 * Runs once before the E2E suites: validates the target, creates the test
 * database if missing (never drops anything) and applies the committed
 * migrations with `prisma migrate deploy` — the same migrations as production.
 */
export default async function setup() {
  const db = resolveTestDatabase();

  const admin = new URL(db.url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const exists = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [db.name],
    );
    if (exists.rowCount === 0)
      await client.query(`CREATE DATABASE "${db.name}"`); // name validated: [a-z0-9_]+_test
  } finally {
    await client.end();
  }

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: db.url },
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  // Last check: the database we are about to test really is the test one
  const check = new pg.Client({ connectionString: db.url });
  await check.connect();
  const { rows } = await check.query<{ db: string }>(
    'SELECT current_database() AS db',
  );
  await check.end();
  if (rows[0]?.db !== db.name)
    throw new Error(
      `E2E refused: connected to "${rows[0]?.db}", expected "${db.name}".`,
    );
}
