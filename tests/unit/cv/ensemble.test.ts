import { describe, expect, it } from 'vitest';
import {
  checkAgreement,
  CV_CONFIDENCE_THRESHOLDS,
  getCvThreshold,
  requiresDualModelAgreement,
} from '@/lib/cv';

describe('ensemble agreement logic', () => {
  describe('coverage_shell agreement', () => {
    it('agrees when both models return the same coverage', () => {
      const a = { coverage: 'cover_3', confidence: 0.95, reasoning: 'test' };
      const b = { coverage: 'cover_3', confidence: 0.92, reasoning: 'test' };
      expect(checkAgreement('coverage_shell', a, b)).toBe(true);
    });

    it('disagrees when models return different coverages', () => {
      const a = { coverage: 'cover_3', confidence: 0.95, reasoning: 'test' };
      const b = { coverage: 'cover_2', confidence: 0.90, reasoning: 'test' };
      expect(checkAgreement('coverage_shell', a, b)).toBe(false);
    });
  });

  describe('pressure agreement', () => {
    it('agrees on pressure type', () => {
      const a = { type: 'lb_blitz', source: 'weak_side', confidence: 0.9, reasoning: 'test', rusherCount: 5 };
      const b = { type: 'lb_blitz', source: 'strong_side', confidence: 0.88, reasoning: 'test', rusherCount: 5 };
      // Agreement is on type, not source
      expect(checkAgreement('pressure', a, b)).toBe(true);
    });
  });

  describe('blocking_scheme agreement', () => {
    it('agrees on scheme', () => {
      const a = { scheme: 'inside_zone', confidence: 0.92, reasoning: 'test', pullingLinemen: 0 };
      const b = { scheme: 'inside_zone', confidence: 0.88, reasoning: 'test', pullingLinemen: 0 };
      expect(checkAgreement('blocking_scheme', a, b)).toBe(true);
    });
  });

  describe('player_positions agreement', () => {
    it('agrees when player counts are within 3', () => {
      const a = { playerCount: 22, confidence: 0.85 };
      const b = { playerCount: 20, confidence: 0.83 };
      expect(checkAgreement('player_positions', a, b)).toBe(true);
    });

    it('disagrees when player counts differ by more than 3', () => {
      const a = { playerCount: 22, confidence: 0.85 };
      const b = { playerCount: 15, confidence: 0.60 };
      expect(checkAgreement('player_positions', a, b)).toBe(false);
    });
  });
});

describe('vision threshold config', () => {
  it('uses stricter threshold for high-risk shell/disguise tags', () => {
    expect(CV_CONFIDENCE_THRESHOLDS.coverage_shell).toBeGreaterThan(0.9);
    expect(CV_CONFIDENCE_THRESHOLDS.coverage_disguise).toBeGreaterThan(
      CV_CONFIDENCE_THRESHOLDS.coverage_shell,
    );
  });

  it('falls back to default threshold for unknown tasks', () => {
    expect(getCvThreshold('unknown_task')).toBe(0.9);
  });

  it('requires dual-model agreement for high-risk tasks only', () => {
    expect(requiresDualModelAgreement('coverage_shell')).toBe(true);
    expect(requiresDualModelAgreement('pressure')).toBe(true);
    expect(requiresDualModelAgreement('blocking_scheme')).toBe(false);
  });

  it('keeps thresholds football-safe and monotonic enough for pipeline gating', () => {
    expect(getCvThreshold('coverage_disguise')).toBeGreaterThanOrEqual(
      getCvThreshold('pressure'),
    );
    expect(getCvThreshold('player_positions')).toBeLessThan(
      getCvThreshold('coverage_shell'),
    );
  });
});
