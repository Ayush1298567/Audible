/* biome-ignore-all lint/style/noNonNullAssertion: bounds-checked indexing
   over track point arrays — non-null assertions are correct in these inner
   loops, and `?? 0` defaults would silently mask tracking bugs. */
/**
 * Per-play analytics computed from field-space tracks.
 *
 * Once tracks are in yards (via M3 homography), we can compute real
 * football-meaningful quantities:
 *   - Per-player: top speed, avg speed, total distance, max downfield depth
 *   - Pairwise: minimum separation between two players, closing speed
 *   - Play-level: which players went deepest, who had the highest top speed,
 *     how long the play developed
 *
 * These numbers then feed the scouting-walkthrough prompt so Claude can
 * cite real measurements ("FS widens at 2.1 yds/s on avg in Cover 2")
 * instead of just pattern-matching on frames.
 */

import type { PlayerTrack, TrackPoint } from './player-tracker';

// ─── Types ──────────────────────────────────────────────────

export interface TrackAnalytics {
  trackId: string;
  jersey?: string;
  role?: string;

  /** Peak speed across the track, yards per second. */
  maxSpeedYps: number;
  /** Mean speed across the track, yards per second. */
  avgSpeedYps: number;
  /** Total yards traveled (sum of point-to-point distances). */
  totalYards: number;

  /** Maximum yards downfield (fx). Undefined if field-space unavailable. */
  maxDepthYards?: number;
  /** Yards downfield gained from first → last point. */
  netDownfieldYards?: number;
  /** Lateral yards traveled (max fy - min fy). */
  lateralRangeYards?: number;

  /** How long (seconds) the track is visible. */
  durationSeconds: number;
}

export interface PairwiseSeparation {
  /** Track IDs being compared. */
  a: string;
  b: string;
  /** Minimum separation in yards across the time both were visible. */
  minYards: number;
  /** Timestamp at which minimum separation occurred. */
  atT: number;
  /** Closing speed (yards/second) into that minimum. */
  closingYps: number;
}

/**
 * A skill player vs nearest defender — the matchup that actually decides
 * most snaps. Feeds the coaching narrative ("their #2 CB gives up 3 yds
 * of separation on slants").
 */
export interface KeyMatchup {
  /** Offensive skill player — WR/TE/RB (role-labeled track). */
  offense: { trackId: string; role: string; jersey?: string };
  /** Closest defender to them during the play — CB/S/LB. */
  defense: { trackId: string; role: string; jersey?: string };
  /** Minimum separation in yards. */
  minSeparationYards: number;
  /** Timestamp (seconds from clip start) at which min separation occurred. */
  atT: number;
  /** Closing speed (yards/second) into that minimum. */
  closingYps: number;
  /** Max speed the offense player hit during the play. */
  offenseMaxSpeedYps: number;
}

export interface PlayAnalytics {
  /** Per-track analytics. */
  tracks: TrackAnalytics[];
  /** Peak speed across all tracks in this play. */
  peakSpeedYps: number;
  /** The track with the deepest downfield excursion. */
  deepestTrackId?: string;
  /** Play duration (max trackEnd - minTrackStart). */
  playDurationSeconds: number;
  /** Whether field-space analytics are available (i.e., M3 calibration succeeded). */
  fieldSpace: boolean;
  /**
   * Up to 3 notable offense-vs-defense matchups ranked by importance
   * (depth + separation). Only computed when field-space + role-labeled.
   */
  keyMatchups?: KeyMatchup[];
}

// ─── Per-track math ─────────────────────────────────────────

