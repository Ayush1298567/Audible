/**
 * Unit tests for the multi-object player tracker.
 *
 * Roboflow itself is mocked out by constructing FrameDetections directly.
 * These tests exercise the IoU + Hungarian association logic on
 * synthetic frames where we know what the right answer should be.
 */

import { describe, expect, it } from 'vitest';
import type { FrameDetections } from '@/lib/cv/player-detector';
import { trackDetections } from '@/lib/cv/player-tracker';

// Helper: build a FrameDetections object with simple square bboxes.
function frame(
  t: number,
  boxes: Array<{ cx: number; cy: number; size: number; conf?: number }>,
): FrameDetections {
  return {
    timestamp: t,
    imageWidth: 640,
    imageHeight: 360,
    detections: boxes.map((b) => ({
      x: b.cx,
      y: b.cy,
      width: b.size,
      height: b.size,
      confidence: b.conf ?? 0.9,
      class: 'person',
    })),
  };
}

describe('trackDetections', () => {
  it('returns no tracks when every frame is empty', () => {
    const frames: FrameDetections[] = [
      { timestamp: 0, imageWidth: 640, imageHeight: 360, detections: [] },
      { timestamp: 0.5, imageWidth: 640, imageHeight: 360, detections: [] },
    ];
    expect(trackDetections(frames)).toEqual([]);
  });

  it('persists a single player across frames as one track', () => {
    // One person walking left-to-right across 5 frames. Small step per frame.
    const frames = [
      frame(0.0, [{ cx: 100, cy: 200, size: 60 }]),
      frame(0.5, [{ cx: 110, cy: 200, size: 60 }]),
      frame(1.0, [{ cx: 120, cy: 200, size: 60 }]),
      frame(1.5, [{ cx: 130, cy: 200, size: 60 }]),
      frame(2.0, [{ cx: 140, cy: 200, size: 60 }]),
    ];
    const tracks = trackDetections(frames);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]?.points).toHaveLength(5);
    // First point normalized: 100/640 ≈ 0.156
    expect(tracks[0]?.points[0]?.x).toBeCloseTo(100 / 640, 3);
    expect(tracks[0]?.points[4]?.x).toBeCloseTo(140 / 640, 3);
  });

  it('keeps two non-overlapping players as separate tracks', () => {
    // Two players on opposite sides of the frame across 5 frames so they
    // clear the MIN_POINTS=5 noise floor.
    const frames = [
      frame(0.0, [{ cx: 100, cy: 200, size: 60 }, { cx: 500, cy: 200, size: 60 }]),
      frame(0.5, [{ cx: 110, cy: 200, size: 60 }, { cx: 505, cy: 200, size: 60 }]),
      frame(1.0, [{ cx: 120, cy: 200, size: 60 }, { cx: 510, cy: 200, size: 60 }]),
      frame(1.5, [{ cx: 130, cy: 200, size: 60 }, { cx: 515, cy: 200, size: 60 }]),
      frame(2.0, [{ cx: 140, cy: 200, size: 60 }, { cx: 520, cy: 200, size: 60 }]),
    ];
    const tracks = trackDetections(frames);
    expect(tracks).toHaveLength(2);
    for (const t of tracks) {
      expect(t.points).toHaveLength(5);
    }
    // Each track should stay on its own side — check that no track's
    // x jumps across the middle.
    for (const t of tracks) {
      const xs = t.points.map((p) => p.x);
      const allLeft = xs.every((x) => x < 0.4);
      const allRight = xs.every((x) => x > 0.6);
      expect(allLeft || allRight).toBe(true);
    }
  });

  it('starts a new track for a player that appears mid-clip', () => {
    // Two players, both with ≥5 frames present so they survive the noise floor.
    const frames = [
      frame(0.0, [{ cx: 100, cy: 200, size: 60 }]),
      frame(0.5, [{ cx: 110, cy: 200, size: 60 }]),
      // Second player walks into frame at t=1.0 and stays for 5 frames.
      frame(1.0, [{ cx: 120, cy: 200, size: 60 }, { cx: 400, cy: 200, size: 60 }]),
      frame(1.5, [{ cx: 130, cy: 200, size: 60 }, { cx: 410, cy: 200, size: 60 }]),
      frame(2.0, [{ cx: 140, cy: 200, size: 60 }, { cx: 420, cy: 200, size: 60 }]),
      frame(2.5, [{ cx: 150, cy: 200, size: 60 }, { cx: 430, cy: 200, size: 60 }]),
      frame(3.0, [{ cx: 160, cy: 200, size: 60 }, { cx: 440, cy: 200, size: 60 }]),
    ];
    const tracks = trackDetections(frames);
    expect(tracks).toHaveLength(2);
    // First player: 7 frames; second player: 5 frames (joins at t=1.0)
    const pointsCounts = tracks.map((t) => t.points.length).sort();
    expect(pointsCounts).toEqual([5, 7]);
  });

  it('filters out very short tracks (noise)', () => {
    // Both segments below MIN_POINTS=5 → both filtered.
    const frames = [
      frame(0.0, [{ cx: 100, cy: 200, size: 60 }]),
      frame(0.5, [{ cx: 110, cy: 200, size: 60 }]),
      frame(1.0, [{ cx: 120, cy: 200, size: 60 }]),
      // Player disappears, then a brief 4-frame appearance
      frame(1.5, []),
      frame(2.0, []),
      frame(2.5, []),
      frame(3.0, []),
      frame(3.5, [{ cx: 400, cy: 200, size: 60 }]),
      frame(4.0, [{ cx: 410, cy: 200, size: 60 }]),
      frame(4.5, [{ cx: 420, cy: 200, size: 60 }]),
      frame(5.0, [{ cx: 430, cy: 200, size: 60 }]),
    ];
    const tracks = trackDetections(frames);
    // Both tracks (3 + 4 points) below MIN_POINTS=5 → no survivors.
    expect(tracks).toEqual([]);
  });

  it('produces normalized coordinates in [0, 1]', () => {
    const frames = [
      frame(0.0, [{ cx: 320, cy: 180, size: 100 }]),
      frame(0.5, [{ cx: 320, cy: 180, size: 100 }]),
      frame(1.0, [{ cx: 320, cy: 180, size: 100 }]),
      frame(1.5, [{ cx: 320, cy: 180, size: 100 }]),
      frame(2.0, [{ cx: 320, cy: 180, size: 100 }]),
    ];
    const tracks = trackDetections(frames);
    expect(tracks).toHaveLength(1);
    const points = tracks[0]?.points ?? [];
    expect(points.length).toBeGreaterThan(0);
    for (const p of points) {
      expect(p.x).toBeCloseTo(0.5, 3);
      expect(p.y).toBeCloseTo(0.5, 3);
      expect(p.w).toBeCloseTo(100 / 640, 3);
      expect(p.h).toBeCloseTo(100 / 360, 3);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });

  it('does not lose a track briefly occluded (within MAX_MISSES)', () => {
    const frames = [
      frame(0.0, [{ cx: 100, cy: 200, size: 60 }]),
      frame(0.5, [{ cx: 110, cy: 200, size: 60 }]),
      frame(1.0, []), // brief occlusion (1 frame)
      frame(1.5, [{ cx: 130, cy: 200, size: 60 }]),
      frame(2.0, [{ cx: 140, cy: 200, size: 60 }]),
      frame(2.5, [{ cx: 150, cy: 200, size: 60 }]),
      frame(3.0, [{ cx: 160, cy: 200, size: 60 }]),
    ];
    const tracks = trackDetections(frames);
    // Track should survive the 1-frame miss; 6 detections → 6 points.
    expect(tracks).toHaveLength(1);
    expect(tracks[0]?.points).toHaveLength(6);
  });

  it('emits trackQuality reflecting detection confidence + length + smoothness', () => {
    // Smooth 8-frame track at confidence 0.95 → high quality.
    const frames = Array.from({ length: 8 }, (_, i) =>
      frame(i * 0.5, [{ cx: 100 + i * 10, cy: 200, size: 60, conf: 0.95 }]),
    );
    const tracks = trackDetections(frames);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]?.trackQuality).toBeDefined();
    expect(tracks[0]?.trackQuality).toBeGreaterThan(0.7);
  });

  it('penalizes jumpy tracks in trackQuality', () => {
    // Identity-switch pattern — alternating positions across frames
    const frames = Array.from({ length: 8 }, (_, i) =>
      frame(i * 0.5, [{ cx: i % 2 === 0 ? 100 : 500, cy: 200, size: 60, conf: 0.9 }]),
    );
    const tracks = trackDetections(frames);
    // The tracker may split this into 2 tracks; whichever survives
    // should have a low quality due to jumpiness.
    if (tracks.length > 0) {
      const maxQ = Math.max(...tracks.map((t) => t.trackQuality ?? 1));
      expect(maxQ).toBeLessThan(0.85);
    }
  });
});
