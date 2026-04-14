/**
 * Unit tests for the walkthrough prompt-header string composition.
 *
 * These are the literal strings Claude sees above the per-play JSON.
 * If a header's wording regresses, insights get worse — so we assert
 * on structure + key content.
 */

import { describe, expect, it } from 'vitest';
import {
  buildAnalyticsHeader,
  buildCvHeader,
  buildDefenderHeader,
  buildExplosiveHeader,
  buildMotionHeader,
  buildOffenseHeader,
  buildPersonnelHeader,
  buildQuarterHeader,
  buildRouteCoverageHeader,
  buildSituationalHeader,
} from '@/lib/scouting/prompt-headers';
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
} from '@/lib/cv/track-analytics';

describe('buildDefenderHeader', () => {
  it('returns empty string for an empty list', () => {
    expect(buildDefenderHeader([])).toBe('');
  });

  it('labels jersey-less defenders as "jersey unreadable"', () => {
    const h = buildDefenderHeader([
      {
        role: 'CB',
        matchupCount: 3,
        avgSeparationYards: 4.1,
        worstSeparationYards: 6.2,
        avgClosingYps: 2.3,
        avgOffenseSpeedYps: 7.5,
        trackIds: ['t1', 't2', 't3'],
        meanConfidence: 0.6,
        trust: 'medium',
      },
    ]);
    expect(h).toContain('CB (jersey unreadable)');
    expect(h).toContain('avg sep 4.1yd');
    expect(h).toContain('avg closing 2.3 yds/s');
  });

  it('uses jersey when present', () => {
    const def: DefenderTendency = {
      jersey: '24',
      role: 'CB',
      matchupCount: 5,
      avgSeparationYards: 3.5,
      worstSeparationYards: 6,
      avgClosingYps: 2,
      avgOffenseSpeedYps: 8,
      trackIds: [],
      meanConfidence: 0.8,
      trust: 'high',
    };
    expect(buildDefenderHeader([def])).toContain('CB #24: 5 matchups');
  });
});

describe('buildOffenseHeader', () => {
  it('returns empty string for an empty list', () => {
    expect(buildOffenseHeader([])).toBe('');
  });

  it('renders offense playmaker rows', () => {
    const off: OffensiveTendency = {
      jersey: '88',
      role: 'WR',
      matchupCount: 6,
      avgMaxSpeedYps: 8.4,
      bestSeparationYards: 5.2,
      avgSeparationYards: 3.9,
      trackIds: [],
      meanConfidence: 0.75,
      trust: 'high',
    };
    const h = buildOffenseHeader([off]);
    expect(h).toContain('WR #88: 6 snaps');
    expect(h).toContain('avg sep 3.9yd');
    expect(h).toContain('avg peak speed 8.4 yds/s');
  });
});

describe('buildPersonnelHeader', () => {
  it('shows dominant formation only when ≥50%', () => {
    const pt: PersonnelTendency = {
      personnel: '12',
      count: 10,
      passPct: 20,
      runPct: 80,
      dominantFormation: { name: 'I-Form', pct: 40 },
      avgYardsGained: 4.3,
      explosivePct: 10,
    };
    const hidden = buildPersonnelHeader([pt]);
    expect(hidden).not.toContain('I-Form');
    const shown = buildPersonnelHeader([{ ...pt, dominantFormation: { name: 'I-Form', pct: 60 } }]);
    expect(shown).toContain('I-Form 60%');
  });
});

describe('buildMotionHeader', () => {
  it('surfaces a dominant direction only at ≥60%', () => {
    const m: MotionTendency = {
      motion: 'jet right',
      count: 5,
      passPct: 20,
      runPct: 80,
      avgYardsGained: 6.4,
      explosivePct: 20,
      dominantDirection: { name: 'Right', pct: 59 }, // just below threshold
    };
    expect(buildMotionHeader([m])).not.toContain('Right 59%');
    expect(buildMotionHeader([{ ...m, dominantDirection: { name: 'Right', pct: 70 } }]))
      .toContain('Right 70%');
  });
});

