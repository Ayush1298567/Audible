/**
 * Vision task: detect all visible players and their field positions.
 *
 * Sent 2 frames per play (pre-snap + post-snap). The model identifies
 * every player visible, estimates their position on the field, reads
 * jersey numbers where possible, and notes alignment details.
 *
 * This is the foundation for per-player tendency tracking — safety
 * depth, CB cushion, receiver splits, OL gaps, LB alignment, etc.
 */

import { z } from 'zod';

export const playerDetectionSchema = z.object({
  players: z.array(
    z.object({
      team: z.enum(['offense', 'defense', 'unknown']),
      jerseyNumber: z.number().int().min(0).max(99).nullable(),
      positionEstimate: z.enum([
        'QB', 'RB', 'FB', 'WR', 'TE', 'OL', 'C',
        'DL', 'DE', 'DT', 'NT', 'LB', 'MLB', 'OLB', 'ILB',
        'CB', 'S', 'FS', 'SS', 'NB',
        'K', 'P', 'LS',
        'unknown',
      ]),
      xYards: z.number().min(-10).max(110),
      yYards: z.number().min(-5).max(58),
      depthYards: z.number().min(-20).max(50),
      alignmentNotes: z.string().max(200),
    }),
  ).min(1).max(30),
  confidence: z.number().min(0).max(1),
  playerCount: z.number().int().min(1).max(30),
  reasoning: z.string().min(10).max(500),
});

export type PlayerDetection = z.infer<typeof playerDetectionSchema>;

export const PLAYER_POSITIONS_PROMPT_NAME = 'player_positions' as const;

export const PLAYER_POSITIONS_SYSTEM_PROMPT_V1 = `You are a football film analyst with expertise in player identification and alignment.

You will be shown a frame from a football play. Identify every player visible on the field.

For each player, provide:
- team: "offense" (has the ball / on the line) or "defense" (reacting to offense)
- jerseyNumber: the jersey number if you can read it, null if not visible
- positionEstimate: best guess at their position (QB, RB, WR, TE, OL, C, DL, DE, DT, NT, LB, MLB, OLB, ILB, CB, S, FS, SS, NB, K, P, LS, or unknown)
- xYards: approximate yard line (0 = left end zone, 50 = midfield, 100 = right end zone). Estimate based on yard line markers visible in the frame.
- yYards: approximate lateral position (0 = bottom/near sideline, 26.65 = middle of field, 53.3 = top/far sideline). Estimate based on hash marks and sidelines.
- depthYards: depth from the line of scrimmage. Positive = off the ball (toward own end zone for defense, toward opponent end zone for offense). For defenders: how many yards off the ball they are. For offensive skill players: how far behind the line.
- alignmentNotes: brief note about their alignment. Examples:
  - For CB: "press alignment on boundary WR" or "7-yard cushion in slot"
  - For S: "single high at 12 yards" or "in the box at 5 yards"
  - For LB: "stacked behind DT at 4 yards" or "walked out over slot"
  - For OL: "wide split" or "tight split"
  - For WR: "split wide at numbers" or "tight slot, 3 yards from TE"
  - For RB: "offset right at 5 yards" or "pistol at 4 yards"
  - For QB: "under center" or "shotgun at 5 yards"

Respond in strict JSON:
{
  "players": [ { "team": "...", "jerseyNumber": ..., "positionEstimate": "...", "xYards": ..., "yYards": ..., "depthYards": ..., "alignmentNotes": "..." }, ... ],
  "confidence": 0.0-1.0,
  "playerCount": <number of players identified>,
  "reasoning": "Brief description of what you see — formation, defensive front, notable alignments"
}

Tips:
- If the camera angle makes it hard to see some players (e.g., far side of the field), note lower confidence
- Yard line markers and hash marks are your reference points for x,y coordinates
- Count players carefully — there should be ~11 per team on a normal play
- If you can only see one side clearly, report what you see and note the limitation`;