function dist(a: TrackPoint, b: TrackPoint, fieldSpace: boolean): number {
  if (
    fieldSpace &&
    a.fx !== undefined &&
    a.fy !== undefined &&
    b.fx !== undefined &&
    b.fy !== undefined
  ) {
    const dx = b.fx - a.fx;
    const dy = b.fy - a.fy;
    return Math.sqrt(dx * dx + dy * dy);
  }
  // Pixel-space fallback — meaningless magnitude but preserves ordering
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function computeTrackAnalytics(trk: PlayerTrack, fieldSpace: boolean): TrackAnalytics {
  const pts = trk.points;
  if (pts.length < 2) {
    return {
      trackId: trk.trackId,
      jersey: trk.jersey,
      role: trk.role,
      maxSpeedYps: 0,
      avgSpeedYps: 0,
      totalYards: 0,
      durationSeconds: 0,
    };
  }

  let maxSpeed = 0;
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const dt = b.t - a.t;
    if (dt <= 0) continue;
    const d = dist(a, b, fieldSpace);
    total += d;
    const speed = d / dt;
    if (speed > maxSpeed) maxSpeed = speed;
  }

  const duration = pts[pts.length - 1]!.t - pts[0]!.t;
  const avgSpeed = duration > 0 ? total / duration : 0;

  const base: TrackAnalytics = {
    trackId: trk.trackId,
    jersey: trk.jersey,
    role: trk.role,
    maxSpeedYps: maxSpeed,
    avgSpeedYps: avgSpeed,
    totalYards: total,
    durationSeconds: duration,
  };

  if (fieldSpace) {
    let minFx = Infinity;
    let maxFx = -Infinity;
    let minFy = Infinity;
    let maxFy = -Infinity;
    for (const p of pts) {
      if (p.fx === undefined || p.fy === undefined) continue;
      if (p.fx < minFx) minFx = p.fx;
      if (p.fx > maxFx) maxFx = p.fx;
      if (p.fy < minFy) minFy = p.fy;
      if (p.fy > maxFy) maxFy = p.fy;
    }
    if (Number.isFinite(minFx)) {
      base.maxDepthYards = maxFx;
      const first = pts.find((p) => p.fx !== undefined);
      const last = [...pts].reverse().find((p) => p.fx !== undefined);
      if (first && last && first.fx !== undefined && last.fx !== undefined) {
        base.netDownfieldYards = last.fx - first.fx;
      }
      base.lateralRangeYards = maxFy - minFy;
    }
  }

  return base;
}

// ─── Pairwise separation ────────────────────────────────────

/**
 * Minimum separation between two tracks across the time both were
 * visible. Used for "receiver vs nearest defender at the catch point"
 * style analytics.
 */
export function minSeparation(
  a: PlayerTrack,
  b: PlayerTrack,
  fieldSpace: boolean,
): PairwiseSeparation | null {
  // Find overlapping time range
  const aStart = a.points[0]?.t ?? 0;
  const aEnd = a.points[a.points.length - 1]?.t ?? 0;
  const bStart = b.points[0]?.t ?? 0;
  const bEnd = b.points[b.points.length - 1]?.t ?? 0;
  const tStart = Math.max(aStart, bStart);
  const tEnd = Math.min(aEnd, bEnd);
  if (tEnd <= tStart) return null;

  // Sample at 10Hz across overlap. Using index-based iteration instead of
  // accumulating floats, which can drift and miss the final sample point.
  const step = 0.1;
  const nSteps = Math.max(1, Math.floor((tEnd - tStart) / step));
  let minD = Infinity;
  let minT = tStart;

  for (let i = 0; i <= nSteps; i++) {
    // Final iteration lands exactly on tEnd to avoid endpoint drift.
    const t = i === nSteps ? tEnd : tStart + i * step;
    const pa = interpolateAtT(a.points, t);
    const pb = interpolateAtT(b.points, t);
    if (!pa || !pb) continue;
    const d =
      fieldSpace && pa.fx !== undefined && pb.fx !== undefined
        ? Math.sqrt((pa.fx - pb.fx) ** 2 + (pa.fy! - pb.fy!) ** 2)
        : Math.sqrt((pa.x - pb.x) ** 2 + (pa.y - pb.y) ** 2);
    if (d < minD) {
      minD = d;
      minT = t;
    }
  }

  if (!Number.isFinite(minD)) return null;

  // Closing speed: compare separation at minT vs 0.5s earlier
  const earlier = Math.max(tStart, minT - 0.5);
  const paE = interpolateAtT(a.points, earlier);
  const pbE = interpolateAtT(b.points, earlier);
  let closing = 0;
  if (paE && pbE) {
    const dE =
      fieldSpace && paE.fx !== undefined && pbE.fx !== undefined
        ? Math.sqrt((paE.fx - pbE.fx) ** 2 + (paE.fy! - pbE.fy!) ** 2)
        : Math.sqrt((paE.x - pbE.x) ** 2 + (paE.y - pbE.y) ** 2);
    const dt = minT - earlier;
    if (dt > 0) closing = Math.max(0, (dE - minD) / dt);
  }

  return {
    a: a.trackId,
    b: b.trackId,
    minYards: minD,
    atT: minT,
    closingYps: closing,
  };
}

