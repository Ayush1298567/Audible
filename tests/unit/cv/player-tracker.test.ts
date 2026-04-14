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
    // Two players on opposite sides of the frame.
    const frames = [
      frame(0.0, [
        { cx: 100, cy: 200, size: 60 },
        { cx: 500, cy: 200, size: 60 },
      ]),
      frame(0.5, [
        { cx: 110, cy: 200, size: 60 },
        { cx: 505, cy: 200, size: 60 },
      ]),
      frame(1.0, [
        { cx: 120, cy: 200, size: 60 },
        { cx: 510, cy: 200, size: 60 },
      ]),
    ];
    const tracks = trackDetections(frames);
    expect(tracks).toHaveLength(2);
    for (const t of tracks) {
      expect(t.points).toHaveLength(3);
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
    const frames = [
      frame(0.0, [{ cx: 100, cy: 200, size: 60 }]),
      frame(0.5, [{ cx: 110, cy: 200, size: 60 }]),
      // Second player walks into frame
      frame(1.0, [
        { cx: 120, cy: 200, size: 60 },
        { cx: 400, cy: 200, size: 60 },
      ]),
      frame(1.5, [
        { cx: 130, cy: 200, size: 60 },
        { cx: 410, cy: 200, size: 60 },
      ]),
      frame(2.0, [
        { cx: 140, cy: 200, size: 60 },
        { cx: 420, cy: 200, size: 60 },
      ]),
    ];
    const tracks = trackDetections(frames);
    expect(tracks).toHaveLength(2);
    // The later-arriving track has 3 points (frames 1.0, 1.5, 2.0)
    const pointsCounts = tracks.map((t) => t.points.length).sort();
    expect(pointsCounts).toEqual([3, 5]);
  });

  it('filters out very short tracks (noise)', () => {
    // Player flickers in/out for just 2 frames — should be filtered.
    // The constant MIN_POINTS = 3 in the tracker.
    const frames = [
      frame(0.0, [{ cx: 100, cy: 200, size: 60 }]),
      frame(0.5, [{ cx: 110, cy: 200, size: 60 }]),
      // Player disappears for 4 frames (exceeds MAX_MISSES=3, track dies)
      frame(1.0, []),
      frame(1.5, []),
      frame(2.0, []),
      frame(2.5, []),
      // Now a brief 2-frame appearance — below MIN_POINTS=3 so gets filtered
      frame(3.0, [{ cx: 400, cy: 200, size: 60 }]),
      frame(3.5, [{ cx: 410, cy: 200, size: 60 }]),
    ];
    const tracks = trackDetections(frames);
    // First track had 2 points → filtered. Second track has 2 points → filtered.
    // Result: no tracks survive.
    expect(tracks).toEqual([]);
  });

  it('produces normalized coordinates in [0, 1]', () => {
    const frames = [
      frame(0.0, [{ cx: 320, cy: 180, size: 100 }]),
      frame(0.5, [{ cx: 320, cy: 180, size: 100 }]),
      frame(1.0, [{ cx: 320, cy: 180, size: 100 }]),
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
    ];
    const tracks = trackDetections(frames);
    // Track should survive the 1-frame miss (MAX_MISSES = 3)
    expect(tracks).toHaveLength(1);
    // Points are only added on frames where the player is detected (4 total)
    expect(tracks[0]?.points).toHaveLength(4);
  });
});
