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
import {
  aggregateByPlayType,
  aggregateMatchupsByDefender,
  aggregatePersonnelTendencies,
  aggregateRouteVsCoverage,
  computePlayAnalytics,
  computeSituationalTendencies,
  minSeparation,
  type PlayAnalytics,
} from '@/lib/cv/track-analytics';

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

describe('computePlayAnalytics keyMatchups', () => {
  // Helper that accepts a role so we can exercise the matchup path.
  const roleTrack = (
    id: string,
    role: string,
    points: Array<[number, number, number]>,
    jersey?: string,
  ): PlayerTrack => ({
    trackId: id,
    role,
    jersey,
    points: points.map(([t, fx, fy]): TrackPoint => ({
      t,
      x: 0.5, y: 0.5, w: 0.1, h: 0.2, confidence: 0.9,
      fx, fy,
    })),
  });

  it('produces no matchups without role labels', () => {
    // Two field-space tracks, no roles → no matchups
    const a = fieldTrack('a', [[0, 30, 20], [2, 50, 20]]);
    const b = fieldTrack('b', [[0, 30, 22], [2, 50, 22]]);
    const result = computePlayAnalytics([a, b]);
    expect(result.fieldSpace).toBe(true);
    expect(result.keyMatchups).toBeUndefined();
  });

  it('produces no matchups without field space', () => {
    // Pixel-only tracks with roles
    const pixOnly = (id: string, role: string): PlayerTrack => ({
      trackId: id,
      role,
      points: [
        { t: 0, x: 0.3, y: 0.5, w: 0.1, h: 0.2, confidence: 0.9 },
        { t: 1, x: 0.5, y: 0.5, w: 0.1, h: 0.2, confidence: 0.9 },
      ],
    });
    const result = computePlayAnalytics([pixOnly('a', 'WR'), pixOnly('b', 'CB')]);
    expect(result.fieldSpace).toBe(false);
    expect(result.keyMatchups).toBeUndefined();
  });

  it('pairs each offense player with their closest defender', () => {
    // WR runs down the left sideline; CB trails tight.
    // S stays deep center — shouldn't be the closest.
    const wr = roleTrack('wr', 'WR', [[0, 30, 5], [1, 40, 5], [2, 50, 5]], '11');
    const cb = roleTrack('cb', 'CB', [[0, 32, 7], [1, 42, 7], [2, 52, 7]], '24');
    const s = roleTrack('s', 'S', [[0, 40, 26], [1, 42, 26], [2, 44, 26]], '9');

    const result = computePlayAnalytics([wr, cb, s]);
    expect(result.keyMatchups).toBeDefined();
    expect(result.keyMatchups?.length).toBeGreaterThan(0);
    const wrMatchup = result.keyMatchups?.find((m) => m.offense.trackId === 'wr');
    expect(wrMatchup).toBeDefined();
    expect(wrMatchup?.defense.trackId).toBe('cb'); // CB was closer than S
    expect(wrMatchup?.defense.jersey).toBe('24');
    expect(wrMatchup?.minSeparationYards).toBeCloseTo(2.83, 1); // sqrt(2^2 + 2^2) ≈ 2.83
  });

  it('ranks matchups so the deepest route comes first', () => {
    // Two offensive players, same separation — deeper route should rank first.
    const deepWR = roleTrack('deep', 'WR', [[0, 30, 5], [2, 70, 5]]);
    const deepCB = roleTrack('cb1', 'CB', [[0, 32, 7], [2, 72, 7]]);
    const shortRB = roleTrack('rb', 'RB', [[0, 30, 26], [2, 34, 26]]);
    const shortLB = roleTrack('lb', 'LB', [[0, 34, 30], [2, 38, 30]]);

    const result = computePlayAnalytics([deepWR, deepCB, shortRB, shortLB]);
    expect(result.keyMatchups).toBeDefined();
    expect(result.keyMatchups?.[0]?.offense.trackId).toBe('deep');
  });

  it('caps output at 3 matchups', () => {
    // 5 offensive players, 1 defender — will produce 5 matchups but only 3 should survive.
    const makeWR = (i: number, depth: number): PlayerTrack =>
      roleTrack(`wr${i}`, 'WR', [[0, 30, 5 + i * 8], [2, 30 + depth, 5 + i * 8]]);
    const tracks = [
      makeWR(0, 30),
      makeWR(1, 25),
      makeWR(2, 20),
      makeWR(3, 15),
      makeWR(4, 10),
      roleTrack('cb', 'CB', [[0, 32, 6], [2, 60, 6]]),
    ];
    const result = computePlayAnalytics(tracks);
    expect(result.keyMatchups?.length).toBeLessThanOrEqual(3);
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

describe('aggregateMatchupsByDefender', () => {
  const roleTrack = (
    id: string,
    role: string,
    points: Array<[number, number, number]>,
    jersey?: string,
  ): PlayerTrack => ({
    trackId: id,
    role,
    jersey,
    points: points.map(([t, fx, fy]): TrackPoint => ({
      t,
      x: 0.5, y: 0.5, w: 0.1, h: 0.2, confidence: 0.9,
      fx, fy,
    })),
  });

  it('rolls up separations across plays by defender jersey+role', () => {
    // Three plays where CB #24 covers a WR with 3yd separation every time.
    const makePlay = (suffix: string): PlayAnalytics => computePlayAnalytics([
      roleTrack(`wr-${suffix}`, 'WR', [[0, 30, 5], [1, 40, 5], [2, 50, 5]], '11'),
      roleTrack(`cb-${suffix}`, 'CB', [[0, 33, 5], [1, 43, 5], [2, 53, 5]], '24'),
    ]);

    const tendencies = aggregateMatchupsByDefender([
      { analytics: makePlay('a') },
      { analytics: makePlay('b') },
      { analytics: makePlay('c') },
    ]);

    expect(tendencies).toHaveLength(1);
    expect(tendencies[0]?.jersey).toBe('24');
    expect(tendencies[0]?.role).toBe('CB');
    expect(tendencies[0]?.matchupCount).toBe(3);
    // 3 separation in each play
    expect(tendencies[0]?.avgSeparationYards).toBeCloseTo(3, 0);
    // Three distinct trackIds (one per clip)
    expect(tendencies[0]?.trackIds).toHaveLength(3);
  });

  it('filters out defenders with only one matchup (noise)', () => {
    // Only one play → only one matchup per defender → filtered
    const oneShot = computePlayAnalytics([
      roleTrack('wr', 'WR', [[0, 30, 5], [2, 50, 5]], '11'),
      roleTrack('cb', 'CB', [[0, 33, 5], [2, 53, 5]], '24'),
    ]);
    const tendencies = aggregateMatchupsByDefender([{ analytics: oneShot }]);
    expect(tendencies).toEqual([]);
  });

  it('ranks defenders by exploitability (higher avg sep + more matchups)', () => {
    // CB #24: 5 matchups, 4yd avg sep — should rank first.
    // S #7:  2 matchups, 5yd avg sep — fewer samples, lower score.
    const makeCB24Play = (suffix: string): PlayAnalytics => computePlayAnalytics([
      roleTrack(`wr-${suffix}`, 'WR', [[0, 30, 5], [2, 50, 5]], '11'),
      roleTrack(`cb-${suffix}`, 'CB', [[0, 34, 5], [2, 54, 5]], '24'),
    ]);
    const makeS7Play = (suffix: string): PlayAnalytics => computePlayAnalytics([
      roleTrack(`wr2-${suffix}`, 'WR', [[0, 30, 26], [2, 70, 26]], '88'),
      roleTrack(`s-${suffix}`, 'S', [[0, 35, 26], [2, 75, 26]], '7'),
    ]);

    const tendencies = aggregateMatchupsByDefender([
      { analytics: makeCB24Play('1') },
      { analytics: makeCB24Play('2') },
      { analytics: makeCB24Play('3') },
      { analytics: makeCB24Play('4') },
      { analytics: makeCB24Play('5') },
      { analytics: makeS7Play('1') },
      { analytics: makeS7Play('2') },
    ]);

    expect(tendencies.length).toBeGreaterThanOrEqual(2);
    expect(tendencies[0]?.jersey).toBe('24');
    expect(tendencies[0]?.matchupCount).toBe(5);
  });

  it('ignores plays with no matchups', () => {
    const noMatchups = computePlayAnalytics([
      // No roles → no matchups
      fieldTrack('x', [[0, 30, 20], [2, 50, 20]]),
      fieldTrack('y', [[0, 30, 22], [2, 50, 22]]),
    ]);
    const tendencies = aggregateMatchupsByDefender([
      { analytics: noMatchups },
      { analytics: null },
    ]);
    expect(tendencies).toEqual([]);
  });

  it('buckets jersey-less defenders separately from jersey-known ones', () => {
    // Two plays: one with CB jersey #24, one with CB jersey unknown.
    // They should NOT merge — the coach needs to know the #24 data is clean.
    const known = computePlayAnalytics([
      roleTrack('wr1', 'WR', [[0, 30, 5], [2, 50, 5]], '11'),
      roleTrack('cb1', 'CB', [[0, 33, 5], [2, 53, 5]], '24'),
    ]);
    const known2 = computePlayAnalytics([
      roleTrack('wr1b', 'WR', [[0, 30, 5], [2, 50, 5]], '11'),
      roleTrack('cb1b', 'CB', [[0, 34, 5], [2, 54, 5]], '24'),
    ]);
    const unknown = computePlayAnalytics([
      roleTrack('wr2', 'WR', [[0, 30, 5], [2, 50, 5]], '88'),
      // no jersey
      roleTrack('cb2', 'CB', [[0, 33, 5], [2, 53, 5]]),
    ]);
    const unknown2 = computePlayAnalytics([
      roleTrack('wr2b', 'WR', [[0, 30, 5], [2, 50, 5]], '88'),
      roleTrack('cb2b', 'CB', [[0, 33, 5], [2, 53, 5]]),
    ]);

    const tendencies = aggregateMatchupsByDefender([
      { analytics: known },
      { analytics: known2 },
      { analytics: unknown },
      { analytics: unknown2 },
    ]);

    const jersey24 = tendencies.find((t) => t.jersey === '24');
    const noJersey = tendencies.find((t) => t.jersey === undefined);
    expect(jersey24).toBeDefined();
    expect(noJersey).toBeDefined();
    expect(jersey24?.matchupCount).toBe(2);
    expect(noJersey?.matchupCount).toBe(2);
  });
});

describe('computeSituationalTendencies', () => {
  it('returns empty when there are no plays with down/distance', () => {
    expect(computeSituationalTendencies([])).toEqual([]);
    expect(
      computeSituationalTendencies([
        { down: null, distance: null, playType: 'Pass' },
      ]),
    ).toEqual([]);
  });

  it('buckets by down+distance and computes run/pass rates', () => {
    // 5 plays on 3rd & long: 4 passes, 1 run
    const plays = [
      { down: 3, distance: 8, playType: 'Pass', gainLoss: 8 },
      { down: 3, distance: 9, playType: 'Pass', gainLoss: 12 },
      { down: 3, distance: 10, playType: 'Pass', gainLoss: 4 },
      { down: 3, distance: 7, playType: 'Pass', gainLoss: 15 },
      { down: 3, distance: 10, playType: 'Run', gainLoss: 3 },
    ];
    const buckets = computeSituationalTendencies(plays);
    const thirdLong = buckets.find((b) => b.situation === '3rd & long');
    expect(thirdLong).toBeDefined();
    expect(thirdLong?.count).toBe(5);
    expect(thirdLong?.passPct).toBe(80);
    expect(thirdLong?.runPct).toBe(20);
    expect(thirdLong?.avgYardsGained).toBeCloseTo(8.4, 1);
  });

  it('drops buckets with fewer than 3 plays (noise floor)', () => {
    // Two 3rd-and-long plays → filtered
    const plays = [
      { down: 3, distance: 8, playType: 'Pass' },
      { down: 3, distance: 9, playType: 'Pass' },
    ];
    expect(computeSituationalTendencies(plays)).toEqual([]);
  });

  it('identifies dominant coverage', () => {
    const plays = [
      { down: 3, distance: 8, playType: 'Pass', coverage: 'cover_3' },
      { down: 3, distance: 9, playType: 'Pass', coverage: 'cover_3' },
      { down: 3, distance: 10, playType: 'Pass', coverage: 'cover_3' },
      { down: 3, distance: 7, playType: 'Pass', coverage: 'cover_2' },
    ];
    const buckets = computeSituationalTendencies(plays);
    expect(buckets[0]?.dominantCoverage?.name).toBe('cover_3');
    expect(buckets[0]?.dominantCoverage?.pct).toBe(75);
  });

  it('computes rotation rate from pre-snap vs post-snap', () => {
    // 3 plays showing 2-high pre-snap, rotating to Cover 3 (single-high) post-snap.
    // 1 play staying true 2-high (Cover 2). Rotation rate = 75%.
    const plays = [
      { down: 3, distance: 8, playType: 'Pass', preSnapRead: 'two_high', coverage: 'cover_3' },
      { down: 3, distance: 9, playType: 'Pass', preSnapRead: 'two_high', coverage: 'cover_3' },
      { down: 3, distance: 10, playType: 'Pass', preSnapRead: 'two_high', coverage: 'cover_3' },
      { down: 3, distance: 7, playType: 'Pass', preSnapRead: 'two_high', coverage: 'cover_2' },
    ];
    const buckets = computeSituationalTendencies(plays);
    expect(buckets[0]?.rotationPct).toBe(75);
  });

  it('separates short/medium/long by distance thresholds', () => {
    const plays = [
      { down: 1, distance: 2, playType: 'Run' }, // 1st & short
      { down: 1, distance: 2, playType: 'Run' },
      { down: 1, distance: 3, playType: 'Run' },
      { down: 1, distance: 5, playType: 'Pass' }, // 1st & medium
      { down: 1, distance: 6, playType: 'Pass' },
      { down: 1, distance: 6, playType: 'Pass' },
      { down: 1, distance: 10, playType: 'Pass' }, // 1st & long
      { down: 1, distance: 9, playType: 'Pass' },
      { down: 1, distance: 10, playType: 'Pass' },
    ];
    const buckets = computeSituationalTendencies(plays);
    const labels = buckets.map((b) => b.situation).sort();
    expect(labels).toEqual(['1st & long', '1st & medium', '1st & short']);
  });

  it('ignores pre-snap reads of "unknown" when computing rotation', () => {
    // Every play has "unknown" pre-snap — rotation rate should be 0 (no samples)
    const plays = [
      { down: 3, distance: 8, playType: 'Pass', preSnapRead: 'unknown', coverage: 'cover_3' },
      { down: 3, distance: 9, playType: 'Pass', preSnapRead: 'unknown', coverage: 'cover_3' },
      { down: 3, distance: 10, playType: 'Pass', preSnapRead: 'unknown', coverage: 'cover_3' },
    ];
    const buckets = computeSituationalTendencies(plays);
    expect(buckets[0]?.rotationPct).toBe(0);
  });

  it('ranks 3rd-down buckets ahead of 1st/2nd down', () => {
    const plays = [
      { down: 1, distance: 10, playType: 'Pass' },
      { down: 1, distance: 9, playType: 'Pass' },
      { down: 1, distance: 10, playType: 'Pass' },
      { down: 3, distance: 8, playType: 'Pass' },
      { down: 3, distance: 9, playType: 'Pass' },
      { down: 3, distance: 10, playType: 'Pass' },
    ];
    const buckets = computeSituationalTendencies(plays);
    expect(buckets[0]?.situation.startsWith('3rd')).toBe(true);
  });
});

describe('aggregateRouteVsCoverage', () => {
  it('returns empty when no pass plays have both route and coverage', () => {
    expect(aggregateRouteVsCoverage([])).toEqual([]);
    expect(
      aggregateRouteVsCoverage([
        { playType: 'Run', route: 'mesh', coverage: 'cover_3', gainLoss: 5 },
      ]),
    ).toEqual([]);
  });

  it('ignores unknown / N/A routes and coverages', () => {
    const plays = [
      { playType: 'Pass', route: 'unknown', coverage: 'cover_3', gainLoss: 12 },
      { playType: 'Pass', route: 'mesh', coverage: 'unknown', gainLoss: 12 },
      { playType: 'Pass', route: 'N/A', coverage: 'cover_3', gainLoss: 10 },
      { playType: 'Pass', route: 'scramble', coverage: 'cover_3', gainLoss: 8 },
    ];
    expect(aggregateRouteVsCoverage(plays)).toEqual([]);
  });

  it('requires ≥2 samples per cell (noise floor)', () => {
    // One mesh-vs-cover-3 play → filtered
    const plays = [
      { playType: 'Pass', route: 'mesh', coverage: 'cover_3', gainLoss: 12 },
    ];
    expect(aggregateRouteVsCoverage(plays)).toEqual([]);
  });

  it('computes avg, best, and explosive rate per cell', () => {
    // mesh vs cover_3: 4 plays at 12, 8, 15, 5 → avg 10, best 15, explosive 50% (2 of 4 ≥10)
    const plays = [
      { playType: 'Pass', route: 'mesh', coverage: 'cover_3', gainLoss: 12 },
      { playType: 'Pass', route: 'mesh', coverage: 'cover_3', gainLoss: 8 },
      { playType: 'Pass', route: 'mesh', coverage: 'cover_3', gainLoss: 15 },
      { playType: 'Pass', route: 'mesh', coverage: 'cover_3', gainLoss: 5 },
    ];
    const cells = aggregateRouteVsCoverage(plays);
    expect(cells).toHaveLength(1);
    expect(cells[0]?.routeConcept).toBe('mesh');
    expect(cells[0]?.coverage).toBe('cover_3');
    expect(cells[0]?.count).toBe(4);
    expect(cells[0]?.avgYards).toBeCloseTo(10, 1);
    expect(cells[0]?.bestYards).toBe(15);
    expect(cells[0]?.explosivePct).toBe(50);
  });

  it('ranks cells by avgYards descending', () => {
    const plays = [
      // mesh vs cover_3: avg 4
      { playType: 'Pass', route: 'mesh', coverage: 'cover_3', gainLoss: 3 },
      { playType: 'Pass', route: 'mesh', coverage: 'cover_3', gainLoss: 5 },
      // four_verts vs cover_2: avg 12
      { playType: 'Pass', route: 'four_verts', coverage: 'cover_2', gainLoss: 12 },
      { playType: 'Pass', route: 'four_verts', coverage: 'cover_2', gainLoss: 12 },
    ];
    const cells = aggregateRouteVsCoverage(plays);
    expect(cells[0]?.routeConcept).toBe('four_verts');
    expect(cells[1]?.routeConcept).toBe('mesh');
  });

  it('treats Pass, Screen, Play Action, and RPO as pass plays', () => {
    const plays = [
      { playType: 'Pass', route: 'mesh', coverage: 'cover_3', gainLoss: 10 },
      { playType: 'Screen', route: 'mesh', coverage: 'cover_3', gainLoss: 10 },
      { playType: 'Play Action', route: 'mesh', coverage: 'cover_3', gainLoss: 10 },
      { playType: 'RPO', route: 'mesh', coverage: 'cover_3', gainLoss: 10 },
      // Run should not contribute
      { playType: 'Run', route: 'mesh', coverage: 'cover_3', gainLoss: 999 },
    ];
    const cells = aggregateRouteVsCoverage(plays);
    expect(cells).toHaveLength(1);
    expect(cells[0]?.count).toBe(4);
    expect(cells[0]?.avgYards).toBeCloseTo(10, 1);
  });

  it('caps output at 8 cells', () => {
    // Generate 12 distinct (route, coverage) cells, each with 2 samples
    const routes = ['mesh', 'levels', 'flood', 'stick', 'slant_flat', 'four_verts'];
    const coverages = ['cover_2', 'cover_3'];
    const plays = [];
    for (const r of routes) {
      for (const c of coverages) {
        plays.push({ playType: 'Pass', route: r, coverage: c, gainLoss: 8 });
        plays.push({ playType: 'Pass', route: r, coverage: c, gainLoss: 10 });
      }
    }
    const cells = aggregateRouteVsCoverage(plays);
    expect(cells.length).toBeLessThanOrEqual(8);
  });
});

describe('aggregatePersonnelTendencies', () => {
  it('returns empty when no plays have personnel labels', () => {
    expect(aggregatePersonnelTendencies([])).toEqual([]);
    expect(
      aggregatePersonnelTendencies([
        { personnel: null, playType: 'Pass' },
      ]),
    ).toEqual([]);
  });

  it('drops personnel groupings with fewer than 3 plays', () => {
    const plays = [
      { personnel: '12', playType: 'Run' },
      { personnel: '12', playType: 'Run' },
    ];
    expect(aggregatePersonnelTendencies(plays)).toEqual([]);
  });

  it('computes pass/run mix per personnel grouping', () => {
    // 12 personnel: 4 runs, 1 pass → 20% pass / 80% run
    const plays = [
      { personnel: '12', playType: 'Run', gainLoss: 4 },
      { personnel: '12', playType: 'Run', gainLoss: 3 },
      { personnel: '12', playType: 'Run', gainLoss: 6 },
      { personnel: '12', playType: 'Run', gainLoss: 2 },
      { personnel: '12', playType: 'Pass', gainLoss: 12 },
    ];
    const tendencies = aggregatePersonnelTendencies(plays);
    const twelve = tendencies.find((t) => t.personnel === '12');
    expect(twelve).toBeDefined();
    expect(twelve?.count).toBe(5);
    expect(twelve?.passPct).toBe(20);
    expect(twelve?.runPct).toBe(80);
    expect(twelve?.avgYardsGained).toBeCloseTo(5.4, 1);
    expect(twelve?.explosivePct).toBe(20); // 1 of 5 plays ≥10 yards
  });

  it('identifies dominant formation when it is at least 50% of snaps', () => {
    const plays = [
      { personnel: '11', formation: 'Trips Rt', playType: 'Pass' },
      { personnel: '11', formation: 'Trips Rt', playType: 'Pass' },
      { personnel: '11', formation: 'Trips Rt', playType: 'Pass' },
      { personnel: '11', formation: 'Empty', playType: 'Pass' },
    ];
    const tendencies = aggregatePersonnelTendencies(plays);
    expect(tendencies[0]?.dominantFormation?.name).toBe('Trips Rt');
    expect(tendencies[0]?.dominantFormation?.pct).toBe(75);
  });

  it('ranks groupings with stronger run/pass tilt first', () => {
    // 12 personnel: 100% run (strong tilt)
    // 11 personnel: 50/50 (no tilt, though larger sample)
    const plays = [
      { personnel: '12', playType: 'Run' },
      { personnel: '12', playType: 'Run' },
      { personnel: '12', playType: 'Run' },
      { personnel: '11', playType: 'Pass' },
      { personnel: '11', playType: 'Pass' },
      { personnel: '11', playType: 'Pass' },
      { personnel: '11', playType: 'Run' },
      { personnel: '11', playType: 'Run' },
      { personnel: '11', playType: 'Run' },
    ];
    const tendencies = aggregatePersonnelTendencies(plays);
    expect(tendencies[0]?.personnel).toBe('12');
  });

  it('caps output at 6 personnel groupings', () => {
    const plays = [];
    for (const pers of ['10', '11', '12', '13', '20', '21', '22', '23']) {
      for (let i = 0; i < 4; i++) {
        plays.push({ personnel: pers, playType: i % 2 === 0 ? 'Run' : 'Pass' });
      }
    }
    const tendencies = aggregatePersonnelTendencies(plays);
    expect(tendencies.length).toBeLessThanOrEqual(6);
  });
});
