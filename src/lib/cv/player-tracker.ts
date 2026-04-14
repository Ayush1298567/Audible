/**
 * Multi-object player tracker.
 *
 * Given per-frame detections from the player detector, associate them
 * into persistent tracks across the clip using a simple greedy approach:
 *   1. For each pair of adjacent frames, match detections by a score
 *      that combines IoU (bounding box overlap) + center distance.
 *   2. Use Hungarian assignment to find the optimal matching.
 *   3. Unmatched detections in frame N+1 start new tracks.
 *   4. Tracks that lose matches for K consecutive frames die.
 *
 * This is naive compared to ByteTrack/BoT-SORT but works OK on HS film
 * where the camera is mostly static and players move slowly relative
 * to the frame.
 */

import type { Detection, FrameDetections } from './player-detector';

export interface TrackPoint {
  /** Timestamp in seconds (relative to clip start). */
  t: number;
  /** Normalized center x in [0, 1]. */
  x: number;
  /** Normalized center y in [0, 1]. */
  y: number;
  /** Bounding box width, normalized. */
  w: number;
  /** Bounding box height, normalized. */
  h: number;
  confidence: number;
  /** Field-space X (yards downfield from near goal line). Set by M3 homography. */
  fx?: number;
  /** Field-space Y (yards from near sideline). Set by M3 homography. */
  fy?: number;
}

export interface PlayerTrack {
  /** Synthetic ID assigned at tracking time. */
  trackId: string;
  /** Ordered sequence of points through the clip. */
  points: TrackPoint[];
  /** If set, the jersey number identified later via OCR. */
  jersey?: string;
  /** If set, the position role (e.g., "WR", "FS"). */
  role?: string;
  /** If set, the homography used to compute field coords. Row-major 3x3. */
  homography?: [number, number, number, number, number, number, number, number, number];
}

// ─── IoU + distance scoring ────────────────────────────────

function iou(a: Detection, b: Detection): number {
  const ax1 = a.x - a.width / 2;
  const ay1 = a.y - a.height / 2;
  const ax2 = a.x + a.width / 2;
  const ay2 = a.y + a.height / 2;
  const bx1 = b.x - b.width / 2;
  const by1 = b.y - b.height / 2;
  const bx2 = b.x + b.width / 2;
  const by2 = b.y + b.height / 2;

  const interX1 = Math.max(ax1, bx1);
  const interY1 = Math.max(ay1, by1);
  const interX2 = Math.min(ax2, bx2);
  const interY2 = Math.min(ay2, by2);

  const interW = Math.max(0, interX2 - interX1);
  const interH = Math.max(0, interY2 - interY1);
  const interArea = interW * interH;

  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const unionArea = areaA + areaB - interArea;
  if (unionArea === 0) return 0;
  return interArea / unionArea;
}

function centerDistance(a: Detection, b: Detection, imgW: number, imgH: number): number {
  const diag = Math.sqrt(imgW * imgW + imgH * imgH);
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy) / diag;
}

/** Combined association score. Higher = better match. */
function matchScore(a: Detection, b: Detection, imgW: number, imgH: number): number {
  const iouScore = iou(a, b);
  const distNorm = centerDistance(a, b, imgW, imgH);
  // IoU is the primary signal; use 1-distance as secondary to break ties.
  return iouScore * 0.8 + (1 - distNorm) * 0.2;
}

// ─── Hungarian assignment (Kuhn-Munkres) ───────────────────

/**
 * Solve the assignment problem: given a cost matrix [n][m], find the
 * assignment of rows to columns that minimizes total cost.
 * Returns an array where assignment[row] = column (or -1 if unassigned).
 */
