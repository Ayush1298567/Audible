/**
 * Unit tests for track filters — the layer that drops non-player
 * detections before they reach jersey OCR / role inference / the
 * aggregators.
 */

import { describe, expect, it } from 'vitest';
import type { PlayerTrack, TrackPoint } from '@/lib/cv/player-tracker';
import {
  filterNonPlayerTracks,
  filterOffFieldTracks,
  filterSidelineBandTracks,
  filterStationaryTracks,
} from '@/lib/cv/track-filters';

function pt(t: number, x: number, y: number, fx?: number, fy?: number): TrackPoint {
  return {
    t,
    x,
    y,
    w: 0.05,
    h: 0.1,
    confidence: 0.9,
    ...(fx !== undefined ? { fx } : {}),
    ...(fy !== undefined ? { fy } : {}),
  };
}

function track(id: string, points: TrackPoint[]): PlayerTrack {
  return { trackId: id, points };
}

describe('filterSidelineBandTracks', () => {
  it('drops tracks whose mean y is in the top 10% of the frame', () => {
    const t1 = track('sideline-top', [pt(0, 0.5, 0.05), pt(1, 0.5, 0.06), pt(2, 0.5, 0.08)]);
    const t2 = track('on-field', [pt(0, 0.5, 0.5), pt(1, 0.5, 0.55), pt(2, 0.5, 0.6)]);
    const out = filterSidelineBandTracks([t1, t2]);
    expect(out.map((t) => t.trackId)).toEqual(['on-field']);
  });

  it('drops tracks whose mean y is in the bottom 10% of the frame', () => {
    const t1 = track('sideline-bottom', [pt(0, 0.5, 0.95), pt(1, 0.5, 0.96)]);
    const t2 = track('on-field', [pt(0, 0.5, 0.5), pt(1, 0.5, 0.55)]);
    const out = filterSidelineBandTracks([t1, t2]);
    expect(out.map((t) => t.trackId)).toEqual(['on-field']);
  });

  it('keeps tracks that only briefly touch the sideline band', () => {
    // WR running a fade — mostly in the field, briefly near the sideline
    const t = track('fade-wr', [
      pt(0, 0.3, 0.5),
      pt(1, 0.4, 0.3),
      pt(2, 0.5, 0.15),
      pt(3, 0.6, 0.08), // briefly in top band
    ]);
    // Mean y = (0.5 + 0.3 + 0.15 + 0.08) / 4 = 0.2575 — NOT in top 10%, kept.
    expect(filterSidelineBandTracks([t]).map((t) => t.trackId)).toEqual(['fade-wr']);
  });
});

describe('filterStationaryTracks', () => {
  it('drops tracks that essentially never move', () => {
    // 3-second track, movement < 0.01 × 3 = 0.03 normalized
    const stationary = track('ref', [
      pt(0, 0.5, 0.5),
      pt(1, 0.502, 0.5),
      pt(2, 0.501, 0.5),
      pt(3, 0.503, 0.5),
    ]);
    expect(filterStationaryTracks([stationary])).toEqual([]);
  });

  it('keeps tracks with normal play movement', () => {
    // Player moving normally — easily > 0.01/sec
    const player = track('wr', [
      pt(0, 0.2, 0.5),
      pt(1, 0.3, 0.4),
      pt(2, 0.4, 0.3),
    ]);
    expect(filterStationaryTracks([player]).map((t) => t.trackId)).toEqual(['wr']);
  });

  it('leaves 1-point tracks alone (other filters handle them)', () => {
    const short = track('blip', [pt(0, 0.5, 0.5)]);
    expect(filterStationaryTracks([short])).toHaveLength(1);
  });

  it('handles zero-duration tracks gracefully', () => {
    const zeroDur = track('zero', [pt(1, 0.5, 0.5), pt(1, 0.5, 0.5)]);
    expect(filterStationaryTracks([zeroDur])).toHaveLength(1);
  });
});

