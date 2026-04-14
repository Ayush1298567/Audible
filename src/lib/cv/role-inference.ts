/* biome-ignore-all lint/style/noNonNullAssertion: bounds-checked indexing
   over track point arrays in the feature-extraction inner loop. */
/**
 * Role inference for tracked players.
 *
 * We've got tracks with motion data and (sometimes) field-space coords.
 * But "peak speed 8.5 yds/s" is less useful than "S #42 peak speed 8.5
 * yds/s" — the coach wants to know who did what.
 *
 * Instead of using computer vision again (expensive), we hand Claude a
 * compact feature vector per track and a little play context (formation,
 * playType, coverage). Claude classifies each track into a football role
 * from kinematics + position alone. Cheap, fast, good enough.
 *
 * Roles we emit (chosen for coach usefulness — ~11-on-11 coverage):
 *   Offensive: QB, RB, WR, TE, OL
 *   Defensive: DL, LB, CB, S
 *   Other:     REF, SIDELINE, UNKNOWN
 *
 * Only tracks with field-space coords (post M3 calibration) get labels.
 * Pixel-space tracks leave role undefined — the heuristics aren't
 * reliable without yard coords.
 */

import { gateway, generateText, Output } from 'ai';
import { z } from 'zod';
import type { PlayerTrack } from './player-tracker';

const ROLE_MODEL = 'anthropic/claude-sonnet-4.6';

const ROLE_VALUES = [
  'QB',
  'RB',
  'WR',
  'TE',
  'OL',
  'DL',
  'LB',
  'CB',
  'S',
  'REF',
  'SIDELINE',
  'UNKNOWN',
] as const;
type Role = (typeof ROLE_VALUES)[number];

// ─── Feature extraction ─────────────────────────────────────

interface TrackFeatures {
  trackId: string;
  jersey?: string;
  /** Pre-snap X (yards downfield). */
  startFx: number;
  /** Pre-snap Y (yards from near sideline). */
  startFy: number;
  /** Net downfield motion (last fx - first fx). */
  netDownfield: number;
  /** Net lateral motion. */
  netLateral: number;
  /** Max speed in yards/sec. */
  maxSpeed: number;
  /** Total yards traveled. */
  totalYards: number;
  /** Max downfield depth reached. */
  maxDepth: number;
  /** Duration visible (seconds). */
  duration: number;
}

function extractFeatures(track: PlayerTrack): TrackFeatures | null {
  const pts = track.points;
  if (pts.length < 2) return null;

  // Require field-space coords for reliable classification
  const firstField = pts.find((p) => p.fx !== undefined && p.fy !== undefined);
  const lastField = [...pts].reverse().find((p) => p.fx !== undefined && p.fy !== undefined);
  if (!firstField || !lastField || firstField.fx === undefined || lastField.fx === undefined)
    return null;

  let maxSpeed = 0;
  let totalYards = 0;
  let maxDepth = -Infinity;

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (a.fx === undefined || a.fy === undefined || b.fx === undefined || b.fy === undefined)
      continue;
    const dt = b.t - a.t;
    if (dt <= 0) continue;
    const dx = b.fx - a.fx;
    const dy = b.fy - a.fy;
    const d = Math.sqrt(dx * dx + dy * dy);
    totalYards += d;
    const speed = d / dt;
    if (speed > maxSpeed) maxSpeed = speed;
    if (b.fx > maxDepth) maxDepth = b.fx;
  }
  if (firstField.fx! > maxDepth) maxDepth = firstField.fx!;

  return {
    trackId: track.trackId,
    jersey: track.jersey,
    startFx: Number(firstField.fx.toFixed(1)),
    startFy: Number(firstField.fy!.toFixed(1)),
    netDownfield: Number((lastField.fx - firstField.fx).toFixed(1)),
    netLateral: Number((lastField.fy! - firstField.fy!).toFixed(1)),
    maxSpeed: Number(maxSpeed.toFixed(1)),
    totalYards: Number(totalYards.toFixed(1)),
    maxDepth: Number(maxDepth.toFixed(1)),
    duration: Number((lastField.t - firstField.t).toFixed(1)),
  };
}

// ─── Claude classification ──────────────────────────────────

const roleSchema = z.object({
  assignments: z.array(
    z.object({
      trackId: z.string(),
      role: z.enum(ROLE_VALUES),
      confidence: z.number().min(0).max(1),
      reasoning: z.string().max(120).optional(),
    }),
  ),
});

