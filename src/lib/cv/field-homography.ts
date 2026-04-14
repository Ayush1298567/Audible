/* biome-ignore-all lint/style/noNonNullAssertion: numeric matrix code with
   bounds-checked indexing — non-null assertions are correct here, and rewriting
   with `?? 0` would silently mask bugs in the linear algebra. */
/**
 * Field registration + homography.
 *
 * Problem: pixel distances on a broadcast frame are meaningless for
 * analytics. A player running 10 yards near the camera moves way more
 * pixels than a player 10 yards away. We need to map image pixels →
 * yard coordinates on the actual football field.
 *
 * Approach:
 *   1. Claude vision looks at ONE frame per clip (the pre-snap frame,
 *      where the camera is stable and the field is most visible).
 *   2. Claude identifies 4 field landmarks — each with a pixel coord
 *      (0-1 normalized) AND a field coord (yards downfield, yards from
 *      nearest sideline).
 *   3. We compute a 3x3 homography matrix H via Direct Linear Transform
 *      so that H * (px, py, 1) ≈ (fx, fy, 1) for each reference point.
 *   4. Apply H to every track point → field-space coordinates.
 *
 * Caveats:
 *   - Assumes camera doesn't move during the play. For HS endzone film
 *     this is mostly true; a sideline camera that pans adds error.
 *   - Requires at least 4 well-spread landmarks. If Claude can only
 *     find 3, we skip calibration and leave the clip in pixel space.
 *
 * Field conventions:
 *   fx = yards downfield from the nearest goal line (0 to 100)
 *   fy = yards from the NEAR sideline (0 to 53.3)
 */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gateway, generateText, Output } from 'ai';
import { z } from 'zod';

const execFileAsync = promisify(execFile);

const CALIBRATION_MODEL = 'anthropic/claude-sonnet-4.6';

function getFfmpegPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const installer = require('@ffmpeg-installer/ffmpeg');
    return installer.path;
  } catch {
    return 'ffmpeg';
  }
}

// ─── Types ──────────────────────────────────────────────────

/** A 3x3 homography matrix in row-major order (9 numbers). */
export type Homography = [number, number, number, number, number, number, number, number, number];

export interface FieldPoint {
  /** Yards downfield from the nearest goal line (0 - 100). */
  fx: number;
  /** Yards from the near sideline (0 - 53.3). */
  fy: number;
}

export interface PixelPoint {
  /** Normalized 0-1 x in image space. */
  px: number;
  /** Normalized 0-1 y in image space. */
  py: number;
}

export interface CalibrationResult {
  homography: Homography;
  /** The landmarks Claude used — kept for debugging. */
  landmarks: Array<{ pixel: PixelPoint; field: FieldPoint; description: string }>;
  /** Mean reprojection error (normalized image units). Lower is better. */
  reprojectionError: number;
}

// ─── 4-point Direct Linear Transform (DLT) ──────────────────

/**
 * Compute the 3x3 homography H so that for each pair of points,
 *   H * (px, py, 1)^T ≈ k * (fx, fy, 1)^T
 *
 * With 4 correspondences we have 8 equations and 8 unknowns (H has 9
 * entries but is defined up to scale, so we fix h33 = 1).
 *
 * Returns null if the system is degenerate (colinear points).
 */
export function computeHomographyDLT(
  correspondences: Array<{ pixel: PixelPoint; field: FieldPoint }>,
): Homography | null {
  if (correspondences.length < 4) return null;

  // Build the 8x9 matrix A, but since we fix h33=1 we solve Ah = b with
  // A 8x8 and b 8x1. Standard DLT formulation:
  // For each correspondence (x,y) → (X,Y):
  //   [ x, y, 1, 0, 0, 0, -X*x, -X*y ] h = [ X ]
  //   [ 0, 0, 0, x, y, 1, -Y*x, -Y*y ] h = [ Y ]
  const used = correspondences.slice(0, 8); // we only need 4 but handle up to 8
  const A: number[][] = [];
  const b: number[] = [];

  for (const c of used) {
    const { px: x, py: y } = c.pixel;
    const { fx: X, fy: Y } = c.field;
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]);
    b.push(Y);
  }

  // If we have more than 4 correspondences, solve via least squares:
  // (A^T A) h = A^T b  → 8x8 system
  const sysA = matMul(transpose(A), A);
  const sysB = matVec(transpose(A), b);
  const h = solveLinearSystem(sysA, sysB);
  if (!h || h.length < 8) return null;

  const [h0, h1, h2, h3, h4, h5, h6, h7] = h;
  return [h0, h1, h2, h3, h4, h5, h6, h7, 1] as Homography;
}

/**
 * Transform a pixel point through a homography to field coords.
 * Returns null if the projection lands at infinity.
 */
