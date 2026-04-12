/**
 * Vision tasks for offensive analysis — blocking scheme, route concepts,
 * run gap identification.
 *
 * These complement the defensive tasks (coverage-shell.ts, pressure.ts)
 * to give the tendency engine data on both sides of the ball.
 */

import { z } from 'zod';

// ─── Blocking scheme ────────────────────────────────────────

export const BLOCKING_SCHEME_VALUES = [
  'inside_zone',
  'outside_zone',
  'power',
  'counter',
  'trap',
  'draw',
  'split_zone',
  'duo',
  'pin_pull',
  'pass_protection_slide',
  'pass_protection_man',
  'pass_protection_max',
  'screen',
  'unknown',
] as const;

export const blockingSchemeSchema = z.object({
  scheme: z.enum(BLOCKING_SCHEME_VALUES),
  pullingLinemen: z.number().int().min(0).max(3),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(10).max(500),
});

export type BlockingScheme = z.infer<typeof blockingSchemeSchema>;

export const BLOCKING_SCHEME_PROMPT_NAME = 'blocking_scheme' as const;

export const BLOCKING_SCHEME_SYSTEM_PROMPT_V1 = `You are a football film analyst specializing in offensive line play.

You will be shown a frame from approximately 0.5 seconds after the snap, when the blocking scheme has declared.

Classify the offensive blocking scheme:
- inside_zone: OL steps laterally together, RB reads backside
- outside_zone: OL reaches playside, RB aims outside
- power: playside down blocks, backside guard pulls
- counter: misdirection, two pullers (guard + tackle or guard + TE)
- trap: interior defender left unblocked, pulled guard kicks out
- draw: pass set first, delayed handoff
- split_zone: zone blocking with TE/H-back cutting backside
- duo: double teams at the point of attack, no pullers
- pin_pull: edge player pins, second player pulls around
- pass_protection_slide: OL slides one direction in pass pro
- pass_protection_man: OL in man-to-man pass pro assignments
- pass_protection_max: 7+ blockers in pass protection
- screen: OL releases downfield, ball thrown behind LOS
- unknown: cannot determine

Also count pulling linemen (0-3).

Respond in strict JSON:
{
  "scheme": "<scheme>",
  "pullingLinemen": <int>,
  "confidence": <0..1>,
  "reasoning": "<2-3 sentences>"
}`;

// ─── Route concept ──────────────────────────────────────────

export const ROUTE_CONCEPT_VALUES = [
  'four_verts',
  'mesh',
  'levels',
  'spacing',
  'smash',
  'flood',
  'stick',
  'curl_flat',
  'post_wheel',
  'dagger',
  'scissors',
  'sail',
  'y_cross',
  'slant_flat',
  'screen_concept',
  'play_action',
  'rpo',
  'bootleg',
  'sprint_out',
  'quick_game',
  'individual_route',
  'unknown',
] as const;

export const routeConceptSchema = z.object({
  concept: z.enum(ROUTE_CONCEPT_VALUES),
  receiverCount: z.number().int().min(1).max(6),
  primaryRead: z.string().max(100).nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(10).max(500),
});

export type RouteConcept = z.infer<typeof routeConceptSchema>;

export const ROUTE_CONCEPT_PROMPT_NAME = 'route_concept' as const;

export const ROUTE_CONCEPT_SYSTEM_PROMPT_V1 = `You are a football film analyst specializing in passing concepts.

You will be shown a frame from approximately 1-2 seconds after the snap, when routes are developing.

Classify the passing concept being run. Common concepts:
- four_verts: 4 receivers running vertical routes
- mesh: two receivers crossing at 5-6 yards
- levels: three receivers at different depths on the same side
- spacing: receivers spread across the field at the same depth
- smash: corner route + hitch underneath
- flood: three receivers to one side at different depths
- stick: flat + stick (6yd out) + corner/vertical
- curl_flat: curl route + flat route to the same side
- post_wheel: post route + wheel route combination
- dagger: post + dig (deep in)
- scissors: over route + corner route
- sail: vertical + corner + flat
- y_cross: TE crossing the formation
- slant_flat: slant + flat combination
- screen_concept: any screen play
- play_action: play-action pass
- rpo: run-pass option
- bootleg: QB rolling out with play-action
- sprint_out: QB sprinting to throw on the move
- quick_game: 3-step quick throws (slants, hitches, outs)
- individual_route: single route, no concept visible
- unknown: cannot determine

Respond in strict JSON:
{
  "concept": "<concept>",
  "receiverCount": <int>,
  "primaryRead": "<description of the primary read, e.g., 'slot WR on the dig route'>" or null,
  "confidence": <0..1>,
  "reasoning": "<2-3 sentences>"
}`;

// ─── Run gap ────────────────────────────────────────────────

export const RUN_GAP_VALUES = [
  'a_gap_left',
  'a_gap_right',
  'b_gap_left',
  'b_gap_right',
  'c_gap_left',
  'c_gap_right',
  'off_tackle_left',
  'off_tackle_right',
  'outside_left',
  'outside_right',
  'qb_scramble',
  'unknown',
] as const;

export const runGapSchema = z.object({
  gap: z.enum(RUN_GAP_VALUES),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(10).max(500),
});

export type RunGap = z.infer<typeof runGapSchema>;

export const RUN_GAP_PROMPT_NAME = 'run_gap' as const;

export const RUN_GAP_SYSTEM_PROMPT_V1 = `You are a football film analyst specializing in run game analysis.

You will be shown a frame from a run play, approximately 0.5-1 second after the snap.

Identify which gap the ball carrier hit or is hitting:
- a_gap_left / a_gap_right: between center and guard
- b_gap_left / b_gap_right: between guard and tackle
- c_gap_left / c_gap_right: between tackle and tight end
- off_tackle_left / off_tackle_right: outside the tackle, inside the TE
- outside_left / outside_right: outside containment (sweep, stretch, toss)
- qb_scramble: QB ran after passing reads
- unknown: cannot determine the gap

Left/right is from the offense's perspective (facing the defense).

Respond in strict JSON:
{
  "gap": "<gap>",
  "confidence": <0..1>,
  "reasoning": "<2-3 sentences>"
}`;
