/**
 * Accuracy invariants — runs the synthetic-truth scenario as a unit test
 * and asserts that the pipeline recovers known tendencies across every
 * realistic noise profile. CI catches regressions.
 *
 * The full bench (`bun run bench:cv-accuracy`) prints a sweep table for
 * humans. This test asserts the SAME outcomes machine-readably, so a
 * threshold change that breaks recovery shows up as a failing test
 * rather than a lost line in someone's terminal.
 */

import { describe, expect, it } from 'vitest';
import { JEFFERSON_EAGLES, JEFFERSON_EXPECTED } from '../../bench/cv-accuracy/fixtures';
import { measure } from '../../bench/cv-accuracy/measure';
import {
  degradeMatchupConfidence,
  injectFakeTendencies,
  injectJerseyOcrErrors,
  injectRoleMislabels,
} from '../../bench/cv-accuracy/noise';
import { generateScenario } from '../../bench/cv-accuracy/synthetic-games';

const baseExpected = {
  expectedHighTrust: JEFFERSON_EXPECTED.highTrustDefenders,
  expectedMediumTrust: JEFFERSON_EXPECTED.mediumTrustDefenders,
  mustNotBeHighTrust: JEFFERSON_EXPECTED.mustNotBeHighTrust,
  highTrustOffense: JEFFERSON_EXPECTED.highTrustOffense,
};

describe('accuracy invariants — synthetic Jefferson scenario', () => {
  it('clean baseline: every expected high-trust defender surfaces, no false positives', () => {
    const plays = generateScenario(JEFFERSON_EAGLES);
    const r = measure({
      scenario: JEFFERSON_EAGLES,
      plays,
      noiseLabel: 'clean',
      ...baseExpected,
    });
    expect(r.expectedHighMissed).toEqual([]);
    expect(r.unexpectedHigh).toEqual([]);
    expect(r.singleGameLeakedAsHigh).toEqual([]);
    expect(r.fakeTendenciesInOutput).toEqual([]);
  });

  it('low-noise OCR (10%): expected high tier survives, no leaks', () => {
    const plays = injectJerseyOcrErrors(generateScenario(JEFFERSON_EAGLES), 0.1);
    const r = measure({
      scenario: JEFFERSON_EAGLES,
      plays,
      noiseLabel: '10% OCR err',
      ...baseExpected,
    });
    // Under low noise we want at least the dominant tendency (CB#24) to survive
    expect(r.expectedHighFound).toContain('CB#24');
    expect(r.singleGameLeakedAsHigh).toEqual([]);
    expect(r.fakeTendenciesInOutput).toEqual([]);
  });

  it('low-noise role mislabels (10%): no false high-trust, no single-game leaks', () => {
    const plays = injectRoleMislabels(generateScenario(JEFFERSON_EAGLES), 0.1);
    const r = measure({
      scenario: JEFFERSON_EAGLES,
      plays,
      noiseLabel: '10% role err',
      ...baseExpected,
    });
    expect(r.expectedHighFound).toContain('CB#24');
    expect(r.singleGameLeakedAsHigh).toEqual([]);
  });

  it('fake-tendency injection (10/game): zero leakage of noise tracks into output', () => {
    const plays = injectFakeTendencies(generateScenario(JEFFERSON_EAGLES), 10);
    const r = measure({
      scenario: JEFFERSON_EAGLES,
      plays,
      noiseLabel: '10 fakes/game',
      fakeDefenderKeys: ['CB#77'],
      ...baseExpected,
    });
    // Expected high-trust still survives
    expect(r.expectedHighFound).toContain('CB#24');
    // No fakes anywhere in defender or offense rollups
    expect(r.fakeTendenciesInOutput).toEqual([]);
    expect(r.singleGameLeakedAsHigh).toEqual([]);
  });

  it('confidence collapse (-0.4): high-trust tendencies properly demote to low (no false-positive leak)', () => {
    const plays = degradeMatchupConfidence(generateScenario(JEFFERSON_EAGLES), 0.4);
    const r = measure({
      scenario: JEFFERSON_EAGLES,
      plays,
      noiseLabel: 'conf -0.4',
      ...baseExpected,
    });
    // Under extreme confidence collapse, we LOSE the tendencies but
    // we don't INVENT them — both are graceful failure modes.
    expect(r.unexpectedHigh).toEqual([]);
    expect(r.singleGameLeakedAsHigh).toEqual([]);
    // Specifically: nothing high-trust at all (everything demoted)
    expect(r.highTrustDefenders).toBe(0);
  });

  it('realistic combined noise (12% OCR + 8% role + -0.15 conf + 3 fakes/game)', () => {
    const base = generateScenario(JEFFERSON_EAGLES);
    const noisy = injectJerseyOcrErrors(
      injectRoleMislabels(injectFakeTendencies(degradeMatchupConfidence(base, 0.15), 3), 0.08),
      0.12,
    );
    const r = measure({
      scenario: JEFFERSON_EAGLES,
      plays: noisy,
      noiseLabel: 'realistic combined',
      fakeDefenderKeys: ['CB#77'],
      ...baseExpected,
    });
    // The most important invariants under realistic noise:
    //   - Real tendencies DON'T fully disappear
    //   - Single-game patterns DON'T leak as high trust
    //   - Fake noise tracks DON'T appear in the output
    expect(r.expectedHighFound.length).toBeGreaterThan(0);
    expect(r.singleGameLeakedAsHigh).toEqual([]);
    expect(r.fakeTendenciesInOutput).toEqual([]);
  });
});
