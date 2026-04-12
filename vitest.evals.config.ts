import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

/**
 * LLM eval harness config. Runs separately from unit tests because:
 *   1. Each eval hits real models and costs money — not on every PR
 *   2. Evals are slower (network latency) and have different timeouts
 *   3. Eval failures gate differently — regressions vs flakes
 *
 * Run locally: `bun run test:evals`
 * Run in CI: nightly + on PRs that touch src/lib/ai/**
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ['tests/evals/**/*.test.ts'],
      testTimeout: 60_000,
      hookTimeout: 30_000,
      // Evals run one at a time to stay under provider rate limits
      // and to produce deterministic cost per run.
      pool: 'threads',
      poolOptions: {
        threads: { singleThread: true },
      },
    },
  }),
);