function interpolateAtT(points: TrackPoint[], t: number): TrackPoint | null {
  if (points.length === 0) return null;
  if (t <= points[0]!.t) return points[0]!;
  if (t >= points[points.length - 1]!.t) return points[points.length - 1]!;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    if (t >= a.t && t <= b.t) {
      const alpha = (t - a.t) / (b.t - a.t);
      return {
        t,
        x: a.x + (b.x - a.x) * alpha,
        y: a.y + (b.y - a.y) * alpha,
        w: a.w,
        h: a.h,
        confidence: a.confidence,
        fx: a.fx !== undefined && b.fx !== undefined ? a.fx + (b.fx - a.fx) * alpha : undefined,
        fy: a.fy !== undefined && b.fy !== undefined ? a.fy + (b.fy - a.fy) * alpha : undefined,
      };
    }
  }
  return null;
}

// ─── Top-level entry point ──────────────────────────────────

export function computePlayAnalytics(tracks: PlayerTrack[]): PlayAnalytics {
  // Field space if ANY point has fx/fy set
  const fieldSpace = tracks.some((t) => t.points.some((p) => p.fx !== undefined));

  const trackStats = tracks.map((t) => computeTrackAnalytics(t, fieldSpace));

  let peak = 0;
  let deepest: { id: string; depth: number } | null = null;
  let minStart = Infinity;
  let maxEnd = -Infinity;

  for (const t of trackStats) {
    if (t.maxSpeedYps > peak) peak = t.maxSpeedYps;
    if (t.maxDepthYards !== undefined) {
      if (!deepest || t.maxDepthYards > deepest.depth) {
        deepest = { id: t.trackId, depth: t.maxDepthYards };
      }
    }
  }
  for (const trk of tracks) {
    if (trk.points.length === 0) continue;
    const s = trk.points[0]!.t;
    const e = trk.points[trk.points.length - 1]!.t;
    if (s < minStart) minStart = s;
    if (e > maxEnd) maxEnd = e;
  }
  const playDuration = Number.isFinite(minStart) && Number.isFinite(maxEnd) ? maxEnd - minStart : 0;

  // Compute key matchups only when we have role labels + field space.
  // Rank by importance: depth × separation (deeper routes with less separation
  // = bigger tendency signal).
  const keyMatchups = fieldSpace ? computeKeyMatchups(tracks, trackStats) : undefined;

  return {
    tracks: trackStats,
    peakSpeedYps: peak,
    deepestTrackId: deepest?.id,
    playDurationSeconds: playDuration,
    fieldSpace,
    keyMatchups,
  };
}

const OFFENSE_SKILL_ROLES = new Set(['WR', 'TE', 'RB', 'QB']);
const DEFENSE_ROLES = new Set(['CB', 'S', 'LB', 'DL']);

function computeKeyMatchups(
  tracks: PlayerTrack[],
  trackStats: TrackAnalytics[],
): KeyMatchup[] | undefined {
  const offense = tracks.filter((t) => t.role && OFFENSE_SKILL_ROLES.has(t.role));
  const defense = tracks.filter((t) => t.role && DEFENSE_ROLES.has(t.role));

  if (offense.length === 0 || defense.length === 0) return undefined;

  const matchups: KeyMatchup[] = [];
  const statMap = new Map(trackStats.map((s) => [s.trackId, s]));

  for (const off of offense) {
    // Find the defender who got closest to this offensive player.
    let best: { d: PlayerTrack; sep: ReturnType<typeof minSeparation> } | null = null;
    for (const def of defense) {
      const sep = minSeparation(off, def, true);
      if (!sep) continue;
      if (!best || sep.minYards < best.sep!.minYards) {
        best = { d: def, sep };
      }
    }
    if (!best?.sep) continue;

    matchups.push({
      offense: { trackId: off.trackId, role: off.role ?? 'UNKNOWN', jersey: off.jersey },
      defense: { trackId: best.d.trackId, role: best.d.role ?? 'UNKNOWN', jersey: best.d.jersey },
      minSeparationYards: Number(best.sep.minYards.toFixed(1)),
      atT: Number(best.sep.atT.toFixed(2)),
      closingYps: Number(best.sep.closingYps.toFixed(1)),
      offenseMaxSpeedYps: Number((statMap.get(off.trackId)?.maxSpeedYps ?? 0).toFixed(1)),
    });
  }

  // Rank by "importance": deeper routes with less separation are bigger signals.
  // Score = offenseMaxDepthYards / (1 + minSeparationYards). Higher = more notable.
  matchups.sort((a, b) => {
    const depthA = statMap.get(a.offense.trackId)?.maxDepthYards ?? 0;
    const depthB = statMap.get(b.offense.trackId)?.maxDepthYards ?? 0;
    const scoreA = depthA / (1 + a.minSeparationYards);
    const scoreB = depthB / (1 + b.minSeparationYards);
    return scoreB - scoreA;
  });

  return matchups.slice(0, 3);
}

