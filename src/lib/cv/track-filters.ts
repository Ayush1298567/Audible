/**
 * Post-tracking filters that drop non-player tracks BEFORE they reach
 * the aggregators. Every surviving track is supposed to be an actual
 * football player on the field — not a ref, a sideline coach, a
 * cameraman, or a crowd member.
 *
 * Roboflow's generic `people-detection-o4rdr/1` model has no notion of
 * "on the field" vs "on the sideline" vs "ref" — it just finds humans.
 * Downstream aggregators (defender tendencies, matchups, etc.) then
 * treat every track as a player, and a sideline person who happens to
 * move a couple yards during the play becomes a "WR" in the feature
 * vector. The output is a hallucinated tendency.
 *
 * Three filters here, applied in sequence:
 *   1. `filterSidelineBandTracks` — drop tracks living in the top/bottom
 *      10% of the frame (broadcast sideline areas).
 *   2. `filterStationaryTracks` — drop tracks that never meaningfully
 *      move (refs between plays, spectators in the background).
 *   3. `filterOffFieldTracks` — once homography is applied, drop any
 *      track whose mean field position is clearly off-field.
 *
 * All three are conservative by design: a borderline player should pass
 * through, but a clear non-player should not. False rejections are less
 * harmful than false acceptances (a missing track doesn't invent a
 * tendency; an extra sideline track does).
 */

import type { PlayerTrack, TrackPoint } from './player-tracker';

// ─── Helpers ────────────────────────────────────────────────

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}

function range(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.max(...nums) - Math.min(...nums);
}

// ─── 1. Sideline-band filter (frame-space) ──────────────────

/**
 * Drop tracks whose mean vertical position is in the top/bottom 10% of
 * the frame. Broadcast cameras frame the field with sideline-band
 * elements (coaches, chain crew, refs near the sidelines, cheerleaders,
 * rendering overlays, scoreboard graphics). None of them are players.
 *
 * Uses the mean y rather than first/last because a player briefly near
 * the sideline (a fade route, a WR blocking on the sideline) shouldn't
 * get dropped — only tracks that LIVE in the sideline band.
 */
export function filterSidelineBandTracks(tracks: PlayerTrack[]): PlayerTrack[] {
  return tracks.filter((t) => {
    if (t.points.length === 0) return false;
    const meanY = avg(t.points.map((p) => p.y));
    // Conservative: tighter band (5%) would catch more noise but risks
    // rejecting fade-route WRs near the sideline. 10% is a good compromise.
    return meanY >= 0.1 && meanY <= 0.9;
  });
}

// ─── 2. Stationary-track filter ─────────────────────────────

/**
 * Drop tracks that don't meaningfully move during the clip. A player
 * engaged in a football play moves — even an OL blocking moves a few
 * yards. A track that stays within a 2%-of-frame-width box for 3+
 * seconds is almost certainly a ref standing still, a spectator, or a
 * static graphic that Roboflow mistook for a person.
 *
 * Threshold is per-second movement so that a short track of a player
 * briefly on screen doesn't get penalized for its brevity.
 */
export function filterStationaryTracks(tracks: PlayerTrack[]): PlayerTrack[] {
  return tracks.filter((t) => {
    const pts = t.points;
    if (pts.length < 2) return true; // too few points to judge; let other filters handle

    const duration = (pts[pts.length - 1]?.t ?? 0) - (pts[0]?.t ?? 0);
    if (duration <= 0) return true;

    const xRange = range(pts.map((p) => p.x));
    const yRange = range(pts.map((p) => p.y));
    const totalMovement = Math.max(xRange, yRange);

    // Per-second movement. 0.01 normalized/sec = ~0.6px/sec on a 60px
    // player — basically standing still. Below that it's a ref or static.
    const perSec = totalMovement / duration;
    return perSec >= 0.01;
  });
}

// ─── 3. Off-field filter (field-space, post-homography) ─────

/**
 * Drop tracks whose mean field position is clearly off-field. Only
 * applies to tracks that have field coords (post M3 homography); tracks
 * without fx/fy pass through untouched.
 *
 * Field bounds are the 100×53.3 yard playing surface, plus small
 * margins for homography error:
 *   - fy ∈ [-3, 56] — field is 0..53.3, we allow ±3yd slop
 *   - fx ∈ [-8, 108] — field is 0..100, we allow ±8yd slop (end zones
 *     are 10yd deep, so plays can legitimately end in the [-10, 0] or
 *     [100, 110] ranges; we're more tolerant downfield)
 *
 * A track averaging fy = 75 (i.e. 22 yards past the far sideline) is
 * not a football player. It's a coach standing across the field, or
 * a bad homography. Either way, don't let it into the aggregators.
 */
export function filterOffFieldTracks(tracks: PlayerTrack[]): PlayerTrack[] {
  return tracks.filter((t) => {
    const fieldPoints = t.points.filter(
      (p): p is TrackPoint & { fx: number; fy: number } =>
        p.fx !== undefined && p.fy !== undefined,
    );
    if (fieldPoints.length === 0) return true; // no field coords, can't judge

    const meanFx = avg(fieldPoints.map((p) => p.fx));
    const meanFy = avg(fieldPoints.map((p) => p.fy));

    if (meanFy < -3 || meanFy > 56) return false;
    if (meanFx < -8 || meanFx > 108) return false;
    return true;
  });
}

// ─── Composite pipeline filter ──────────────────────────────

export interface TrackFilterReport {
  inputCount: number;
  afterSidelineBand: number;
  afterStationary: number;
  afterOffField: number;
  /** Final surviving tracks. */
  tracks: PlayerTrack[];
}

/**
 * Run all three filters in order. Returns the filtered tracks plus a
 * count at each stage for telemetry — so in production logs we can see
 * "started with 22, dropped 3 sideline, 1 stationary, 2 off-field =
 * 16 real players." That matches HS film pretty well.
 */
export function filterNonPlayerTracks(tracks: PlayerTrack[]): TrackFilterReport {
  const inputCount = tracks.length;
  const afterSideline = filterSidelineBandTracks(tracks);
  const afterStationary = filterStationaryTracks(afterSideline);
  const afterOffField = filterOffFieldTracks(afterStationary);
  return {
    inputCount,
    afterSidelineBand: afterSideline.length,
    afterStationary: afterStationary.length,
    afterOffField: afterOffField.length,
    tracks: afterOffField,
  };
}
