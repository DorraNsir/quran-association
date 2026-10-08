import { resolveTestDatabase } from './e2e-database.js';

// Runs in every E2E worker BEFORE the app is imported: the Nest config and
// Prisma then read the test database (process env wins over .env).
const db = resolveTestDatabase();
process.env.DATABASE_URL = db.url;
process.env.NODE_ENV = 'test';
