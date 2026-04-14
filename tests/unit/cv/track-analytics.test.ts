/* biome-ignore-all lint/style/noNonNullAssertion: tests use `expect(x).not.toBeNull()`
   followed by `x!` to exercise the non-null branch deliberately. */
/**
 * Unit tests for per-play track analytics.
 *
 * Pure math; no external calls. We construct tracks with known field-space
 * trajectories and verify that peak speed, depths, durations, and
 * separations come out correct.
 */

import { describe, expect, it } from 'vitest';
import type { PlayerTrack, TrackPoint } from '@/lib/cv/player-tracker';
import { aggregateByPlayType, computePlayAnalytics, minSeparation } from '@/lib/cv/track-analytics';

// Helper: build a field-space track from a series of (t, fx, fy) tuples.
function fieldTrack(
  id: string,
  points: Array<[number, number, number]>,
  extra: Partial<PlayerTrack> = {},
): PlayerTrack {
  return {
    trackId: id,
    points: points.map(
      ([t, fx, fy]): TrackPoint => ({
        t,
        x: 0.5,
        y: 0.5,
        w: 0.1,
        h: 0.2,
        confidence: 0.9,
        fx,
        fy,
      }),
    ),
    ...extra,
  };
}

describe('computePlayAnalytics', () => {
  it('returns zero analytics for empty tracks', () => {
    const a = computePlayAnalytics([]);
    expect(a.tracks).toEqual([]);
    expect(a.peakSpeedYps).toBe(0);
    expect(a.playDurationSeconds).toBe(0);
    expect(a.fieldSpace).toBe(false);
  });

  it('computes max speed, avg speed, and total yards for a single field-space track', () => {
    // Player runs 10 yards downfield in 2 seconds (5 yds/s avg, constant).
    const track = fieldTrack('t1', [
      [0.0, 50, 26],
      [0.5, 52.5, 26],
      [1.0, 55, 26],
      [1.5, 57.5, 26],
      [2.0, 60, 26],
    ]);
    const a = computePlayAnalytics([track]);
    expect(a.fieldSpace).toBe(true);
    expect(a.tracks).toHaveLength(1);
    const s = a.tracks[0]!;
    expect(s.maxSpeedYps).toBeCloseTo(5, 2);
    expect(s.avgSpeedYps).toBeCloseTo(5, 2);
    expect(s.totalYards).toBeCloseTo(10, 2);
    expect(s.durationSeconds).toBeCloseTo(2, 2);
    expect(s.maxDepthYards).toBeCloseTo(60, 2);
    expect(s.netDownfieldYards).toBeCloseTo(10, 2);
    expect(s.lateralRangeYards).toBeCloseTo(0, 2);
  });

  it('detects the track with peak speed', () => {
    // t1 runs at 3 yds/s, t2 runs at 9 yds/s — peak should be t2's 9.
    const t1 = fieldTrack('slow', [
      [0.0, 50, 26],
      [1.0, 53, 26],
      [2.0, 56, 26],
    ]);
    const t2 = fieldTrack('fast', [
      [0.0, 50, 10],
      [0.5, 54.5, 10],
      [1.0, 59, 10],
    ]);
    const a = computePlayAnalytics([t1, t2]);
    expect(a.peakSpeedYps).toBeCloseTo(9, 1);
  });

  it('identifies the deepest track', () => {
    // WR goes 40 yards downfield; RB goes 6 yards.
    const wr = fieldTrack('wr', [
      [0.0, 50, 5],
      [2.0, 70, 5],
      [4.0, 90, 5],
    ]);
    const rb = fieldTrack('rb', [
      [0.0, 50, 26],
      [1.5, 55, 26],
      [3.0, 56, 26],
    ]);
    const a = computePlayAnalytics([wr, rb]);
    expect(a.deepestTrackId).toBe('wr');
    const deepest = a.tracks.find((t) => t.trackId === 'wr')!;
    expect(deepest.maxDepthYards).toBeCloseTo(90, 1);
  });

  it('computes play duration across all tracks', () => {
    // Player A is on-screen from 0.5-2.5s; Player B from 0.0-3.5s.
    // Play duration = maxEnd(3.5) - minStart(0.0) = 3.5s
    const a = fieldTrack('a', [
      [0.5, 50, 10],
      [1.5, 52, 10],
      [2.5, 54, 10],
    ]);
    const b = fieldTrack('b', [
      [0.0, 50, 30],
      [1.5, 54, 30],
      [3.5, 58, 30],
    ]);
    const result = computePlayAnalytics([a, b]);
    expect(result.playDurationSeconds).toBeCloseTo(3.5, 2);
  });

  it('falls back to pixel space when no field coords are set', () => {
    // Pixel-only track (no fx/fy)
    const pixelTrack: PlayerTrack = {
      trackId: 'p1',
      points: [
        { t: 0, x: 0.1, y: 0.5, w: 0.1, h: 0.1, confidence: 0.9 },
        { t: 1, x: 0.5, y: 0.5, w: 0.1, h: 0.1, confidence: 0.9 },
        { t: 2, x: 0.9, y: 0.5, w: 0.1, h: 0.1, confidence: 0.9 },
      ],
    };
    const a = computePlayAnalytics([pixelTrack]);
    expect(a.fieldSpace).toBe(false);
    // Max speed is in pixel-normalized units (0.4 per second) — not meaningful
    // but should be non-zero and deterministic.
    expect(a.tracks[0]?.maxSpeedYps).toBeGreaterThan(0);
    // No depth/downfield when not field-registered
    expect(a.tracks[0]?.maxDepthYards).toBeUndefined();
    expect(a.tracks[0]?.netDownfieldYards).toBeUndefined();
  });
});

