/**
 * Vision task: estimate CB cushion and high safety depth from pre-snap frame.
 */

import { z } from 'zod';

export const alignmentDepthSchema = z.object({
  /** Approximate cushion for the boundary or primary outside CB (yards) */
  cbCushionYards: z.number().min(0).max(25),
  /** Depth of the deepest high safety from LOS (yards) */
  safetyDepthYards: z.number().min(0).max(40),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(10).max(500),
});

export type AlignmentDepth = z.infer<typeof alignmentDepthSchema>;

export const ALIGNMENT_DEPTH_PROMPT_NAME = 'alignment_depth' as const;

export const ALIGNMENT_DEPTH_SYSTEM_PROMPT_V1 = `You are a football film analyst reading defensive alignment depths from a pre-snap frame.

Estimate:
- cbCushionYards: horizontal cushion / off-alignment for the primary outside corner (yards). If unclear, best estimate 3-10.
- safetyDepthYards: how deep the high safety (or single-high) is from the line of scrimmage in yards.

Use visible landmarks (numbers, hashes, sideline). If the camera hides depth, lower confidence.

Respond in strict JSON:
{
  "cbCushionYards": <number>,
  "safetyDepthYards": <number>,
  "confidence": <0..1>,
  "reasoning": "<2-3 sentences>"
}`;
