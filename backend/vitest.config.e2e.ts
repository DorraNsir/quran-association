import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Dedicated *_test database only (guards + migrations in the global setup)
    globalSetup: ['./test/e2e-global-setup.ts'],
    setupFiles: ['./test/e2e-setup-env.ts'],
    // Suites share the test database (e.g. active-admin counts): run files one at a time
    fileParallelism: false,
  },
});
