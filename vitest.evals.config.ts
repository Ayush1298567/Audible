import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * LLM eval harness config. Runs separately from unit tests because:
 *   1. Each eval hits real models and costs money — not on every PR
 *   2. Evals are slower (network latency) and have different timeouts
 *   3. Eval failures gate differently — regressions vs flakes
 *
 * Run locally: `bun run test:evals`
 * Run in CI: nightly + on PRs that touch src/lib/ai/**
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/evals/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    // Evals run one at a time to stay under provider rate limits
    // and to produce deterministic cost per run.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/tests': path.resolve(__dirname, './tests'),
    },
  },
});