const ROLE_SYSTEM = `You are a football film analyst. You will see features for N tracked players from
a single play, in field-space yards. Classify each track into one of these roles:

  QB, RB, WR, TE, OL, DL, LB, CB, S, REF, SIDELINE, UNKNOWN

Field coordinate system:
  startFx = yards downfield from near goal line (0-100)
  startFy = yards from near sideline (0-53.3)
  netDownfield = (final fx - initial fx). Positive = moved toward far end zone.
  maxSpeed = yards/sec, peak speed during the play
  totalYards = total path length in yards
  maxDepth = deepest fx reached

Classification heuristics:
  - OL / DL are at the line of scrimmage (narrow X range), move slowly (< 4 yds/s), travel < 6 yds total
  - QB starts behind LOS (offense side), may scramble or drop back
  - RB starts 3-7 yds behind LOS, high speed after the snap, hits gaps
  - WR starts wide (startFy near 0 or 53.3 if split wide, or 3-10 yds from sideline in slot)
    and moves downfield with high max speed (>6 yds/s)
  - TE can start attached to the line (near an OL) or in H-back alignment — moderate speed
  - CB starts wide across from WRs on defense side, ~5-7 yds off the LOS
  - S starts deep (10+ yds behind LOS on defense side), high lateral range in coverage
  - LB starts 3-6 yds behind LOS in the box, moderate speed
  - REF stationary near the play, little motion
  - SIDELINE near sideline edges (startFy < 1 or > 52), little downfield motion

You will be told the LOS (line of scrimmage, in fx yards). Offense is on one side of
the LOS at snap; defense on the other. Use the play's formation + playType to break ties.

Be honest about confidence: an OL/DL blob behind the line is often ambiguous — 0.5-0.7 is fine.
WR streaking 40 yds downfield at 9 yds/s? 0.95.`;

export interface RoleInferenceResult {
  roles: Record<string, Role>;
  assigned: number;
  attempted: number;
}

/**
 * Classify tracks into football roles via Claude. Requires field-space
 * tracks (post M3 calibration). Returns trackId → role map; tracks
 * without enough data or low-confidence assignments are omitted.
 */
export async function inferTrackRoles(args: {
  tracks: PlayerTrack[];
  los?: number;
  playType?: string;
  formation?: string;
  coverage?: string;
}): Promise<RoleInferenceResult> {
  const MIN_CONFIDENCE = 0.45;

  const features = args.tracks
    .map((t) => extractFeatures(t))
    .filter((f): f is TrackFeatures => f !== null);

  if (features.length === 0) {
    return { roles: {}, assigned: 0, attempted: args.tracks.length };
  }

  const context = [
    args.los !== undefined ? `LOS: fx=${args.los.toFixed(1)} yds` : null,
    args.playType ? `Play type: ${args.playType}` : null,
    args.formation ? `Formation: ${args.formation}` : null,
    args.coverage ? `Coverage: ${args.coverage}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  let parsed: z.infer<typeof roleSchema> | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { output } = await generateText({
        model: gateway(ROLE_MODEL),
        system: ROLE_SYSTEM,
        prompt: `${context}\n\nTracks (n=${features.length}):\n${JSON.stringify(features, null, 2)}\n\nAssign a role to each track.`,
        output: Output.object({ schema: roleSchema }),
      });
      if (output) {
        parsed = output;
        break;
      }
    } catch (err) {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      console.error('role_inference_failed', {
        err: err instanceof Error ? err.message.slice(0, 200) : String(err),
      });
    }
  }

  if (!parsed) {
    return { roles: {}, assigned: 0, attempted: features.length };
  }

  const roles: Record<string, Role> = {};
  for (const a of parsed.assignments) {
    if (a.confidence < MIN_CONFIDENCE) continue;
    if (a.role === 'UNKNOWN') continue;
    roles[a.trackId] = a.role;
  }

  return {
    roles,
    assigned: Object.keys(roles).length,
    attempted: features.length,
  };
}

/**
 * Apply inferred roles to a track list. Returns new list; does not mutate.
 */
export function applyRolesToTracks(
  tracks: PlayerTrack[],
  roles: Record<string, Role>,
): PlayerTrack[] {
  return tracks.map((t) => {
    const r = roles[t.trackId];
    return r ? { ...t, role: r } : t;
  });
}