describe('filterOffFieldTracks', () => {
  it('drops tracks whose mean field position is past the far sideline', () => {
    // fy > 56 — track is 3+ yards off the far sideline
    const off = track('beyond-far', [
      pt(0, 0.5, 0.5, 40, 60),
      pt(1, 0.5, 0.5, 42, 61),
      pt(2, 0.5, 0.5, 44, 62),
    ]);
    expect(filterOffFieldTracks([off])).toEqual([]);
  });

  it('drops tracks whose mean field position is before the near sideline', () => {
    const off = track('beyond-near', [
      pt(0, 0.5, 0.5, 40, -5),
      pt(1, 0.5, 0.5, 42, -4),
    ]);
    expect(filterOffFieldTracks([off])).toEqual([]);
  });

  it('drops tracks whose mean field position is wildly off downfield (homography error)', () => {
    const badHomography = track('bad', [
      pt(0, 0.5, 0.5, 200, 26),
      pt(1, 0.5, 0.5, 210, 26),
    ]);
    expect(filterOffFieldTracks([badHomography])).toEqual([]);
  });

  it('keeps tracks comfortably on the field', () => {
    const wr = track('wr', [
      pt(0, 0.5, 0.5, 30, 5),
      pt(1, 0.5, 0.5, 40, 5),
      pt(2, 0.5, 0.5, 50, 5),
    ]);
    expect(filterOffFieldTracks([wr]).map((t) => t.trackId)).toEqual(['wr']);
  });

  it('keeps tracks that briefly cross the sideline but land back in-field', () => {
    // Fade route — last point is briefly past the sideline, but mean is on field
    const fade = track('fade', [
      pt(0, 0.5, 0.5, 30, 5),
      pt(1, 0.5, 0.5, 40, 3),
      pt(2, 0.5, 0.5, 50, -1), // briefly off
    ]);
    // Mean fy = (5 + 3 - 1) / 3 = 2.33 — on field, kept.
    expect(filterOffFieldTracks([fade]).map((t) => t.trackId)).toEqual(['fade']);
  });

  it('leaves tracks without field coords alone (pre-homography case)', () => {
    const pixelOnly = track('no-field', [pt(0, 0.5, 0.5), pt(1, 0.6, 0.5)]);
    expect(filterOffFieldTracks([pixelOnly])).toHaveLength(1);
  });
});

describe('filterNonPlayerTracks (composite pipeline)', () => {
  it('reports counts at each stage + returns filtered tracks', () => {
    const tracks: PlayerTrack[] = [
      // On-field real player
      track('wr', [pt(0, 0.3, 0.5, 30, 5), pt(1, 0.4, 0.4, 40, 5), pt(2, 0.5, 0.3, 50, 5)]),
      // Sideline coach
      track('coach', [pt(0, 0.5, 0.05, 50, 26), pt(1, 0.5, 0.06, 50, 26)]),
      // Stationary ref
      track('ref', [pt(0, 0.5, 0.5, 40, 26), pt(1, 0.502, 0.5, 40, 26), pt(2, 0.5, 0.5, 40, 26)]),
      // Off-field track
      track('spectator', [pt(0, 0.3, 0.5, 30, 70), pt(1, 0.35, 0.5, 31, 70)]),
    ];
    const report = filterNonPlayerTracks(tracks);
    expect(report.inputCount).toBe(4);
    expect(report.afterSidelineBand).toBe(3); // coach dropped
    expect(report.afterStationary).toBe(2); // ref dropped
    expect(report.afterOffField).toBe(1); // spectator dropped
    expect(report.tracks.map((t) => t.trackId)).toEqual(['wr']);
  });

  it('returns empty report fields when input is empty', () => {
    const report = filterNonPlayerTracks([]);
    expect(report.inputCount).toBe(0);
    expect(report.tracks).toEqual([]);
  });
});
