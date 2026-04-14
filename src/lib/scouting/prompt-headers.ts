/**
 * Pure string composition for the walkthrough prompt's aggregated
 * headers. Lives here (not in the route) so tests can assert on what
 * Claude actually sees without pulling in the DB client.
 *
 * Each builder is a tiny formatter — the signal-extraction logic lives
 * in src/lib/cv/track-analytics.ts. This module is only about rendering
 * those aggregates into the exact strings the prompt embeds.
 */

import type {
  DefenderTendency,
  ExplosivePlay,
  MotionTendency,
  OffensiveTendency,
  OpponentAnalytics,
  PersonnelTendency,
  QuarterTendency,
  RouteVsCoverageCell,
  SituationalBucket,
} from '../cv/track-analytics';

export function buildDefenderHeader(defenders: DefenderTendency[]): string {
  if (defenders.length === 0) return '';
  const rows = defenders.map((d) => {
    const name = d.jersey ? `${d.role} #${d.jersey}` : `${d.role} (jersey unreadable)`;
    return `  [trust=${d.trust}, conf=${d.meanConfidence}, games=${d.gameCount}] ${name}: ${d.matchupCount} matchups, avg sep ${d.avgSeparationYards}yd, worst ${d.worstSeparationYards}yd, avg closing ${d.avgClosingYps} yds/s`;
  });
  return `\nDefender tendencies (most-exploited first, from matchup data):
  Trust legend: high = cite by name; medium = cite as a pattern; low = DO NOT cite.
  Anonymous (jersey unreadable) tendencies should never be cited as a specific player.
  games=N shows how many distinct games this pattern appeared in. A "high trust"
  tendency with games=1 is weaker than games=3+ — it might be a specific-opponent
  matchup call rather than a core scheme habit.
${rows.join('\n')}\n`;
}

export function buildOffenseHeader(offense: OffensiveTendency[]): string {
  if (offense.length === 0) return '';
  const rows = offense.map((o) => {
    const name = o.jersey ? `${o.role} #${o.jersey}` : `${o.role} (jersey unreadable)`;
    return `  [trust=${o.trust}, conf=${o.meanConfidence}, games=${o.gameCount}] ${name}: ${o.matchupCount} snaps, avg sep ${o.avgSeparationYards}yd, best ${o.bestSeparationYards}yd, avg peak speed ${o.avgMaxSpeedYps} yds/s`;
  });
  return `\nOffensive playmakers (their threats, sorted by consistency of separation):
  Same trust rules as defenders apply. Cross-game games=N rule applies too.
${rows.join('\n')}\n`;
}

export function buildPersonnelHeader(personnel: PersonnelTendency[]): string {
  if (personnel.length === 0) return '';
  const rows = personnel.map((t) => {
    const form = t.dominantFormation && t.dominantFormation.pct >= 50
      ? `, ${t.dominantFormation.name} ${t.dominantFormation.pct}%`
      : '';
    return `  ${t.personnel} personnel (n=${t.count}): ${t.passPct}% pass / ${t.runPct}% run${form}, avg ${t.avgYardsGained}yd, explosive ${t.explosivePct}%`;
  });
  return `\nPersonnel tendencies (what they call out of each grouping):\n${rows.join('\n')}\n`;
}

export function buildMotionHeader(motions: MotionTendency[]): string {
  if (motions.length === 0) return '';
  const rows = motions.map((m) => {
    const dir = m.dominantDirection && m.dominantDirection.pct >= 60
      ? `, ${m.dominantDirection.name} ${m.dominantDirection.pct}%`
      : '';
    return `  "${m.motion}" (n=${m.count}): ${m.passPct}% pass / ${m.runPct}% run${dir}, avg ${m.avgYardsGained}yd`;
  });
  return `\nMotion tells (pre-snap motion → what happens):\n${rows.join('\n')}\n`;
}

export function buildQuarterHeader(quarters: QuarterTendency[]): string {
  if (quarters.length === 0) return '';
  const rows = quarters.map((q) => {
    const dom = q.dominantPlayType ? `, ${q.dominantPlayType.name} ${q.dominantPlayType.pct}%` : '';
    return `  Q${q.quarter} (n=${q.count}): ${q.passPct}% pass / ${q.runPct}% run${dom}, avg ${q.avgYardsGained}yd, explosive ${q.explosivePct}%`;
  });
  return `\nQuarter-by-quarter play calling:\n${rows.join('\n')}\n`;
}

