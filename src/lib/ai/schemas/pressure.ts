/**
 * Vision task: classify defensive pressure type and source on a single play.
 *
 * Sent one frame at the snap moment (plus ~0.5s). The model identifies:
 *   - how many rushers committed to the pass rush
 *   - what kind of pressure concept it was (base 4-man, blitz, stunt)
 *   - which gap / side the pressure attacked
 *
 * See PLAN.md §5.3.
 */

import { z } from 'zod';

export const PRESSURE_TYPE_VALUES = [
  'base_4',
  'base_5',
  'base_6',
  'lb_blitz',
  'db_blitz',
  'lb_stunt',
  'dl_stunt',
  'no_pressure',
  'unknown',
] as const;

export const PRESSURE_SOURCE_VALUES = [
  'weak_side',
  'strong_side',
  'middle',
  'edge',
  'a_gap',
  'b_gap',
  'c_gap',
  'none',
  'unknown',
] as const;

export const pressureSchema = z.object({
  type: z.enum(PRESSURE_TYPE_VALUES),
  source: z.enum(PRESSURE_SOURCE_VALUES),
  rusherCount: z.number().int().min(0).max(9),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(10).max(500),
});

export type PressureTag = z.infer<typeof pressureSchema>;

export const PRESSURE_PROMPT_NAME = 'pressure' as const;

export const PRESSURE_SYSTEM_PROMPT_V1 = `You are a football film analyst. You will be shown one frame from approximately
one-half second after the snap, when the pass rush has committed but the ball is
still in the quarterback's hands.

Classify the defensive pressure concept into:

TYPE:
- base_4: standard 4-man rush, no stunts
- base_5: 5-man rush, no stunts (nickel rush)
- base_6: 6-man rush, no stunts (heavy blitz)
- lb_blitz: a linebacker is blitzing
- db_blitz: a defensive back (nickel/safety) is blitzing
- lb_stunt: linebacker(s) and defensive lineman exchanging gaps
- dl_stunt: two defensive linemen exchanging gaps (T-E stunt, etc.)
- no_pressure: the defense is dropping into coverage with no rush
- unknown: cannot be determined

SOURCE (where the primary rusher came from):
- weak_side / strong_side / middle / edge
- a_gap / b_gap / c_gap (specific gap designation)
- none (if no_pressure)
- unknown

RUSHER_COUNT: how many defenders committed to the pass rush (0-9).

Respond in strict JSON:
{
  "type": "<type>",
  "source": "<source>",
  "rusherCount": <int>,
  "confidence": <0..1>,
  "reasoning": "<2-3 sentences>"
}`;
