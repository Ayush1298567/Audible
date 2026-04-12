/**
 * Vision task: classify the defensive coverage shell on a single play.
 *
 * Sent two frames per play:
 *   frame[0] = pre-snap alignment
 *   frame[1] = ~1 second post-snap, after coverage has declared
 *
 * Output is a strictly-typed JSON object. Both Anthropic Claude and
 * OpenAI GPT-4o run this same schema; the ensemble vote compares their
 * outputs and only writes a tag when both agree within the confidence
 * threshold.
 *
 * See PLAN.md §5.3 (vision ensemble) and §5.4 (prompt versioning).
 */

import { z } from 'zod';

export const COVERAGE_SHELL_VALUES = [
  'cover_0',
  'cover_1',
  'cover_2',
  'cover_3',
  'cover_4',
  'quarters',
  'man_free',
  'man_under',
  'unknown',
] as const;

export const coverageShellSchema = z.object({
  coverage: z.enum(COVERAGE_SHELL_VALUES),
  // Model's self-reported confidence in [0, 1]. Both models must report
  // >= ENSEMBLE_CONFIDENCE_THRESHOLD for the tag to be surfaced.
  confidence: z.number().min(0).max(1),
  // Free-text reasoning, stored for debugging. Never shown to the coach.
  reasoning: z.string().min(10).max(500),
});

export type CoverageShell = z.infer<typeof coverageShellSchema>;

/**
 * Prompt name used in the `prompts` table. When we improve the prompt,
 * we bump the version and deactivate the old one. See PLAN.md §5.4.
 */
export const COVERAGE_SHELL_PROMPT_NAME = 'coverage_shell' as const;

/**
 * System prompt (v1). Pinned here for evals; mirrored into the DB on
 * migration. DO NOT edit without bumping the version.
 */
export const COVERAGE_SHELL_SYSTEM_PROMPT_V1 = `You are a football film analyst. You will be shown two frames from a single play:
frame 0 is the pre-snap defensive alignment, frame 1 is approximately one second
after the snap, when the coverage has declared.

Your job is to classify the defensive coverage shell into exactly one of these
categories:

- cover_0: no deep safety, all defenders in man coverage
- cover_1: one deep safety in the middle, man coverage underneath
- cover_2: two deep safeties splitting the field in half
- cover_3: three deep defenders (two corners + one safety), zone underneath
- cover_4: four deep defenders, quarters zone
- quarters: pattern-match four-deep with man-match rules
- man_free: man-to-man with one free safety help
- man_under: man-to-man with two-deep help (cover 2 man)
- unknown: coverage cannot be reliably determined from the frames

Respond in strict JSON matching this shape:
{
  "coverage": "<one of the values above>",
  "confidence": <number between 0.0 and 1.0>,
  "reasoning": "<2-3 sentences explaining what you observed in the frames>"
}

Be honest about confidence. If the frames are blurry, the angle is bad, or
multiple coverages are plausible, report low confidence and choose the most
likely value. If you truly cannot tell, return "unknown" with a confidence
that reflects your uncertainty.`;
