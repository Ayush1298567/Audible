/**
 * Measure how accurately the aggregators recover the known ground
 * truth from a (possibly noisy) set of synthetic plays.
 *
 * Metrics:
 *   - `highTrustRecall` — fraction of expected-high-trust defenders
 *     that actually ended up tagged trust='high'
 *   - `highTrustPrecision` — fraction of pipeline-high-trust defenders
 *     that were in the expected set (false positives = 1 - this)
 *   - `singleGameNeverHigh` — did ANY known single-game tendency leak
 *     through as high trust? Should always be false.
 *   - `fakeTendencyRate` — % of fabricated fake defenders (noise) that
 *     ended up in the top tendency list at all (any trust tier)
 */

import {
  aggregateMatchupsByDefender,
  aggregateMatchupsByOffense,
  type DefenderTendency,
  type OffensiveTendency,
} from '@/lib/cv/track-analytics';
import { reconcileMatchupJerseyRoles } from '@/lib/cv/track-consistency';
import type { GroundTruthScenario } from './fixtures';
import type { SyntheticPlay } from './synthetic-games';

const key = (role: string, jersey: string): string => `${role}#${jersey}`;

export interface AccuracyReport {
  noiseLabel: string;
  // Counts
  totalDefenders: number;
  totalOffense: number;
  highTrustDefenders: number;
  mediumTrustDefenders: number;
  lowTrustDefenders: number;
  // Expected-set metrics
  expectedHighFound: string[]; // which expected-high showed up as high
  expectedHighMissed: string[]; // expected-high that got demoted
  unexpectedHigh: string[]; // defenders NOT in expected set that got high
  // Invariants
  singleGameLeakedAsHigh: string[]; // known single-game tendencies that broke trust=high rule
  fakeTendenciesInOutput: string[]; // noise-injected fake defenders that made it into the tendency list
}

export function measure(args: {
  scenario: GroundTruthScenario;
  plays: SyntheticPlay[];
  noiseLabel: string;
  expectedHighTrust: string[]; // e.g., ['CB#24', 'S#9-as-high-maybe']
  expectedMediumTrust?: string[];
  mustNotBeHighTrust: string[];
  highTrustOffense?: string[];
  fakeDefenderKeys?: string[]; // e.g., ['CB#77']
}): AccuracyReport {
  // Match the walkthrough route's pipeline order:
  //   1. reconcileMatchupJerseyRoles cleans cross-play contradictions
  //   2. aggregators build tendencies with trust tiers
  const parsed = args.plays.map((p) => p.analytics);
  const reconciled = reconcileMatchupJerseyRoles(parsed);

  const aggInput = args.plays.map((p, idx) => ({
    analytics: reconciled.analytics[idx] ?? null,
    gameId: p.gameId,
  }));

  const defenders = aggregateMatchupsByDefender(aggInput);
  const offense = aggregateMatchupsByOffense(aggInput);

  const keyOf = (t: DefenderTendency | OffensiveTendency) =>
    t.jersey ? key(t.role, t.jersey) : `${t.role}#anon`;

  const expectedHigh = new Set(args.expectedHighTrust);
  const expectedMed = new Set(args.expectedMediumTrust ?? []);
  const mustNotHigh = new Set(args.mustNotBeHighTrust);
  const fakeKeys = new Set(args.fakeDefenderKeys ?? []);

  const highDefs = defenders.filter((d) => d.trust === 'high');
  const medDefs = defenders.filter((d) => d.trust === 'medium');
  const lowDefs = defenders.filter((d) => d.trust === 'low');

  const expectedHighFound: string[] = [];
  const expectedHighMissed: string[] = [];
  for (const exp of expectedHigh) {
    if (highDefs.some((d) => keyOf(d) === exp)) expectedHighFound.push(exp);
    else expectedHighMissed.push(exp);
  }

  const unexpectedHigh = highDefs
    .map((d) => keyOf(d))
    .filter((k) => !expectedHigh.has(k));

  const singleGameLeakedAsHigh = highDefs
    .map((d) => keyOf(d))
    .filter((k) => mustNotHigh.has(k));

  const allTendencies = [...defenders, ...offense];
  const fakeTendenciesInOutput = allTendencies
    .map((t) => keyOf(t))
    .filter((k) => fakeKeys.has(k));

  return {
    noiseLabel: args.noiseLabel,
    totalDefenders: defenders.length,
    totalOffense: offense.length,
    highTrustDefenders: highDefs.length,
    mediumTrustDefenders: medDefs.length,
    lowTrustDefenders: lowDefs.length,
    expectedHighFound,
    expectedHighMissed,
    unexpectedHigh,
    singleGameLeakedAsHigh,
    fakeTendenciesInOutput,
  };
}

export function printReport(r: AccuracyReport): void {
  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(`\n─── ${r.noiseLabel} ───`);
  console.log(
    `  def tiers:  high=${r.highTrustDefenders} med=${r.mediumTrustDefenders} low=${r.lowTrustDefenders} (of ${r.totalDefenders})`,
  );
  console.log(
    `  expected high found:   ${r.expectedHighFound.length > 0 ? r.expectedHighFound.join(',') : '(none)'}`,
  );
  console.log(
    `  expected high missed:  ${r.expectedHighMissed.length > 0 ? `⚠ ${r.expectedHighMissed.join(',')}` : '(none)'}`,
  );
  console.log(
    `  unexpected high:       ${r.unexpectedHigh.length > 0 ? `⚠ ${r.unexpectedHigh.join(',')}` : '(none)'}`,
  );
  console.log(
    `  single-game leak:      ${r.singleGameLeakedAsHigh.length > 0 ? `⚠ ${r.singleGameLeakedAsHigh.join(',')}` : 'OK'}`,
  );
  console.log(
    `  fake tendencies out:   ${r.fakeTendenciesInOutput.length > 0 ? `⚠ ${r.fakeTendenciesInOutput.join(',')}` : 'OK'}`,
  );
  void pad;
}
