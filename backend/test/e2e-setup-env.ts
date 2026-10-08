import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resolveTestDatabase } from './e2e-database.js';

// Runs in every E2E worker BEFORE the app is imported: the Nest config and
// Prisma then read the test database (process env wins over .env).
const db = resolveTestDatabase();
process.env.DATABASE_URL = db.url;
process.env.NODE_ENV = 'test';
// Scheduled announcements are published by the tests themselves (no background timer)
process.env.ANNOUNCEMENT_SCHEDULER_INTERVAL_SECONDS = '0';
// The run's throwaway storage root (global setup): tests never touch development uploads
process.env.FILE_STORAGE_ROOT =
  process.env.E2E_FILE_STORAGE_ROOT ??
  join(tmpdir(), `quran-platform-e2e-files-${process.pid}`);
process.env.FILE_CLEANUP_INTERVAL_MINUTES = '0';