describe('buildQuarterHeader', () => {
  it('emits one row per quarter', () => {
    const q: QuarterTendency = {
      quarter: 4,
      count: 8,
      passPct: 85,
      runPct: 15,
      avgYardsGained: 7.1,
      explosivePct: 25,
    };
    expect(buildQuarterHeader([q])).toContain('Q4 (n=8): 85% pass / 15% run');
  });

  it('appends dominant play type when set', () => {
    const q: QuarterTendency = {
      quarter: 1,
      count: 10,
      passPct: 60,
      runPct: 40,
      avgYardsGained: 5,
      explosivePct: 0,
      dominantPlayType: { name: 'Pass', pct: 60 },
    };
    expect(buildQuarterHeader([q])).toContain('Pass 60%');
  });
});

describe('buildExplosiveHeader', () => {
  it('renders a row per play with [playId] blurb', () => {
    const e: ExplosivePlay = {
      playId: 'p42',
      gainLoss: 42,
      blurb: '3&7 · Q2 · Trips Rt · Pass Right · four_verts vs cover_3 → 42-yd gain (TD)',
    };
    const h = buildExplosiveHeader([e]);
    expect(h).toContain('[p42]');
    expect(h).toContain('42-yd gain');
  });
});

describe('buildRouteCoverageHeader', () => {
  it('formats each cell with count + avg + best + explosive%', () => {
    const c: RouteVsCoverageCell = {
      routeConcept: 'mesh',
      coverage: 'cover_3',
      count: 4,
      avgYards: 11.2,
      bestYards: 24,
      explosivePct: 50,
    };
    const h = buildRouteCoverageHeader([c]);
    expect(h).toContain('mesh vs cover_3: 4 plays, avg 11.2yd, best 24yd, explosive 50%');
  });
});

describe('buildSituationalHeader', () => {
  it('suppresses pressure below 50% and rotation below 30%', () => {
    const s: SituationalBucket = {
      situation: '3rd & long',
      count: 8,
      passPct: 85,
      runPct: 15,
      avgYardsGained: 6.4,
      dominantCoverage: { name: 'cover_3', pct: 60 },
      dominantPressure: { name: 'base_4', pct: 30 }, // below threshold
      rotationPct: 20, // below threshold
    };
    const h = buildSituationalHeader([s]);
    expect(h).toContain('cover_3 60%');
    expect(h).not.toContain('base_4');
    expect(h).not.toContain('rotates post-snap');
  });

  it('surfaces pressure ≥50% and rotation ≥30%', () => {
    const s: SituationalBucket = {
      situation: '3rd & long',
      count: 8,
      passPct: 85,
      runPct: 15,
      avgYardsGained: 6.4,
      dominantCoverage: { name: 'cover_3', pct: 60 },
      dominantPressure: { name: 'lb_blitz', pct: 55 },
      rotationPct: 40,
    };
    const h = buildSituationalHeader([s]);
    expect(h).toContain('lb_blitz 55%');
    expect(h).toContain('rotates post-snap 40%');
  });
});

describe('buildCvHeader', () => {
  it('returns empty string when no plays are field-registered', () => {
    const agg: OpponentAnalytics = {
      fieldRegisteredPlays: 0,
      totalTrackedPlays: 10,
      avgPeakSpeedYps: 0,
      avgPlayDurationSeconds: 0,
      avgMaxDepthYards: 0,
      byPlayType: [],
    };
    expect(buildCvHeader(agg, '', '')).toBe('');
  });

  it('folds defender + offense blocks inside the CV header', () => {
    const agg: OpponentAnalytics = {
      fieldRegisteredPlays: 20,
      totalTrackedPlays: 30,
      avgPeakSpeedYps: 7.4,
      avgPlayDurationSeconds: 4.2,
      avgMaxDepthYards: 18,
      byPlayType: [
        { playType: 'Pass', count: 12, avgPeakSpeedYps: 8, avgDurationSeconds: 5, avgMaxDepthYards: 24 },
      ],
    };
    const h = buildCvHeader(agg, '\nDEF\n', '\nOFF\n');
    expect(h).toContain('CV Analytics Summary (from 20 field-registered plays)');
    expect(h).toContain('Pass(n=12, peak=8.0yps, depth=24.0yds)');
    expect(h).toContain('\nDEF\n');
    expect(h).toContain('\nOFF\n');
  });
});