export function applyHomography(point: PixelPoint, H: Homography): FieldPoint | null {
  const { px: x, py: y } = point;
  const w = H[6] * x + H[7] * y + H[8];
  if (Math.abs(w) < 1e-9) return null;
  const fx = (H[0] * x + H[1] * y + H[2]) / w;
  const fy = (H[3] * x + H[4] * y + H[5]) / w;
  return { fx, fy };
}

/**
 * Exhaustive RANSAC homography fit with outlier rejection.
 *
 * Claude sometimes picks a landmark with correct pixel coords but the
 * WRONG field label — e.g. it sees "40" painted on the field and puts
 * fx=40 when the play is actually going the other direction, so the
 * "40" is the 60-yard line from the near goal. That single bad landmark
 * drags the whole homography into a consistent-but-wrong fit.
 *
 * Iterative refinement (LSQ-drop-worst) fails here because when LSQ
 * spreads error across N points, the actually-corrupted point may not
 * have the max residual — a clean corner can look "worst." Dropping
 * clean points progressively leads to a confident but wrong fit.
 *
 * RANSAC-style approach (deterministic for N ≤ 8):
 *  1. Enumerate every 4-subset of the correspondences.
 *  2. For each subset, fit an exact 4-point homography.
 *  3. Count global inliers: correspondences whose reprojection error
 *     through THIS H is below the threshold.
 *  4. The winning subset is the one with the MOST inliers. Ties broken
 *     by lowest mean-error on inliers.
 *  5. Refit via LSQ using all inliers from the winning subset.
 *
 * Returns null if no 4-subset yields ≥4 inliers.
 */
export function robustHomographyDLT(
  correspondences: Array<{ pixel: PixelPoint; field: FieldPoint; description?: string }>,
  outlierThresholdYards = 6,
): { homography: Homography; inliers: typeof correspondences; outliers: typeof correspondences } | null {
  if (correspondences.length < 4) return null;

  // Exactly 4 — no RANSAC possible, just fit.
  if (correspondences.length === 4) {
    const H = computeHomographyDLT(correspondences);
    if (!H) return null;
    return { homography: H, inliers: correspondences, outliers: [] };
  }

  const errOf = (H: Homography, c: (typeof correspondences)[number]): number => {
    const proj = applyHomography(c.pixel, H);
    if (!proj) return Number.POSITIVE_INFINITY;
    return Math.sqrt((proj.fx - c.field.fx) ** 2 + (proj.fy - c.field.fy) ** 2);
  };

  let bestInliers: typeof correspondences = [];
  let bestMeanErr = Number.POSITIVE_INFINITY;

  // Enumerate every 4-subset. For N ≤ 8 (our real-world case) that's
  // at most C(8,4) = 70 fits — cheap.
  for (const subset of combinations(correspondences, 4)) {
    const H = computeHomographyDLT(subset);
    if (!H) continue;

    const inliers: typeof correspondences = [];
    let errSum = 0;
    for (const c of correspondences) {
      const e = errOf(H, c);
      if (e <= outlierThresholdYards) {
        inliers.push(c);
        errSum += e;
      }
    }

    if (inliers.length < 4) continue;
    const meanErr = errSum / inliers.length;

    // Prefer more inliers. Break ties with lower mean error.
    if (
      inliers.length > bestInliers.length ||
      (inliers.length === bestInliers.length && meanErr < bestMeanErr)
    ) {
      bestInliers = inliers;
      bestMeanErr = meanErr;
    }
  }

  if (bestInliers.length < 4) return null;

  // Refit H via LSQ using the full inlier set — gives a better result
  // than the 4-point exact fit when we have >4 inliers.
  const finalH = computeHomographyDLT(bestInliers);
  if (!finalH) return null;

  const inlierSet = new Set(bestInliers);
  const outliers = correspondences.filter((c) => !inlierSet.has(c));
  for (const o of outliers) {
    console.warn('homography_outlier_landmark', {
      description: o.description,
      error: Number(errOf(finalH, o).toFixed(1)),
    });
  }

  return { homography: finalH, inliers: bestInliers, outliers };
}

/** Yield every k-subset of arr (order-preserving, deterministic). */
function* combinations<T>(arr: readonly T[], k: number): Generator<T[]> {
  if (k === 0) {
    yield [];
    return;
  }
  if (k > arr.length) return;
  for (let i = 0; i <= arr.length - k; i++) {
    const head = arr[i];
    if (head === undefined) continue;
    for (const tail of combinations(arr.slice(i + 1), k - 1)) {
      yield [head, ...tail];
    }
  }
}