export function buildExplosiveHeader(explosives: ExplosivePlay[]): string {
  if (explosives.length === 0) return '';
  const rows = explosives.map((e) => `  [${e.playId}] ${e.blurb}`);
  return `\nBiggest outlier plays (top gains + top losses, by magnitude):\n${rows.join('\n')}\n`;
}

export function buildRouteCoverageHeader(cells: RouteVsCoverageCell[]): string {
  if (cells.length === 0) return '';
  const rows = cells.map(
    (c) =>
      `  ${c.routeConcept} vs ${c.coverage}: ${c.count} plays, avg ${c.avgYards}yd, best ${c.bestYards}yd, explosive ${c.explosivePct}%`,
  );
  return `\nRoute concept × coverage heatmap (top cells, ≥2 samples each):\n${rows.join('\n')}\n`;
}

export function buildSituationalHeader(buckets: SituationalBucket[]): string {
  if (buckets.length === 0) return '';
  const rows = buckets.map((s) => {
    const cov = s.dominantCoverage ? `, ${s.dominantCoverage.name} ${s.dominantCoverage.pct}%` : '';
    const pressure = s.dominantPressure && s.dominantPressure.pct >= 50
      ? `, ${s.dominantPressure.name} ${s.dominantPressure.pct}%`
      : '';
    const rotation = s.rotationPct >= 30 ? `, rotates post-snap ${s.rotationPct}%` : '';
    return `  ${s.situation} (n=${s.count}): ${s.passPct}% pass / ${s.runPct}% run${cov}${pressure}${rotation}, avg ${s.avgYardsGained}yd`;
  });
  return `\nSituational tendencies (by down & distance):\n${rows.join('\n')}\n`;
}

export function buildCvHeader(
  aggregated: OpponentAnalytics,
  defenderHeader: string,
  offenseHeader: string,
): string {
  if (aggregated.fieldRegisteredPlays === 0) return '';
  const byType = aggregated.byPlayType
    .map(
      (t) =>
        `${t.playType}(n=${t.count}, peak=${t.avgPeakSpeedYps.toFixed(1)}yps, depth=${t.avgMaxDepthYards?.toFixed(1) ?? '?'}yds)`,
    )
    .join(', ');
  return `\nCV Analytics Summary (from ${aggregated.fieldRegisteredPlays} field-registered plays):
  Avg peak speed: ${aggregated.avgPeakSpeedYps.toFixed(1)} yds/s
  Avg play duration: ${aggregated.avgPlayDurationSeconds.toFixed(1)} s
  Avg deepest route: ${aggregated.avgMaxDepthYards.toFixed(1)} yds downfield
  By play type: ${byType}${defenderHeader}${offenseHeader}`;
}

export interface AnalyticsHeaderParts {
  aggregated: OpponentAnalytics;
  defenders: DefenderTendency[];
  offense: OffensiveTendency[];
  personnel: PersonnelTendency[];
  motions: MotionTendency[];
  quarters: QuarterTendency[];
  explosives: ExplosivePlay[];
  routeVsCoverage: RouteVsCoverageCell[];
  situations: SituationalBucket[];
}

/**
 * Assemble every aggregated-tendency block into the single
 * analyticsHeader string the walkthrough prompt embeds between the
 * "Opponent:" line and the per-play JSON.
 */
export function buildAnalyticsHeader(parts: AnalyticsHeaderParts): string {
  const defenderHeader = buildDefenderHeader(parts.defenders);
  const offenseHeader = buildOffenseHeader(parts.offense);
  const cvHeader = buildCvHeader(parts.aggregated, defenderHeader, offenseHeader);
  const personnelHeader = buildPersonnelHeader(parts.personnel);
  const motionHeader = buildMotionHeader(parts.motions);
  const quarterHeader = buildQuarterHeader(parts.quarters);
  const explosiveHeader = buildExplosiveHeader(parts.explosives);
  const routeCoverageHeader = buildRouteCoverageHeader(parts.routeVsCoverage);
  const situationalHeader = buildSituationalHeader(parts.situations);

  return `${cvHeader}${explosiveHeader}${personnelHeader}${motionHeader}${quarterHeader}${routeCoverageHeader}${situationalHeader}`;
}
