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
  /**
   * Joint confidence (0-1). Combines track quality + role inference
   * confidence + jersey OCR confidence for both players. Below 0.5 the
   * matchup should NOT be cited as a player-specific tendency — only
   * aggregated as anonymous role-vs-role evidence.
   */
  confidence: number;
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

    // Joint matchup confidence — combine all the things that could go wrong:
    // either track being noisy, either role being mis-inferred, either jersey
    // being mis-read. A matchup is only as trustworthy as its weakest link.
    //
    // Convention: an UNSET field is treated as "no penalty" (defaults to 1).
    // The signal of low confidence has to be EXPLICIT — that way callers that
    // don't bother to set trackQuality (legacy paths, tests, scenarios where
    // we don't have the data) aren't punished. In production, the pipeline
    // sets all three explicitly so penalties propagate as designed.
    const offConf =
      (off.trackQuality ?? 1) *
      (off.roleConfidence ?? 1) *
      (off.jerseyConfidence ?? 1);
    const defConf =
      (best.d.trackQuality ?? 1) *
      (best.d.roleConfidence ?? 1) *
      (best.d.jerseyConfidence ?? 1);
    const matchupConfidence = Number(Math.min(offConf, defConf).toFixed(2));

    matchups.push({
      offense: { trackId: off.trackId, role: off.role ?? 'UNKNOWN', jersey: off.jersey },
      defense: { trackId: best.d.trackId, role: best.d.role ?? 'UNKNOWN', jersey: best.d.jersey },
      minSeparationYards: Number(best.sep.minYards.toFixed(1)),
      atT: Number(best.sep.atT.toFixed(2)),
      closingYps: Number(best.sep.closingYps.toFixed(1)),
      offenseMaxSpeedYps: Number((statMap.get(off.trackId)?.maxSpeedYps ?? 0).toFixed(1)),
      confidence: matchupConfidence,
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

// ─── Situational tendencies (down × distance) ──────────────

export interface SituationalBucket {
  /** Human label: "3rd & long" etc. */
  situation: string;
  /** How many plays landed in this bucket. */
  count: number;
  /** Pass percentage (0-100). */
  passPct: number;
  /** Run percentage (0-100). */
  runPct: number;
  /** Most common coverage (actual coverageShell). */
  dominantCoverage?: { name: string; pct: number };
  /** Pre-snap → post-snap coverage rotation rate (0-100). */
  rotationPct: number;
  /** Dominant pressure type, if consistent. */
  dominantPressure?: { name: string; pct: number };
  /** Average yards gained per play in this situation. */
  avgYardsGained: number;
}

interface SituationalPlay {
  down?: number | null;
  distance?: number | null;
  playType?: string | null;
  gainLoss?: number | null;
  coverage?: string;
  preSnapRead?: string;
  pressure?: string;
}

function situationLabel(down: number, distance: number): string | null {
  if (down < 1 || down > 4) return null;
  const ordinal = ['1st', '2nd', '3rd', '4th'][down - 1];
  if (distance <= 3) return `${ordinal} & short`;
  if (distance <= 6) return `${ordinal} & medium`;
  if (distance <= 10) return `${ordinal} & long`;
  return `${ordinal} & XL`;
}

/**
 * Determine whether the defense rotated from pre-snap to post-snap.
 *
 * Not every "different label" is a real rotation — e.g. pre=unknown vs
 * post=cover_3 is just "we couldn't tell pre-snap." Only count as a
 * rotation when BOTH reads are present and map to different shell
 * families.
 */
function isRotation(preSnap?: string, postSnap?: string): boolean {
  if (!preSnap || !postSnap) return false;
  if (preSnap === 'unknown' || postSnap === 'unknown') return false;
  // Normalize pre-snap "looks" to their natural post-snap equivalents
  const preFamily = preSnap === 'two_high' ? 'two_high'
    : preSnap === 'single_high' ? 'single_high'
    : preSnap === 'cover_0_look' ? 'cover_0'
    : 'other';
  // Cover 2/Quarters/Cover 4 = two_high family. Cover 1/3 = single_high.
  const postFamily = postSnap.startsWith('cover_2') || postSnap === 'quarters' || postSnap === 'cover_4'
    ? 'two_high'
    : postSnap === 'cover_1' || postSnap === 'cover_3'
    ? 'single_high'
    : postSnap === 'cover_0'
    ? 'cover_0'
    : 'other';
  if (preFamily === 'other' || postFamily === 'other') return false;
  return preFamily !== postFamily;
}

/**
 * Bucket plays by down × distance and compute run/pass rate, coverage
 * dominance, pre-snap → post-snap rotation rate, and average yardage
 * for each bucket. Only keeps buckets with ≥ 3 plays so a single weird
 * call doesn't become a "tendency."
 */
export function computeSituationalTendencies(plays: SituationalPlay[]): SituationalBucket[] {
  type Raw = {
    playTypes: string[];
    coverages: string[];
    pressures: string[];
    rotations: number; // count
    rotationsSamples: number;
    yards: number[];
  };

  const buckets = new Map<string, Raw>();

  for (const p of plays) {
    if (!p.down || !p.distance) continue;
    const label = situationLabel(p.down, p.distance);
    if (!label) continue;
    let b = buckets.get(label);
    if (!b) {
      b = { playTypes: [], coverages: [], pressures: [], rotations: 0, rotationsSamples: 0, yards: [] };
      buckets.set(label, b);
    }
    if (p.playType) b.playTypes.push(p.playType);
    if (p.coverage) b.coverages.push(p.coverage);
    if (p.pressure) b.pressures.push(p.pressure);
    if (typeof p.gainLoss === 'number') b.yards.push(p.gainLoss);
    if (p.coverage && p.preSnapRead) {
      b.rotationsSamples++;
      if (isRotation(p.preSnapRead, p.coverage)) b.rotations++;
    }
  }

  const avg = (a: number[]): number => (a.length > 0 ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const dominant = (a: string[]): { name: string; pct: number } | undefined => {
    if (a.length === 0) return undefined;
    const counts = new Map<string, number>();
    for (const v of a) counts.set(v, (counts.get(v) ?? 0) + 1);
    let best: [string, number] | null = null;
    for (const entry of counts) {
      if (!best || entry[1] > best[1]) best = entry;
    }
    if (!best) return undefined;
    return { name: best[0], pct: Math.round((best[1] / a.length) * 100) };
  };

  const result: SituationalBucket[] = [];
  for (const [situation, b] of buckets) {
    if (b.playTypes.length < 3) continue;
    const passes = b.playTypes.filter((t) => /pass|screen|play action|rpo/i.test(t)).length;
    const runs = b.playTypes.filter((t) => /run|qb run/i.test(t)).length;
    const total = b.playTypes.length;
    result.push({
      situation,
      count: total,
      passPct: Math.round((passes / total) * 100),
      runPct: Math.round((runs / total) * 100),
      dominantCoverage: dominant(b.coverages),
      rotationPct: b.rotationsSamples > 0
        ? Math.round((b.rotations / b.rotationsSamples) * 100)
        : 0,
      dominantPressure: dominant(b.pressures),
      avgYardsGained: Number(avg(b.yards).toFixed(1)),
    });
  }

  // Sort by situational importance roughly — 3rd downs matter most,
  // then 1st down (base play calls), then 2nd.
  const ord = (s: string): number => {
    if (s.startsWith('3rd')) return 0;
    if (s.startsWith('4th')) return 1;
    if (s.startsWith('1st')) return 2;
    if (s.startsWith('2nd')) return 3;
    return 4;
  };
  result.sort((a, b) => ord(a.situation) - ord(b.situation));

  return result;
}

// ─── Personnel × play type tendencies ──────────────────────

/**
 * For each offensive personnel grouping (11, 12, 21, Empty, etc.), how
 * do they call plays? If 12 personnel runs 75% of the time, a coach
 * can load the box when they see 2 TEs.
 */
export interface PersonnelTendency {
  /** Personnel label — "11", "12", "Empty", etc. */
  personnel: string;
  count: number;
  passPct: number;
  runPct: number;
  /** Most common formation out of this personnel, if clear. */
  dominantFormation?: { name: string; pct: number };
  /** Average yards gained per play. */
  avgYardsGained: number;
  /** Explosive play rate (% of plays ≥ 10 yards). */
  explosivePct: number;
}

interface PersonnelPlay {
  personnel?: string | null;
  formation?: string | null;
  playType?: string | null;
  gainLoss?: number | null;
}

/**
 * Roll up plays by offensive personnel grouping. The coach learns
 * "when they're in 12 personnel, it's 75% run" — enormously actionable
 * because personnel is visible pre-snap (count the TEs and RBs).
 *
 * Filters:
 *  - Personnel label must be present (skip plays with null personnel)
 *  - Bucket must have ≥3 samples (noise floor)
 *
 * Ranked by tilt — personnel groupings with strong run/pass bias or
 * above-average explosive rates surface first.
 */
export function aggregatePersonnelTendencies(plays: PersonnelPlay[]): PersonnelTendency[] {
  type Bucket = { playTypes: string[]; formations: string[]; yards: number[] };
  const buckets = new Map<string, Bucket>();

  for (const p of plays) {
    const personnel = p.personnel?.trim();
    if (!personnel) continue;
    let b = buckets.get(personnel);
    if (!b) {
      b = { playTypes: [], formations: [], yards: [] };
      buckets.set(personnel, b);
    }
    if (p.playType) b.playTypes.push(p.playType);
    if (p.formation) b.formations.push(p.formation);
    if (typeof p.gainLoss === 'number') b.yards.push(p.gainLoss);
  }

  const avg = (a: number[]): number => (a.length > 0 ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const dominant = (a: string[]): { name: string; pct: number } | undefined => {
    if (a.length === 0) return undefined;
    const counts = new Map<string, number>();
    for (const v of a) counts.set(v, (counts.get(v) ?? 0) + 1);
    let best: [string, number] | null = null;
    for (const entry of counts) {
      if (!best || entry[1] > best[1]) best = entry;
    }
    if (!best) return undefined;
    return { name: best[0], pct: Math.round((best[1] / a.length) * 100) };
  };

  const result: PersonnelTendency[] = [];
  for (const [personnel, b] of buckets) {
    if (b.playTypes.length < 3) continue;
    const passes = b.playTypes.filter((t) => /pass|screen|play action|rpo/i.test(t)).length;
    const runs = b.playTypes.filter((t) => /run|qb run/i.test(t)).length;
    const total = b.playTypes.length;
    const explosives = b.yards.filter((y) => y >= 10).length;
    result.push({
      personnel,
      count: total,
      passPct: Math.round((passes / total) * 100),
      runPct: Math.round((runs / total) * 100),
      dominantFormation: dominant(b.formations),
      avgYardsGained: Number(avg(b.yards).toFixed(1)),
      explosivePct: b.yards.length > 0
        ? Math.round((explosives / b.yards.length) * 100)
        : 0,
    });
  }

  // Rank by "tilt" — strong run/pass bias is a bigger coaching signal
  // than 50/50 balance. Use max(passPct, runPct) as the tilt score,
  // weighted by sample count (log so one huge bucket doesn't dominate).
  result.sort((a, b) => {
    const tiltA = Math.max(a.passPct, a.runPct) * Math.log1p(a.count);
    const tiltB = Math.max(b.passPct, b.runPct) * Math.log1p(b.count);
    return tiltB - tiltA;
  });

  return result.slice(0, 6);
}

// ─── Route concept × coverage heatmap ──────────────────────

/**
 * For each (route concept, coverage shell) pair, compute how the
 * offense has historically performed. This is the most actionable
 * number a coach sees: "Mesh vs their Cover 3 → 12 yds avg, 3/5 plays
 * 10+" is a game-planable answer.
 */
export interface RouteVsCoverageCell {
  routeConcept: string;
  coverage: string;
  count: number;
  avgYards: number;
  /** Plays that gained 10+ yards. */
  explosivePct: number;
  /** Best single result in this pair (max gain). */
  bestYards: number;
}

interface RouteCovPlay {
  playType?: string | null;
  route?: string;
  coverage?: string;
  gainLoss?: number | null;
}

const IGNORED_ROUTE_VALUES = new Set(['', 'unknown', 'n/a', 'N/A', 'scramble']);
const IGNORED_COVERAGE_VALUES = new Set(['', 'unknown']);

/**
 * Roll up pass-play outcomes by (route concept, coverage shell).
 *
 * Filters:
 *  - Must be a pass play (we pass through playType filter)
 *  - Route and coverage must both be known (not "unknown" / "N/A")
 *  - Cell must have ≥2 samples — one result is not a tendency
 *
 * Ranked by avgYards descending — most productive pairs surface first.
 * Capped at 8 cells so the prompt stays lean.
 */
export function aggregateRouteVsCoverage(plays: RouteCovPlay[]): RouteVsCoverageCell[] {
  type Bucket = { yards: number[]; best: number; explosives: number };
  const buckets = new Map<string, Bucket>();

  for (const p of plays) {
    if (!p.playType || !/pass|screen|play action|rpo/i.test(p.playType)) continue;
    const route = p.route?.trim();
    const cov = p.coverage?.trim();
    if (!route || IGNORED_ROUTE_VALUES.has(route)) continue;
    if (!cov || IGNORED_COVERAGE_VALUES.has(cov)) continue;

    const y = typeof p.gainLoss === 'number' ? p.gainLoss : 0;
    const key = `${route}__${cov}`;
    let b = buckets.get(key);
    if (!b) {
      b = { yards: [], best: -Infinity, explosives: 0 };
      buckets.set(key, b);
    }
    b.yards.push(y);
    if (y > b.best) b.best = y;
    if (y >= 10) b.explosives++;
  }

  const cells: RouteVsCoverageCell[] = [];
  for (const [key, b] of buckets) {
    if (b.yards.length < 2) continue;
    const parts = key.split('__');
    if (parts.length !== 2) continue;
    const [routeConcept, coverage] = parts;
    if (!routeConcept || !coverage) continue;
    const avg = b.yards.reduce((s, v) => s + v, 0) / b.yards.length;
    cells.push({
      routeConcept,
      coverage,
      count: b.yards.length,
      avgYards: Number(avg.toFixed(1)),
      explosivePct: Math.round((b.explosives / b.yards.length) * 100),
      bestYards: b.best === -Infinity ? 0 : b.best,
    });
  }

  // Sort by avg yards descending, then by count (tiebreak: more samples first).
  cells.sort((a, b) => {
    if (a.avgYards !== b.avgYards) return b.avgYards - a.avgYards;
    return b.count - a.count;
  });

  return cells.slice(0, 8);
}

// ─── Explosive plays extraction ────────────────────────────

export interface ExplosivePlay {
  playId: string;
  down?: number | null;
  distance?: number | null;
  quarter?: number | null;
  formation?: string | null;
  playType?: string | null;
  gainLoss: number;
  coverage?: string;
  route?: string;
  /** A one-liner describing the play in football terms. */
  blurb: string;
}

interface ExplosiveInput {
  id: string;
  down?: number | null;
  distance?: number | null;
  quarter?: number | null;
  formation?: string | null;
  playType?: string | null;
  playDirection?: string | null;
  gainLoss?: number | null;
  result?: string | null;
  coverage?: string;
  route?: string;
}

/**
 * Extract the biggest single-play gains (≥15 yards) and losses (≤-7 yards).
 * These are the outlier snaps that drive the game — coaches remember them
 * and want the "why" broken down. Each comes with a short human blurb
 * Claude can lift into a narrative ("42-yd gain on 3rd & 7, Cover 3,
 * four verts beat to the boundary").
 *
 * Capped at 6 explosives total (3 gains, 3 losses) so the prompt stays
 * lean. A game's biggest outliers are usually a handful anyway.
 */
export function extractExplosivePlays(plays: ExplosiveInput[]): ExplosivePlay[] {
  const big = plays
    .filter((p) => typeof p.gainLoss === 'number' && (p.gainLoss >= 15 || p.gainLoss <= -7))
    .map((p) => ({
      ...p,
      gainLoss: p.gainLoss as number,
    }));

  // Split into gains and losses, rank each by magnitude, take top 3 of each.
  const gains = big
    .filter((p) => p.gainLoss >= 15)
    .sort((a, b) => b.gainLoss - a.gainLoss)
    .slice(0, 3);
  const losses = big
    .filter((p) => p.gainLoss <= -7)
    .sort((a, b) => a.gainLoss - b.gainLoss)
    .slice(0, 3);

  const describe = (p: ExplosiveInput & { gainLoss: number }): string => {
    const parts: string[] = [];
    if (p.down && p.distance) parts.push(`${p.down}&${p.distance}`);
    if (p.quarter) parts.push(`Q${p.quarter}`);
    if (p.formation) parts.push(p.formation);
    if (p.playType) parts.push(p.playType);
    if (p.playDirection && p.playDirection !== 'N/A') parts.push(p.playDirection);
    if (p.route && p.route !== 'N/A' && p.route !== 'unknown') parts.push(`${p.route}`);
    if (p.coverage && p.coverage !== 'unknown') parts.push(`vs ${p.coverage}`);
    const header = parts.join(' · ');
    const outcome = p.gainLoss >= 0 ? `${p.gainLoss}-yd gain` : `${p.gainLoss}-yd loss`;
    return `${header || 'play'} → ${outcome}${p.result ? ` (${p.result})` : ''}`;
  };

  const pack = (p: ExplosiveInput & { gainLoss: number }): ExplosivePlay => ({
    playId: p.id,
    down: p.down,
    distance: p.distance,
    quarter: p.quarter,
    formation: p.formation,
    playType: p.playType,
    gainLoss: p.gainLoss,
    coverage: p.coverage,
    route: p.route,
    blurb: describe(p),
  });

  return [...gains.map(pack), ...losses.map(pack)];
}

// ─── Quarter tendencies ────────────────────────────────────

export interface QuarterTendency {
  quarter: number;
  count: number;
  passPct: number;
  runPct: number;
  avgYardsGained: number;
  explosivePct: number;
  /** Dominant play type if one concept accounts for ≥50% of snaps. */
  dominantPlayType?: { name: string; pct: number };
}

interface QuarterPlay {
  quarter?: number | null;
  playType?: string | null;
  gainLoss?: number | null;
}

/**
 * What changes in their play-calling by quarter? "In the 4th they pass
 * 85%" is a late-game tell the coach plans for (more blitz, cover 1 press).
 *
 * Filters:
 *  - Quarter must be 1-4 (we skip overtime in the rollup — usually small n)
 *  - ≥3 plays per bucket
 */
export function aggregateQuarterTendencies(plays: QuarterPlay[]): QuarterTendency[] {
  type Bucket = { playTypes: string[]; yards: number[] };
  const buckets = new Map<number, Bucket>();

  for (const p of plays) {
    if (!p.quarter || p.quarter < 1 || p.quarter > 4) continue;
    let b = buckets.get(p.quarter);
    if (!b) {
      b = { playTypes: [], yards: [] };
      buckets.set(p.quarter, b);
    }
    if (p.playType) b.playTypes.push(p.playType);
    if (typeof p.gainLoss === 'number') b.yards.push(p.gainLoss);
  }

  const avg = (a: number[]): number => (a.length > 0 ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const dominant = (a: string[]): { name: string; pct: number } | undefined => {
    if (a.length === 0) return undefined;
    const counts = new Map<string, number>();
    for (const v of a) counts.set(v, (counts.get(v) ?? 0) + 1);
    let best: [string, number] | null = null;
    for (const entry of counts) {
      if (!best || entry[1] > best[1]) best = entry;
    }
    if (!best) return undefined;
    const pct = Math.round((best[1] / a.length) * 100);
    return pct >= 50 ? { name: best[0], pct } : undefined;
  };

  const result: QuarterTendency[] = [];
  for (const [quarter, b] of buckets) {
    if (b.playTypes.length < 3) continue;
    const passes = b.playTypes.filter((t) => /pass|screen|play action|rpo/i.test(t)).length;
    const runs = b.playTypes.filter((t) => /run|qb run/i.test(t)).length;
    const total = b.playTypes.length;
    const explosives = b.yards.filter((y) => y >= 10).length;
    result.push({
      quarter,
      count: total,
      passPct: Math.round((passes / total) * 100),
      runPct: Math.round((runs / total) * 100),
      avgYardsGained: Number(avg(b.yards).toFixed(1)),
      explosivePct: b.yards.length > 0
        ? Math.round((explosives / b.yards.length) * 100)
        : 0,
      dominantPlayType: dominant(b.playTypes),
    });
  }

  // Keep natural quarter order — 1st through 4th.
  result.sort((a, b) => a.quarter - b.quarter);
  return result;
}

// ─── Motion tendencies ──────────────────────────────────────

export interface MotionTendency {
  /** Motion label — "jet right", "WR across", etc. */
  motion: string;
  count: number;
  passPct: number;
  runPct: number;
  avgYardsGained: number;
  explosivePct: number;
  /** Dominant play direction following this motion (Left/Right/Middle). */
  dominantDirection?: { name: string; pct: number };
}

interface MotionPlay {
  motion?: string | null;
  playType?: string | null;
  playDirection?: string | null;
  gainLoss?: number | null;
}

/**
 * Motion is an enormous pre-snap tell. "When they motion jet right,
 * they run jet sweep right 60% of the time" is a game-plannable tendency.
 *
 * Uses a VERY permissive definition of "motion" — any motion label that
 * isn't "None"/"none"/empty gets its own bucket. In a real season this
 * would grow unwieldy (each play's motion phrased slightly differently);
 * here we lean on the AI analyzer to produce consistent labels.
 *
 * Filters:
 *  - Motion label present and not "None" (case-insensitive)
 *  - ≥2 samples per bucket (noise floor is tight here because motion
 *    labels are high-variance; 3 would filter most real tendencies)
 *
 * Ranked by tilt (max pass/run %) × log1p(count). Capped at 6.
 */
export function aggregateMotionTendencies(plays: MotionPlay[]): MotionTendency[] {
  type Bucket = { playTypes: string[]; directions: string[]; yards: number[] };
  const buckets = new Map<string, Bucket>();

  for (const p of plays) {
    const motion = p.motion?.trim();
    if (!motion) continue;
    if (/^none$/i.test(motion)) continue;
    let b = buckets.get(motion);
    if (!b) {
      b = { playTypes: [], directions: [], yards: [] };
      buckets.set(motion, b);
    }
    if (p.playType) b.playTypes.push(p.playType);
    if (p.playDirection) b.directions.push(p.playDirection);
    if (typeof p.gainLoss === 'number') b.yards.push(p.gainLoss);
  }

  const avg = (a: number[]): number => (a.length > 0 ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const dominant = (a: string[]): { name: string; pct: number } | undefined => {
    if (a.length === 0) return undefined;
    const counts = new Map<string, number>();
    for (const v of a) counts.set(v, (counts.get(v) ?? 0) + 1);
    let best: [string, number] | null = null;
    for (const entry of counts) {
      if (!best || entry[1] > best[1]) best = entry;
    }
    if (!best) return undefined;
    return { name: best[0], pct: Math.round((best[1] / a.length) * 100) };
  };

  const result: MotionTendency[] = [];
  for (const [motion, b] of buckets) {
    if (b.playTypes.length < 2) continue;
    const passes = b.playTypes.filter((t) => /pass|screen|play action|rpo/i.test(t)).length;
    const runs = b.playTypes.filter((t) => /run|qb run/i.test(t)).length;
    const total = b.playTypes.length;
    const explosives = b.yards.filter((y) => y >= 10).length;
    result.push({
      motion,
      count: total,
      passPct: Math.round((passes / total) * 100),
      runPct: Math.round((runs / total) * 100),
      avgYardsGained: Number(avg(b.yards).toFixed(1)),
      explosivePct: b.yards.length > 0
        ? Math.round((explosives / b.yards.length) * 100)
        : 0,
      dominantDirection: dominant(b.directions),
    });
  }

  result.sort((a, b) => {
    const tiltA = Math.max(a.passPct, a.runPct) * Math.log1p(a.count);
    const tiltB = Math.max(b.passPct, b.runPct) * Math.log1p(b.count);
    return tiltB - tiltA;
  });

  return result.slice(0, 6);
}

// ─── Opponent-level matchup aggregation ─────────────────────

/**
 * Defender-level tendency: across N plays this defender appeared in the
 * matchups, how much separation did they give up on average?
 *
 * This is the coaching money shot: "their CB #24 gives up 3.2 yds of
 * separation on deep routes across 7 snaps — Cover 3 is toast to the
 * boundary."
 */
export interface DefenderTendency {
  jersey?: string;
  role: string;
  /** Number of matchups this defender appeared in. */
  matchupCount: number;
  /** Average min separation (yards). Lower = worse for the defender. */
  avgSeparationYards: number;
  /** Worst single separation given up (max of mins). */
  worstSeparationYards: number;
  /** Average closing speed (yards/second). Low closing = late to the ball. */
  avgClosingYps: number;
  /** Average max speed of the offense players they matched against. */
  avgOffenseSpeedYps: number;
  /** Track IDs for every play this defender showed up in (for evidence clips). */
  trackIds: string[];
  /**
   * Mean per-matchup joint confidence. Combined with sample size, this is
   * the "should the coach actually believe this number" score.
   */
  meanConfidence: number;
  /**
   * Coarse trust tier derived from confidence × sample size:
   *   high   — ≥4 matchups AND mean conf ≥0.7  → cite this player by name
   *   medium — ≥3 matchups AND mean conf ≥0.5  → mention as a pattern
   *   low    — anything else                   → don't cite as a tendency
   */
  trust: 'high' | 'medium' | 'low';
}

/**
 * Offensive-side symmetric rollup — who's making things happen on offense.
 * "Their WR #88 averages 11 yds of depth over 7 snaps with an avg peak of
 * 8.1 yds/s" tells the coach which receivers are the threats.
 */
export interface OffensiveTendency {
  jersey?: string;
  role: string;
  /** Number of matchups this player was an offensive side in. */
  matchupCount: number;
  /** Average peak speed they hit across plays. */
  avgMaxSpeedYps: number;
  /** Best separation they created (biggest win vs a defender). */
  bestSeparationYards: number;
  /** Average separation they got. */
  avgSeparationYards: number;
  /** Track IDs (one per play). */
  trackIds: string[];
  /** Mean joint confidence across the contributing matchups (0-1). */
  meanConfidence: number;
  /** Trust tier: high (cite by name) / medium (mention) / low (don't cite). */
  trust: 'high' | 'medium' | 'low';
}

export function aggregateMatchupsByOffense(
  plays: Array<{ analytics: PlayAnalytics | null }>,
): OffensiveTendency[] {
  type Bucket = {
    jersey?: string;
    role: string;
    speeds: number[];
    seps: number[];
    trackIds: string[];
    confidences: number[];
  };

  const buckets = new Map<string, Bucket>();

  for (const p of plays) {
    if (!p.analytics?.keyMatchups) continue;
    for (const m of p.analytics.keyMatchups) {
      // Same threshold + bucketing rules as the defender side — see
      // aggregateMatchupsByDefender for the rationale.
      if (m.confidence < 0.4) continue;
      const useJersey = m.offense.jersey !== undefined;
      const key = useJersey
        ? `${m.offense.role}#${m.offense.jersey}`
        : `${m.offense.role}#anon`;

      let b = buckets.get(key);
      if (!b) {
        b = {
          jersey: m.offense.jersey,
          role: m.offense.role,
          speeds: [],
          seps: [],
          trackIds: [],
          confidences: [],
        };
        buckets.set(key, b);
      }
      b.speeds.push(m.offenseMaxSpeedYps);
      b.seps.push(m.minSeparationYards);
      b.trackIds.push(m.offense.trackId);
      b.confidences.push(m.confidence);
    }
  }

  const avg = (arr: number[]): number =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const tendencies: OffensiveTendency[] = [];
  for (const b of buckets.values()) {
    if (b.speeds.length < 2) continue;
    const meanConf = avg(b.confidences);
    let trust: 'high' | 'medium' | 'low';
    if (b.speeds.length >= 4 && meanConf >= 0.7) trust = 'high';
    else if (b.speeds.length >= 3 && meanConf >= 0.5) trust = 'medium';
    else trust = 'low';

    tendencies.push({
      jersey: b.jersey,
      role: b.role,
      matchupCount: b.speeds.length,
      avgMaxSpeedYps: Number(avg(b.speeds).toFixed(1)),
      // "Best" on offense = max separation (they beat coverage worst).
      bestSeparationYards: Number(Math.max(...b.seps).toFixed(1)),
      avgSeparationYards: Number(avg(b.seps).toFixed(1)),
      trackIds: b.trackIds,
      meanConfidence: Number(meanConf.toFixed(2)),
      trust,
    });
  }

  // Rank by avgSeparation × log1p(matchupCount) × trust weight — same as the
  // defender side. High-trust signals always come first.
  const trustWeight = (t: 'high' | 'medium' | 'low'): number =>
    t === 'high' ? 1 : t === 'medium' ? 0.6 : 0.2;
  tendencies.sort((a, b) => {
    const scoreA = a.avgSeparationYards * Math.log1p(a.matchupCount) * trustWeight(a.trust);
    const scoreB = b.avgSeparationYards * Math.log1p(b.matchupCount) * trustWeight(b.trust);
    return scoreB - scoreA;
  });

  return tendencies.slice(0, 6);
}

/**
 * Across every matchup extracted from the opponent's plays, roll up by
 * defender identity (jersey + role is the key, since trackId is per-clip).
 * Defenders without jerseys fall into a single bucket per role.
 */
export function aggregateMatchupsByDefender(
  plays: Array<{ analytics: PlayAnalytics | null }>,
): DefenderTendency[] {
  type Bucket = {
    jersey?: string;
    role: string;
    seps: number[];
    closings: number[];
    offSpeeds: number[];
    trackIds: string[];
    confidences: number[];
  };

  const buckets = new Map<string, Bucket>();

  for (const p of plays) {
    if (!p.analytics?.keyMatchups) continue;
    for (const m of p.analytics.keyMatchups) {
      // Drop low-confidence matchups before they can pollute the rollup.
      // A 0.3-confidence matchup means one of the four signals (track quality,
      // role, jersey ×2) is shaky enough that this is more "anonymous noise"
      // than "CB #24 gave up X yards." We keep only matchups we trust.
      if (m.confidence < 0.4) continue;

      // For NAMED tendencies (the "CB #24" bucket vs the "CB unknown" bucket),
      // jersey OCR confidence has to be high — otherwise mis-reads from
      // multiple plays land in the same bogus bucket.
      const useJersey = m.defense.jersey !== undefined;
      const key = useJersey
        ? `${m.defense.role}#${m.defense.jersey}`
        : `${m.defense.role}#anon`;

      let b = buckets.get(key);
      if (!b) {
        b = {
          jersey: m.defense.jersey,
          role: m.defense.role,
          seps: [],
          closings: [],
          offSpeeds: [],
          trackIds: [],
          confidences: [],
        };
        buckets.set(key, b);
      }
      b.seps.push(m.minSeparationYards);
      b.closings.push(m.closingYps);
      b.offSpeeds.push(m.offenseMaxSpeedYps);
      b.trackIds.push(m.defense.trackId);
      b.confidences.push(m.confidence);
    }
  }

  const avg = (arr: number[]): number =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;

  const tendencies: DefenderTendency[] = [];
  for (const b of buckets.values()) {
    if (b.seps.length < 2) continue;
    const meanConf = avg(b.confidences);

    // Trust tier — drives whether the prompt cites this player by name or
    // not, and whether the UI calls it a "tendency" or a "weak signal".
    let trust: 'high' | 'medium' | 'low';
    if (b.seps.length >= 4 && meanConf >= 0.7) trust = 'high';
    else if (b.seps.length >= 3 && meanConf >= 0.5) trust = 'medium';
    else trust = 'low';

    tendencies.push({
      jersey: b.jersey,
      role: b.role,
      matchupCount: b.seps.length,
      avgSeparationYards: Number(avg(b.seps).toFixed(1)),
      worstSeparationYards: Number(Math.max(...b.seps).toFixed(1)),
      avgClosingYps: Number(avg(b.closings).toFixed(1)),
      avgOffenseSpeedYps: Number(avg(b.offSpeeds).toFixed(1)),
      trackIds: b.trackIds,
      meanConfidence: Number(meanConf.toFixed(2)),
      trust,
    });
  }

  // Sort by exploitability × trust — high-trust signals come first.
  // A "low" trust defender with avg sep 5yd over 2 matchups should NOT
  // outrank a "high" trust defender with avg sep 3yd over 6 matchups.
  const trustWeight = (t: 'high' | 'medium' | 'low'): number =>
    t === 'high' ? 1 : t === 'medium' ? 0.6 : 0.2;
  tendencies.sort((a, b) => {
    const scoreA = a.avgSeparationYards * Math.log1p(a.matchupCount) * trustWeight(a.trust);
    const scoreB = b.avgSeparationYards * Math.log1p(b.matchupCount) * trustWeight(b.trust);
    return scoreB - scoreA;
  });

  return tendencies.slice(0, 8);
}
