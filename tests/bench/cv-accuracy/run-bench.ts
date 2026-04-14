/**
 * CV accuracy benchmark runner.
 *
 * Usage: bun run tests/bench/cv-accuracy/run-bench.ts
 *
 * Sweeps noise levels through the aggregator pipeline and reports how
 * the accuracy defenses hold up. This is the feedback loop — when we
 * tune a threshold, this tells us whether the tradeoff actually helps.
 */

import { JEFFERSON_EAGLES, JEFFERSON_EXPECTED } from './fixtures';
import { measure, printReport } from './measure';
import {
  degradeMatchupConfidence,
  injectFakeTendencies,
  injectJerseyOcrErrors,
  injectRoleMislabels,
} from './noise';
import { generateScenario } from './synthetic-games';

function run() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  CV accuracy benchmark — Jefferson Eagles scenario');
  console.log('  3 games × 30 plays = 90 plays');
  console.log('  Ground truth:');
  console.log('    CB #24 gives up ~4.1yd avg sep to WR #88 (all 3 games)  → expect trust=high');
  console.log('    S #9 gives up ~3.5yd avg sep to WR #11 (games 1 & 3)    → expect trust=medium');
  console.log('    CB #21 gives up 5.0yd in game 2 only (single-game)      → expect trust != high');
  console.log('    WR #88 hits 8-9 yds/s across 3 games                     → expect trust=high');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const scenario = JEFFERSON_EAGLES;
  const expected = {
    expectedHighTrust: JEFFERSON_EXPECTED.highTrustDefenders,
    expectedMediumTrust: JEFFERSON_EXPECTED.mediumTrustDefenders,
    mustNotBeHighTrust: JEFFERSON_EXPECTED.mustNotBeHighTrust,
    highTrustOffense: JEFFERSON_EXPECTED.highTrustOffense,
  };

  // 1. Clean baseline
  const clean = generateScenario(scenario);
  printReport(
    measure({ scenario, plays: clean, noiseLabel: 'clean baseline (no noise)', ...expected }),
  );

  // 2. Jersey OCR error sweep
  for (const rate of [0.1, 0.2, 0.3]) {
    const noisy = injectJerseyOcrErrors(clean, rate);
    printReport(
      measure({
        scenario,
        plays: noisy,
        noiseLabel: `jersey OCR error rate = ${(rate * 100).toFixed(0)}%`,
        ...expected,
      }),
    );
  }

  // 3. Role mis-label sweep
  for (const rate of [0.1, 0.2, 0.3]) {
    const noisy = injectRoleMislabels(clean, rate);
    printReport(
      measure({
        scenario,
        plays: noisy,
        noiseLabel: `role mis-label rate = ${(rate * 100).toFixed(0)}%`,
        ...expected,
      }),
    );
  }

  // 4. Confidence degradation sweep
  for (const drop of [0.1, 0.25, 0.4]) {
    const noisy = degradeMatchupConfidence(clean, drop);
    printReport(
      measure({
        scenario,
        plays: noisy,
        noiseLabel: `global confidence -${drop.toFixed(2)} (sim: noisy film)`,
        ...expected,
      }),
    );
  }

  // 5. Fake-tendency injection sweep — simulates sideline / ref noise
  for (const fakes of [2, 5, 10]) {
    const noisy = injectFakeTendencies(clean, fakes);
    printReport(
      measure({
        scenario,
        plays: noisy,
        noiseLabel: `${fakes} fake matchups per game (noise tracks)`,
        fakeDefenderKeys: ['CB#77'],
        ...expected,
      }),
    );
  }

  // 6. Combined realistic noise profile
  const combined = injectJerseyOcrErrors(
    injectRoleMislabels(
      injectFakeTendencies(degradeMatchupConfidence(clean, 0.15), 3),
      0.08,
    ),
    0.12,
  );
  printReport(
    measure({
      scenario,
      plays: combined,
      noiseLabel: 'REALISTIC combined noise (12% OCR err, 8% role err, -0.15 conf, 3 fakes/game)',
      fakeDefenderKeys: ['CB#77'],
      ...expected,
    }),
  );

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Success criteria:');
  console.log('    - Expected high-trust (CB#24, WR#88) survive clean baseline');
  console.log('    - Under realistic noise, no "single-game leak" or fake-tendency leak');
  console.log('    - Under extreme noise, defenders may demote to medium (OK) but not');
  console.log('      become false positives in high-trust tier');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

run();