describe('buildAnalyticsHeader', () => {
  const emptyAgg: OpponentAnalytics = {
    fieldRegisteredPlays: 0,
    totalTrackedPlays: 0,
    avgPeakSpeedYps: 0,
    avgPlayDurationSeconds: 0,
    avgMaxDepthYards: 0,
    byPlayType: [],
  };

  it('returns empty string when every aggregate is empty', () => {
    expect(
      buildAnalyticsHeader({
        aggregated: emptyAgg,
        defenders: [],
        offense: [],
        personnel: [],
        motions: [],
        quarters: [],
        explosives: [],
        routeVsCoverage: [],
        situations: [],
      }),
    ).toBe('');
  });

  it('assembles blocks in the expected order: CV (incl. def+off) → explosive → personnel → motion → quarter → route×cov → situational', () => {
    const header = buildAnalyticsHeader({
      aggregated: {
        fieldRegisteredPlays: 5,
        totalTrackedPlays: 5,
        avgPeakSpeedYps: 7,
        avgPlayDurationSeconds: 4,
        avgMaxDepthYards: 20,
        byPlayType: [],
      },
      defenders: [
        { jersey: '24', role: 'CB', matchupCount: 3, avgSeparationYards: 4, worstSeparationYards: 6, avgClosingYps: 2, avgOffenseSpeedYps: 8, trackIds: [], meanConfidence: 0.7, trust: 'medium' },
      ],
      offense: [
        { jersey: '88', role: 'WR', matchupCount: 3, avgMaxSpeedYps: 9, bestSeparationYards: 5, avgSeparationYards: 4, trackIds: [], meanConfidence: 0.7, trust: 'medium' },
      ],
      personnel: [
        { personnel: '12', count: 4, passPct: 25, runPct: 75, avgYardsGained: 3, explosivePct: 0 },
      ],
      motions: [
        { motion: 'jet right', count: 3, passPct: 0, runPct: 100, avgYardsGained: 6, explosivePct: 33 },
      ],
      quarters: [
        { quarter: 4, count: 5, passPct: 80, runPct: 20, avgYardsGained: 6, explosivePct: 20 },
      ],
      explosives: [{ playId: 'p1', gainLoss: 42, blurb: 'big TD' }],
      routeVsCoverage: [
        { routeConcept: 'mesh', coverage: 'cover_3', count: 3, avgYards: 11, bestYards: 18, explosivePct: 33 },
      ],
      situations: [
        { situation: '3rd & long', count: 6, passPct: 80, runPct: 20, avgYardsGained: 7, rotationPct: 0 },
      ],
    });

    const cvIdx = header.indexOf('CV Analytics Summary');
    const explIdx = header.indexOf('Biggest outlier plays');
    const persIdx = header.indexOf('Personnel tendencies');
    const motionIdx = header.indexOf('Motion tells');
    const quarterIdx = header.indexOf('Quarter-by-quarter');
    const rvcIdx = header.indexOf('Route concept × coverage');
    const sitIdx = header.indexOf('Situational tendencies');

    expect(cvIdx).toBeGreaterThanOrEqual(0);
    expect(cvIdx).toBeLessThan(explIdx);
    expect(explIdx).toBeLessThan(persIdx);
    expect(persIdx).toBeLessThan(motionIdx);
    expect(motionIdx).toBeLessThan(quarterIdx);
    expect(quarterIdx).toBeLessThan(rvcIdx);
    expect(rvcIdx).toBeLessThan(sitIdx);

    // Defender + offense blocks sit INSIDE the CV section (before explosives)
    const defIdx = header.indexOf('Defender tendencies');
    const offIdx = header.indexOf('Offensive playmakers');
    expect(defIdx).toBeGreaterThan(cvIdx);
    expect(defIdx).toBeLessThan(explIdx);
    expect(offIdx).toBeGreaterThan(cvIdx);
    expect(offIdx).toBeLessThan(explIdx);
  });

  it('omits sections that are empty even when others are populated', () => {
    const header = buildAnalyticsHeader({
      aggregated: emptyAgg,
      defenders: [],
      offense: [],
      personnel: [
        { personnel: '11', count: 5, passPct: 80, runPct: 20, avgYardsGained: 7, explosivePct: 20 },
      ],
      motions: [],
      quarters: [],
      explosives: [],
      routeVsCoverage: [],
      situations: [],
    });
    expect(header).toContain('Personnel tendencies');
    expect(header).not.toContain('CV Analytics Summary');
    expect(header).not.toContain('Motion tells');
    expect(header).not.toContain('Biggest outlier plays');
  });
});
