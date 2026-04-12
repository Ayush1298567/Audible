import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * CV benchmark config. Runs the vision ensemble against the held-out
 * labeled-plays set and asserts precision thresholds per task.
 *
 * These tests are GATED on having the labeled-plays fixture, which is
 * provided by the founder (see TEST-PLAN.md §2.2). Until the fixture
 * exists, this config's specs are skipped with a clear message.
 *
 * Run locally: `bun run test:cv`
 * Run in CI: nightly
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/cv-bench/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/tests': path.resolve(__dirname, './tests'),
    },
  },
});