// ─── Aggregation across plays (for walkthrough prompt) ──────

export interface OpponentAnalytics {
  /** Plays analyzed with field-space tracking. */
  fieldRegisteredPlays: number;
  /** Plays with any tracking data. */
  totalTrackedPlays: number;
  /** Average peak speed across all field-registered plays (yds/s). */
  avgPeakSpeedYps: number;
  /** Average play duration (seconds). */
  avgPlayDurationSeconds: number;
  /** Average max downfield depth across plays where it was computable. */
  avgMaxDepthYards: number;
  /** Breakdown by play type (e.g., Pass, Run, Screen). */
  byPlayType: Array<{
    playType: string;
    count: number;
    avgPeakSpeedYps: number;
    avgMaxDepthYards?: number;
    avgDurationSeconds: number;
  }>;
}

/**
 * Roll per-play analytics into opponent-level summaries for the
 * walkthrough prompt. Called from the scouting-walkthrough route.
 */
export function aggregateByPlayType(
  plays: Array<{ playType?: string | null; analytics: PlayAnalytics | null }>,
): OpponentAnalytics {
  let fieldPlays = 0;
  let totalTracked = 0;
  let peakSum = 0;
  let peakN = 0;
  let durSum = 0;
  let durN = 0;
  let depthSum = 0;
  let depthN = 0;

  const byType = new Map<
    string,
    { count: number; peak: number[]; depth: number[]; dur: number[] }
  >();

  for (const p of plays) {
    if (!p.analytics) continue;
    totalTracked++;
    if (p.analytics.fieldSpace) fieldPlays++;
    if (p.analytics.peakSpeedYps > 0) {
      peakSum += p.analytics.peakSpeedYps;
      peakN++;
    }
    if (p.analytics.playDurationSeconds > 0) {
      durSum += p.analytics.playDurationSeconds;
      durN++;
    }
    const deepest = p.analytics.tracks.find((t) => t.trackId === p.analytics?.deepestTrackId);
    if (deepest?.maxDepthYards !== undefined) {
      depthSum += deepest.maxDepthYards;
      depthN++;
    }

    const type = p.playType ?? 'Unknown';
    if (!byType.has(type)) byType.set(type, { count: 0, peak: [], depth: [], dur: [] });
    const bucket = byType.get(type)!;
    bucket.count++;
    if (p.analytics.peakSpeedYps > 0) bucket.peak.push(p.analytics.peakSpeedYps);
    if (p.analytics.playDurationSeconds > 0) bucket.dur.push(p.analytics.playDurationSeconds);
    if (deepest?.maxDepthYards !== undefined) bucket.depth.push(deepest.maxDepthYards);
  }

  const avg = (arr: number[]): number =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  return {
    fieldRegisteredPlays: fieldPlays,
    totalTrackedPlays: totalTracked,
    avgPeakSpeedYps: peakN > 0 ? peakSum / peakN : 0,
    avgPlayDurationSeconds: durN > 0 ? durSum / durN : 0,
    avgMaxDepthYards: depthN > 0 ? depthSum / depthN : 0,
    byPlayType: [...byType.entries()].map(([playType, b]) => ({
      playType,
      count: b.count,
      avgPeakSpeedYps: avg(b.peak),
      avgMaxDepthYards: b.depth.length > 0 ? avg(b.depth) : undefined,
      avgDurationSeconds: avg(b.dur),
    })),
  };
}
