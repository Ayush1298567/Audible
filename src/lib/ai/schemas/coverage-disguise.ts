/**
 * Vision task: detect pre-snap coverage disguise / rotation indicators.
 */

import { z } from 'zod';

export const coverageDisguiseSchema = z.object({
  disguised: z.boolean(),
  /** If disguised, what kind of rotation or late movement was visible */
  disguiseKind: z
    .enum(['rotation', 'late_swap', 'cloud_leverage', 'show_blitz_drop', 'none', 'unknown'])
    .nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(10).max(500),
});

export type CoverageDisguise = z.infer<typeof coverageDisguiseSchema>;

export const COVERAGE_DISGUISE_PROMPT_NAME = 'coverage_disguise' as const;

export const COVERAGE_DISGUISE_SYSTEM_PROMPT_V1 = `You are a football film analyst focused on defensive disguise before the snap.

You will be shown two frames: pre-snap alignment and ~1 second post-snap when coverage declares.

Determine whether the defense used disguise — showing one shell or pressure look pre-snap, then rotating, swapping, or dropping into a different structure after the snap.

disguiseKind:
- rotation: safeties or corners rotate post-snap into different roles
- late_swap: defenders exchange responsibilities after the snap
- cloud_leverage: leveraged alignment that hides true coverage
- show_blitz_drop: simulated pressure then defenders drop
- none: what you saw pre-snap matched post-snap structure
- unknown: cannot tell

Respond in strict JSON:
{
  "disguised": <boolean>,
  "disguiseKind": "<enum or null if not disguised>",
  "confidence": <0..1>,
  "reasoning": "<2-3 sentences>"
}`;