describe('minSeparation', () => {
  it('finds the closest approach between two converging players', () => {
    // a moves right along y=20; b moves right along y=21, they stay 1yd apart.
    const a = fieldTrack('a', [
      [0, 40, 20],
      [1, 50, 20],
      [2, 60, 20],
    ]);
    const b = fieldTrack('b', [
      [0, 40, 21],
      [1, 50, 21],
      [2, 60, 21],
    ]);
    const sep = minSeparation(a, b, true);
    expect(sep).not.toBeNull();
    expect(sep?.minYards).toBeCloseTo(1, 1);
  });

  it('returns null when tracks have no overlapping time range', () => {
    const a = fieldTrack('a', [
      [0, 40, 20],
      [1, 50, 20],
    ]);
    const b = fieldTrack('b', [
      [3, 40, 20],
      [4, 50, 20],
    ]);
    expect(minSeparation(a, b, true)).toBeNull();
  });

  it('computes closing speed when players converge', () => {
    // a is stationary at (50,20); b approaches from (50, 30) → (50, 22) over 2s
    // at t=0 separation is 10, at t=2 separation is 2 (closing 4 yds/s)
    const a = fieldTrack('a', [
      [0, 50, 20],
      [1, 50, 20],
      [2, 50, 20],
    ]);
    const b = fieldTrack('b', [
      [0, 50, 30],
      [1, 50, 26],
      [2, 50, 22],
    ]);
    const sep = minSeparation(a, b, true);
    expect(sep).not.toBeNull();
    expect(sep?.minYards).toBeCloseTo(2, 1);
    expect(sep?.closingYps).toBeGreaterThan(0);
  });
});

describe('aggregateByPlayType', () => {
  it('buckets plays by type and averages their analytics', () => {
    // passPlay1 WR: 50→58→68 = max step 10 yds/s
    const passPlay1 = computePlayAnalytics([
      fieldTrack('qb', [
        [0, 50, 26],
        [2, 50, 26],
      ]),
      fieldTrack('wr', [
        [0, 50, 5],
        [1, 58, 5],
        [2, 68, 5],
      ]),
    ]);
    // passPlay2 WR: 50→56→62 = max step 6 yds/s
    const passPlay2 = computePlayAnalytics([
      fieldTrack('qb', [
        [0, 50, 26],
        [2, 50, 26],
      ]),
      fieldTrack('wr', [
        [0, 50, 5],
        [1, 56, 5],
        [2, 62, 5],
      ]),
    ]);
    // runPlay RB: 50→54→57 = max step 4 yds/s
    const runPlay = computePlayAnalytics([
      fieldTrack('rb', [
        [0, 50, 26],
        [1, 54, 26],
        [2, 57, 26],
      ]),
    ]);

    const agg = aggregateByPlayType([
      { playType: 'Pass', analytics: passPlay1 },
      { playType: 'Pass', analytics: passPlay2 },
      { playType: 'Run', analytics: runPlay },
    ]);

    expect(agg.totalTrackedPlays).toBe(3);
    expect(agg.fieldRegisteredPlays).toBe(3);
    const passBucket = agg.byPlayType.find((b) => b.playType === 'Pass')!;
    expect(passBucket.count).toBe(2);
    expect(passBucket.avgPeakSpeedYps).toBeCloseTo(8, 1); // (10+6)/2
    const runBucket = agg.byPlayType.find((b) => b.playType === 'Run')!;
    expect(runBucket.count).toBe(1);
    expect(runBucket.avgPeakSpeedYps).toBeCloseTo(4, 1);
  });

  it('handles plays with null analytics', () => {
    const validPlay = computePlayAnalytics([
      fieldTrack('wr', [
        [0, 50, 5],
        [1, 58, 5],
      ]),
    ]);
    const agg = aggregateByPlayType([
      { playType: 'Pass', analytics: validPlay },
      { playType: 'Pass', analytics: null },
      { playType: 'Run', analytics: null },
    ]);
    expect(agg.totalTrackedPlays).toBe(1);
    // null-analytics plays don't create buckets
    expect(agg.byPlayType.some((b) => b.playType === 'Run')).toBe(false);
  });

  it('treats unset playType as "Unknown"', () => {
    const play = computePlayAnalytics([
      fieldTrack('x', [
        [0, 50, 20],
        [1, 52, 20],
      ]),
    ]);
    const agg = aggregateByPlayType([
      { playType: null, analytics: play },
      { playType: undefined, analytics: play },
    ]);
    const unknown = agg.byPlayType.find((b) => b.playType === 'Unknown');
    expect(unknown).toBeDefined();
    expect(unknown?.count).toBe(2);
  });
});