function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  if (n === 0) return [];
  const m = cost[0]?.length ?? 0;
  if (m === 0) return new Array(n).fill(-1);

  const dim = Math.max(n, m);
  // Pad to square
  const padded: number[][] = [];
  const LARGE = 1e9;
  for (let i = 0; i < dim; i++) {
    const row: number[] = [];
    for (let j = 0; j < dim; j++) {
      row.push(i < n && j < m ? cost[i]![j]! : LARGE);
    }
    padded.push(row);
  }

  // Kuhn-Munkres
  const u = new Array(dim + 1).fill(0);
  const v = new Array(dim + 1).fill(0);
  const p = new Array(dim + 1).fill(0);
  const way = new Array(dim + 1).fill(0);

  for (let i = 1; i <= dim; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(dim + 1).fill(Infinity);
    const used = new Array(dim + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= dim; j++) {
        if (!used[j]) {
          const cur = padded[i0 - 1]![j - 1]! - u[i0]! - v[j]!;
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }
      for (let j = 0; j <= dim; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  const assignment = new Array(n).fill(-1);
  for (let j = 1; j <= dim; j++) {
    const row = p[j] - 1;
    if (row >= 0 && row < n && j - 1 < m) assignment[row] = j - 1;
  }
  return assignment;
}

// ─── Tracker ────────────────────────────────────────────────

interface ActiveTrack {
  id: string;
  points: TrackPoint[];
  lastDet: Detection;
  lastT: number;
  missCount: number;
}

const MIN_MATCH_SCORE = 0.15; // assignments below this threshold are rejected
const MAX_MISSES = 3; // kill tracks after this many frames without a match

/**
 * Assemble per-frame detections into multi-frame tracks.
 */
export function trackDetections(frames: FrameDetections[]): PlayerTrack[] {
  const tracks: ActiveTrack[] = [];
  const finished: ActiveTrack[] = [];
  let nextId = 1;

  for (const frame of frames) {
    if (frame.detections.length === 0 || frame.imageWidth === 0) {
      // Age tracks; no matches this frame
      for (const t of tracks) t.missCount++;
      continue;
    }

    const nTracks = tracks.length;
    const nDets = frame.detections.length;

    if (nTracks === 0) {
      // Start new tracks for every detection
      for (const det of frame.detections) {
        tracks.push({
          id: `t${nextId++}`,
          points: [detToPoint(det, frame)],
          lastDet: det,
          lastT: frame.timestamp,
          missCount: 0,
        });
      }
      continue;
    }

    // Build cost matrix (lower = better), rows = tracks, cols = detections
    const cost: number[][] = [];
    for (const t of tracks) {
      const row: number[] = [];
      for (const d of frame.detections) {
        const s = matchScore(t.lastDet, d, frame.imageWidth, frame.imageHeight);
        // Convert score to cost: penalize low scores heavily
        row.push(s >= MIN_MATCH_SCORE ? 1 - s : 10);
      }
      cost.push(row);
    }

    const assignment = hungarian(cost);

    const matchedDetIndices = new Set<number>();
    const matchedTrackIndices = new Set<number>();

    for (let ti = 0; ti < nTracks; ti++) {
      const di = assignment[ti];
      if (di === undefined || di === -1 || di < 0 || di >= nDets) continue;
      const costVal = cost[ti]![di]!;
      if (costVal >= 10) continue; // rejected

      const det = frame.detections[di]!;
      const trk = tracks[ti]!;
      trk.points.push(detToPoint(det, frame));
      trk.lastDet = det;
      trk.lastT = frame.timestamp;
      trk.missCount = 0;
      matchedDetIndices.add(di);
      matchedTrackIndices.add(ti);
    }

    // Tracks that didn't match age up
    for (let ti = 0; ti < nTracks; ti++) {
      if (!matchedTrackIndices.has(ti)) {
        tracks[ti]!.missCount++;
      }
    }

    // New tracks for unmatched detections
    for (let di = 0; di < nDets; di++) {
      if (matchedDetIndices.has(di)) continue;
      const det = frame.detections[di]!;
      tracks.push({
        id: `t${nextId++}`,
        points: [detToPoint(det, frame)],
        lastDet: det,
        lastT: frame.timestamp,
        missCount: 0,
      });
    }

    // Kill tracks that have missed too many frames
    for (let i = tracks.length - 1; i >= 0; i--) {
      if (tracks[i]!.missCount > MAX_MISSES) {
        finished.push(tracks[i]!);
        tracks.splice(i, 1);
      }
    }
  }

  // Finalize remaining active tracks
  finished.push(...tracks);

  // Filter out very short tracks (noise)
  const MIN_POINTS = 3;
  return finished
    .filter((t) => t.points.length >= MIN_POINTS)
    .map((t) => ({
      trackId: t.id,
      points: t.points,
    }));
}

function detToPoint(det: Detection, frame: FrameDetections): TrackPoint {
  return {
    t: frame.timestamp,
    x: det.x / frame.imageWidth,
    y: det.y / frame.imageHeight,
    w: det.width / frame.imageWidth,
    h: det.height / frame.imageHeight,
    confidence: det.confidence,
  };
}