/** Mean reprojection error — how well does H fit the correspondences? */
function computeReprojectionError(
  correspondences: Array<{ pixel: PixelPoint; field: FieldPoint }>,
  H: Homography,
): number {
  let sum = 0;
  let count = 0;
  for (const c of correspondences) {
    const proj = applyHomography(c.pixel, H);
    if (!proj) continue;
    const dx = proj.fx - c.field.fx;
    const dy = proj.fy - c.field.fy;
    sum += Math.sqrt(dx * dx + dy * dy);
    count++;
  }
  return count > 0 ? sum / count : Infinity;
}

// ─── Linear algebra helpers (no dependency on math.js) ──────

function transpose(A: number[][]): number[][] {
  const rows = A.length;
  const cols = A[0]?.length ?? 0;
  const T: number[][] = [];
  for (let j = 0; j < cols; j++) {
    const row: number[] = [];
    for (let i = 0; i < rows; i++) row.push(A[i]![j]!);
    T.push(row);
  }
  return T;
}

function matMul(A: number[][], B: number[][]): number[][] {
  const aRows = A.length;
  const aCols = A[0]?.length ?? 0;
  const bCols = B[0]?.length ?? 0;
  const C: number[][] = [];
  for (let i = 0; i < aRows; i++) {
    const row: number[] = [];
    for (let j = 0; j < bCols; j++) {
      let sum = 0;
      for (let k = 0; k < aCols; k++) sum += A[i]![k]! * B[k]![j]!;
      row.push(sum);
    }
    C.push(row);
  }
  return C;
}

function matVec(A: number[][], b: number[]): number[] {
  return A.map((row) => row.reduce((sum, v, k) => sum + v * b[k]!, 0));
}

/**
 * Solve Ax = b via Gaussian elimination with partial pivoting.
 * Returns null on singular systems.
 */
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  // Augmented matrix copy
  const M: number[][] = A.map((row, i) => [...row, b[i]!]);

  for (let k = 0; k < n; k++) {
    // Partial pivot
    let iMax = k;
    let maxVal = Math.abs(M[k]![k]!);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(M[i]![k]!);
      if (v > maxVal) {
        maxVal = v;
        iMax = i;
      }
    }
    if (maxVal < 1e-12) return null; // singular
    if (iMax !== k) [M[k], M[iMax]] = [M[iMax]!, M[k]!];

    // Eliminate below
    for (let i = k + 1; i < n; i++) {
      const factor = M[i]![k]! / M[k]![k]!;
      for (let j = k; j <= n; j++) {
        M[i]![j]! -= factor * M[k]![j]!;
      }
    }
  }

  // Back-substitute
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i]![n]!;
    for (let j = i + 1; j < n; j++) sum -= M[i]![j]! * x[j];
    x[i] = sum / M[i]![i]!;
  }
  return x;
}

// ─── Frame extraction ───────────────────────────────────────

async function extractCalibrationFrame(
  clipPath: string,
  timeSeconds: number,
): Promise<string | null> {
  const outPath = join(tmpdir(), `cal-${randomUUID()}.jpg`);
  try {
    await execFileAsync(
      getFfmpegPath(),
      [
        '-y',
        '-ss',
        String(timeSeconds),
        '-i',
        clipPath,
        '-frames:v',
        '1',
        '-q:v',
        '2',
        '-vf',
        'scale=1280:-1',
        '-update',
        '1',
        outPath,
      ],
      { timeout: 15000 },
    );
    const buf = await readFile(outPath);
    return buf.toString('base64');
  } catch {
    return null;
  } finally {
    await unlink(outPath).catch(() => {});
  }
}

// ─── Claude vision calibration ──────────────────────────────

const landmarkSchema = z.object({
  landmarks: z
    .array(
      z.object({
        description: z
          .string()
          .describe('What you identified (e.g., "30-yard line meets near sideline")'),
        /** Image coords, 0-1 normalized. */
        px: z.number().min(0).max(1),
        py: z.number().min(0).max(1),
        /** Yards downfield from near goal line (0-100). */
        fx: z.number().min(0).max(100),
        /** Yards from near sideline (0-53.3). */
        fy: z.number().min(0).max(53.3),
        confidence: z.number().min(0).max(1),
      }),
    )
    .min(0)
    .max(8)
    .describe('4-6 well-spread field landmarks with pixel and field coords'),
  /** Whether the frame shows enough of the field to calibrate. */
  calibratable: z.boolean(),
  notes: z.string().optional(),
});

