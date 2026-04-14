/* biome-ignore-all lint/style/noNonNullAssertion: tests use `expect(x).not.toBeNull()`
   followed by `x!` to exercise the non-null branch deliberately. */
/**
 * Unit tests for the pure-math field homography module.
 *
 * The Claude-vision calibration part calls the AI Gateway and is tested
 * via integration/evals. These tests cover only the deterministic math:
 * DLT solver, reprojection, linear algebra helpers.
 */

import { describe, expect, it } from 'vitest';
import { applyHomography, computeHomographyDLT, type Homography } from '@/lib/cv/field-homography';

describe('computeHomographyDLT', () => {
  it('recovers an identity homography from collinear correspondences', () => {
    // If image coords == field coords (identity mapping), H should act as identity.
    const corr = [
      { pixel: { px: 0, py: 0 }, field: { fx: 0, fy: 0 } },
      { pixel: { px: 1, py: 0 }, field: { fx: 1, fy: 0 } },
      { pixel: { px: 0, py: 1 }, field: { fx: 0, fy: 1 } },
      { pixel: { px: 1, py: 1 }, field: { fx: 1, fy: 1 } },
    ];
    const H = computeHomographyDLT(corr);
    expect(H).not.toBeNull();
    // Apply H to a new point and verify round-trip
    const proj = applyHomography({ px: 0.5, py: 0.5 }, H as Homography);
    expect(proj).not.toBeNull();
    expect(proj?.fx).toBeCloseTo(0.5, 6);
    expect(proj?.fy).toBeCloseTo(0.5, 6);
  });

  it('handles a non-trivial perspective transform', () => {
    // A classic "trapezoid → rectangle" mapping a broadcast frame might need.
    // Pixel space: near side wide, far side narrow (like a sideline cam).
    // Field: proper rectangular yard coords.
    const corr = [
      { pixel: { px: 0.1, py: 0.9 }, field: { fx: 20, fy: 0 } }, // near sideline, near yard line
      { pixel: { px: 0.9, py: 0.9 }, field: { fx: 20, fy: 53 } }, // far sideline, near yard line
      { pixel: { px: 0.3, py: 0.3 }, field: { fx: 50, fy: 0 } }, // near sideline, mid yard line (looks closer to center due to perspective)
      { pixel: { px: 0.7, py: 0.3 }, field: { fx: 50, fy: 53 } }, // far sideline, mid yard line
    ];
    const H = computeHomographyDLT(corr);
    expect(H).not.toBeNull();

    // Round-trip each correspondence within reasonable float precision.
    for (const c of corr) {
      const proj = applyHomography(c.pixel, H as Homography);
      expect(proj).not.toBeNull();
      expect(proj?.fx).toBeCloseTo(c.field.fx, 3);
      expect(proj?.fy).toBeCloseTo(c.field.fy, 3);
    }
  });

  it('returns null when given fewer than 4 correspondences', () => {
    const corr = [
      { pixel: { px: 0, py: 0 }, field: { fx: 0, fy: 0 } },
      { pixel: { px: 1, py: 0 }, field: { fx: 1, fy: 0 } },
      { pixel: { px: 0, py: 1 }, field: { fx: 0, fy: 1 } },
    ];
    expect(computeHomographyDLT(corr)).toBeNull();
  });

  it('survives more than 4 correspondences (least squares)', () => {
    // Generate a known ground-truth H, then synthesize 6 correspondences
    // from it. This exercises the least-squares path with data that's
    // guaranteed consistent (i.e. the right answer is achievable).
    const trueH: Homography = [100, 10, -5, -15, 75, 12, 0.2, 0.3, 1];
    const pixelPoints = [
      { px: 0.1, py: 0.9 },
      { px: 0.9, py: 0.9 },
      { px: 0.3, py: 0.3 },
      { px: 0.7, py: 0.3 },
      { px: 0.5, py: 0.6 },
      { px: 0.2, py: 0.75 },
    ];
    const corr = pixelPoints.map((px) => {
      const proj = applyHomography(px, trueH);
      return { pixel: px, field: proj! };
    });

    const H = computeHomographyDLT(corr);
    expect(H).not.toBeNull();

    // Mean reprojection error should be essentially zero for consistent points.
    let totalErr = 0;
    for (const c of corr) {
      const proj = applyHomography(c.pixel, H as Homography);
      if (!proj) continue;
      totalErr += Math.sqrt((proj.fx - c.field.fx) ** 2 + (proj.fy - c.field.fy) ** 2);
    }
    const meanErr = totalErr / corr.length;
    expect(meanErr).toBeLessThan(0.001);
  });

  it('produces bounded reprojection error under noisy correspondences', () => {
    // Simulate Claude labeling noise (±1 yard on field coords) — DLT
    // least-squares should still return a useful H, just with higher residual.
    const trueH: Homography = [100, 10, -5, -15, 75, 12, 0.2, 0.3, 1];
    const pixelPoints = [
      { px: 0.1, py: 0.9 },
      { px: 0.9, py: 0.9 },
      { px: 0.3, py: 0.3 },
      { px: 0.7, py: 0.3 },
      { px: 0.5, py: 0.6 },
      { px: 0.2, py: 0.75 },
    ];
    // Deterministic pseudo-noise (no Math.random) for reproducibility
    const noise = [0.4, -0.3, 0.5, -0.7, 0.2, -0.6, 0.8, -0.1, 0.3, -0.5, 0.6, -0.4];
    const corr = pixelPoints.map((px, i) => {
      const proj = applyHomography(px, trueH)!;
      return {
        pixel: px,
        field: {
          fx: proj.fx + (noise[i * 2] ?? 0),
          fy: proj.fy + (noise[i * 2 + 1] ?? 0),
        },
      };
    });
    const H = computeHomographyDLT(corr);
    expect(H).not.toBeNull();

    let totalErr = 0;
    for (const c of corr) {
      const proj = applyHomography(c.pixel, H as Homography);
      if (!proj) continue;
      totalErr += Math.sqrt((proj.fx - c.field.fx) ** 2 + (proj.fy - c.field.fy) ** 2);
    }
    // With ±1 yard noise, residual should still be <2 yards — good enough
    // for the 8-yard rejection threshold in field-homography.ts.
    expect(totalErr / corr.length).toBeLessThan(2);
  });
});

describe('applyHomography', () => {
  it('returns null when projection lands at infinity', () => {
    // A singular homography where all points map to w=0.
    const H: Homography = [0, 0, 1, 0, 0, 1, 0, 0, 0];
    expect(applyHomography({ px: 0.5, py: 0.5 }, H)).toBeNull();
  });

  it('is linear when the perspective row is flat (affine case)', () => {
    // Affine transform: H has last row (0,0,1), so it's a scale+translate.
    // Map px ∈ [0,1] → fx ∈ [0,100], py ∈ [0,1] → fy ∈ [0,53.3]
    const H: Homography = [100, 0, 0, 0, 53.3, 0, 0, 0, 1];
    const proj = applyHomography({ px: 0.5, py: 0.5 }, H);
    expect(proj?.fx).toBeCloseTo(50, 6);
    expect(proj?.fy).toBeCloseTo(26.65, 6);
  });
});
