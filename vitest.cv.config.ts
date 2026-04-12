import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

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
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ['tests/cv-bench/**/*.test.ts'],
      testTimeout: 120_000,
      hookTimeout: 60_000,
      pool: 'threads',
      poolOptions: {
        threads: { singleThread: true },
      },
    },
  }),
);