const CALIBRATION_SYSTEM = `You are a football field surveyor. You will see one frame from a broadcast clip.
Your job is to identify 4-6 RELIABLE field landmarks on the image — each with both its
pixel coordinates (normalized 0-1, where (0,0) is top-left) and its field coordinates
in yards.

Field coordinate system:
  fx = yards DOWNFIELD from the NEAR goal line (0 = near goal, 100 = far goal)
  fy = yards from the NEAR SIDELINE (0 = near sideline, 53.3 = far sideline)

Good landmarks (pick the ones you can see clearly):
  - Yard-line numbers painted on the field ("30", "40", "50"). You know exactly which
    yard line each number is on.
  - Intersection of a yard line with a sideline.
  - Intersection of a yard line with a hash mark.
  - Goal-line corners.

Requirements:
  - AT LEAST 4 landmarks, spread across the frame (not clustered).
  - Include landmarks at different depths if possible (some near the camera, some far).
  - Be HONEST about field coords. If the visible yard markers say "30" and "40", those
    are your anchors — don't guess a coord you can't see.
  - If you can't identify 4 good landmarks, set calibratable=false.

If you see numbers painted on the field (e.g. a big "3 0"), remember they refer to
the yard LINE — i.e., "30" means the 30-yard line (30 yards from the NEAREST goal line
if that end of the field is the one the 30 is closer to, otherwise 70 yards from the
near goal line). Use the orientation of the numbers to figure out which end is which.`;

/**
 * Ask Claude to find 4+ field landmarks on a single frame and compute
 * the homography from them. Returns null if the frame isn't calibratable.
 */
export async function calibrateFieldFromFrame(
  frameBase64: string,
): Promise<CalibrationResult | null> {
  let parsed: z.infer<typeof landmarkSchema> | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { output } = await generateText({
        model: gateway(CALIBRATION_MODEL),
        system: CALIBRATION_SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', image: `data:image/jpeg;base64,${frameBase64}` },
              {
                type: 'text',
                text: 'Identify 4-6 field landmarks on this frame. Return pixel coords (0-1) and field coords (yards).',
              },
            ],
          },
        ],
        output: Output.object({ schema: landmarkSchema }),
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
      console.error('field_calibration_failed', {
        err: err instanceof Error ? err.message.slice(0, 200) : String(err),
      });
    }
  }

  if (!parsed?.calibratable || parsed.landmarks.length < 4) {
    return null;
  }

  // Filter to high-confidence landmarks first
  const highConf = parsed.landmarks.filter((l) => l.confidence >= 0.6).slice(0, 6);
  const landmarks = highConf.length >= 4 ? highConf : parsed.landmarks.slice(0, 6);

  if (landmarks.length < 4) return null;

  const correspondences = landmarks.map((l) => ({
    pixel: { px: l.px, py: l.py },
    field: { fx: l.fx, fy: l.fy },
    description: l.description,
  }));

  // Use the robust fit — it'll drop any landmark Claude mis-labeled (e.g.
  // put fx=40 when the play is going toward the other goal line, so the
  // painted "40" is actually the 60-yard line from the near goal). A
  // single mis-labeled landmark otherwise drags the whole H off by yards.
  const robust = robustHomographyDLT(correspondences);
  if (!robust) {
    console.warn('calibration_rejected_no_consistent_inliers', {
      landmarkCount: landmarks.length,
    });
    return null;
  }

  const err = computeReprojectionError(robust.inliers, robust.homography);
  // Tightened from 8yd → 4yd. An 8yd reprojection error means player
  // field positions could be off by a whole defensive shift (a 10-yard
  // zone concept). That's not "approximate" — it's actively wrong for
  // coaching decisions. 4yd is the practical boundary between "useful
  // field-space analytics" and "better to leave it in pixel space."
  if (err > 4) {
    console.warn('calibration_rejected_high_error', {
      err,
      inliers: robust.inliers.length,
      outliers: robust.outliers.length,
    });
    return null;
  }

  if (robust.outliers.length > 0) {
    console.log('calibration_dropped_outliers', {
      kept: robust.inliers.length,
      dropped: robust.outliers.length,
      finalError: Number(err.toFixed(2)),
    });
  }

  return {
    homography: robust.homography,
    landmarks: robust.inliers.map((l) => ({
      pixel: l.pixel,
      field: l.field,
      description: l.description ?? '',
    })),
    reprojectionError: err,
  };
}

/**
 * Extract a pre-snap frame from a clip and calibrate the field from it.
 */
export async function calibrateFieldFromClip(
  clipPath: string,
  clipDurationSeconds: number,
): Promise<CalibrationResult | null> {
  // Pre-snap is typically 5-15% into the clip (we added 1s preroll).
  const t = Math.max(0, Math.min(clipDurationSeconds - 0.1, clipDurationSeconds * 0.1));
  const frame = await extractCalibrationFrame(clipPath, t);
  if (!frame) return null;
  return calibrateFieldFromFrame(frame);
}
