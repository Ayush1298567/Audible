/**
 * Eval: schema validation sanity check.
 *
 * This is a "meta-eval" — it doesn't hit any LLM, it just verifies
 * that our schemas in src/lib/ai/schemas are well-formed and reject
 * invalid outputs. Every prompt eval depends on this being correct.
 *
 * This eval runs for free (no API calls) but lives in the evals suite
 * so developers running `bun run test:evals` see it as the first
 * sanity pass before the expensive ones.
 */

import { describe, expect, it } from 'vitest';
import {
  coverageShellSchema,
  COVERAGE_SHELL_VALUES,
  pressureSchema,
  PRESSURE_TYPE_VALUES,
  PRESSURE_SOURCE_VALUES,
} from '@/lib/ai/schemas';

describe('coverage-shell schema', () => {
  it('accepts every valid coverage value', () => {
    for (const value of COVERAGE_SHELL_VALUES) {
      const parsed = coverageShellSchema.safeParse({
        coverage: value,
        confidence: 0.95,
        reasoning: 'Two high safeties visible at the snap, cleanly splitting the field.',
      });
      expect(parsed.success).toBe(true);
    }
  });

  it('rejects unknown coverage names', () => {
    const parsed = coverageShellSchema.safeParse({
      coverage: 'cover_9000',
      confidence: 0.95,
      reasoning: 'This is a test.',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects confidence outside [0, 1]', () => {
    const parsed = coverageShellSchema.safeParse({
      coverage: 'cover_3',
      confidence: 1.5,
      reasoning: 'This is a test.',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects missing reasoning', () => {
    const parsed = coverageShellSchema.safeParse({
      coverage: 'cover_3',
      confidence: 0.9,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects reasoning shorter than 10 characters', () => {
    const parsed = coverageShellSchema.safeParse({
      coverage: 'cover_3',
      confidence: 0.9,
      reasoning: 'too short',
    });
    expect(parsed.success).toBe(false);
  });
});

describe('pressure schema', () => {
  it('accepts every valid combination of type + source', () => {
    for (const type of PRESSURE_TYPE_VALUES) {
      for (const source of PRESSURE_SOURCE_VALUES) {
        const parsed = pressureSchema.safeParse({
          type,
          source,
          rusherCount: 4,
          confidence: 0.9,
          reasoning: 'Four rushers committed, weak-side LB dropped into coverage.',
        });
        expect(parsed.success).toBe(true);
      }
    }
  });

  it('rejects rusherCount outside [0, 9]', () => {
    const parsed = pressureSchema.safeParse({
      type: 'base_4',
      source: 'edge',
      rusherCount: 12,
      confidence: 0.9,
      reasoning: 'Every defender rushed, which is implausible.',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects rusherCount that is not an integer', () => {
    const parsed = pressureSchema.safeParse({
      type: 'base_4',
      source: 'edge',
      rusherCount: 4.5,
      confidence: 0.9,
      reasoning: 'Non-integer rusher count.',
    });
    expect(parsed.success).toBe(false);
  });
});
