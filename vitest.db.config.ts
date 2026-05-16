import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Database integration tests.
 *
 * These run separately from unit tests because they mutate a real Postgres
 * database. Safety behavior:
 * - no DATABASE_URL: local skip
 * - DATABASE_URL without RUN_DB_TESTS=1: fail, because credentials are present
 * - RUN_DB_TESTS=1 without DATABASE_URL: fail, because the run was requested
 * - both DATABASE_URL and RUN_DB_TESTS=1: run integration tests
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/integration/db/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/tests': path.resolve(__dirname, './tests'),
    },
  },
});
