/**
 * Unit tests for cross-play jersey↔role reconciliation.
 */

import { describe, expect, it } from 'vitest';
import type { KeyMatchup, PlayAnalytics } from '@/lib/cv/track-analytics';
import { reconcileMatchupJerseyRoles } from '@/lib/cv/track-consistency';

function matchup(
  overrides: Partial<KeyMatchup> & { offRole: string; offJersey?: string; defRole: string; defJersey?: string },
): KeyMatchup {
  return {
    offense: { trackId: 'off-t', role: overrides.offRole, jersey: overrides.offJersey },
    defense: { trackId: 'def-t', role: overrides.defRole, jersey: overrides.defJersey },
    minSeparationYards: overrides.minSeparationYards ?? 3,
    atT: overrides.atT ?? 1,
    closingYps: overrides.closingYps ?? 2,
    offenseMaxSpeedYps: overrides.offenseMaxSpeedYps ?? 7,
    confidence: overrides.confidence ?? 0.8,
  };
}

function play(matchups: KeyMatchup[]): PlayAnalytics {
  return {
    tracks: [],
    peakSpeedYps: 0,
    playDurationSeconds: 2,
    fieldSpace: true,
    keyMatchups: matchups,
  };
}

describe('reconcileMatchupJerseyRoles', () => {
  it('leaves things alone when every jersey has a consistent role', () => {
    const input: Array<PlayAnalytics | null> = [
      play([matchup({ offRole: 'WR', offJersey: '88', defRole: 'CB', defJersey: '24' })]),
      play([matchup({ offRole: 'WR', offJersey: '88', defRole: 'CB', defJersey: '24' })]),
    ];
    const result = reconcileMatchupJerseyRoles(input);
    expect(result.inconsistencies).toEqual([]);
    expect(result.analytics[0]?.keyMatchups?.[0]?.confidence).toBe(0.8);
  });

  it('zeros confidence on the minority-role instance when a jersey has ≥60% dominance', () => {
    // #88: WR in 4 plays, CB in 1 play → 80% WR dominance, CB is noise
    const input: Array<PlayAnalytics | null> = [
      play([matchup({ offRole: 'WR', offJersey: '88', defRole: 'S', defJersey: '9' })]),
      play([matchup({ offRole: 'WR', offJersey: '88', defRole: 'S', defJersey: '9' })]),
      play([matchup({ offRole: 'WR', offJersey: '88', defRole: 'S', defJersey: '9' })]),
      play([matchup({ offRole: 'WR', offJersey: '88', defRole: 'S', defJersey: '9' })]),
      play([matchup({ offRole: 'CB', offJersey: '88', defRole: 'S', defJersey: '9' })]),
    ];
    const result = reconcileMatchupJerseyRoles(input);
    expect(result.inconsistencies).toHaveLength(1);
    expect(result.inconsistencies[0]?.jersey).toBe('88');
    expect(result.inconsistencies[0]?.dominantRole).toBe('WR');
    expect(result.inconsistencies[0]?.instancesReconciled).toBe(1);
    // The 5th play (CB #88) had its matchup zeroed
    expect(result.analytics[4]?.keyMatchups?.[0]?.confidence).toBe(0);
    // The first 4 (WR #88) are untouched
    expect(result.analytics[0]?.keyMatchups?.[0]?.confidence).toBe(0.8);
  });

  it('leaves ambiguous jerseys (50/50 split) alone — might be a two-way player', () => {
    const input: Array<PlayAnalytics | null> = [
      play([matchup({ offRole: 'WR', offJersey: '88', defRole: 'CB', defJersey: '24' })]),
      play([matchup({ offRole: 'WR', offJersey: '88', defRole: 'CB', defJersey: '24' })]),
      play([matchup({ offRole: 'CB', offJersey: '88', defRole: 'WR', defJersey: '24' })]),
      play([matchup({ offRole: 'CB', offJersey: '88', defRole: 'WR', defJersey: '24' })]),
    ];
    const result = reconcileMatchupJerseyRoles(input);
    expect(result.inconsistencies).toEqual([]);
    // All confidences untouched
    for (const a of result.analytics) {
      for (const m of a?.keyMatchups ?? []) {
        expect(m.confidence).toBe(0.8);
      }
    }
  });

  it('weights votes by matchup confidence — a low-conf minority has less pull', () => {
    // 2 high-conf WR plays + 2 low-conf CB plays.
    // Raw count: 50/50. Weighted: WR wins because its confidences are higher.
    const input: Array<PlayAnalytics | null> = [
      play([matchup({ offRole: 'WR', offJersey: '88', defRole: 'CB', defJersey: '24', confidence: 0.9 })]),
      play([matchup({ offRole: 'WR', offJersey: '88', defRole: 'CB', defJersey: '24', confidence: 0.9 })]),
      play([matchup({ offRole: 'WR', offJersey: '88', defRole: 'CB', defJersey: '24', confidence: 0.9 })]),
      play([matchup({ offRole: 'CB', offJersey: '88', defRole: 'WR', defJersey: '24', confidence: 0.2 })]),
    ];
    const result = reconcileMatchupJerseyRoles(input);
    const jersey88 = result.inconsistencies.find((i) => i.jersey === '88');
    expect(jersey88?.dominantRole).toBe('WR');
    expect(jersey88?.instancesReconciled).toBe(1);
  });

  it('ignores jerseys that appear in only one role (no conflict)', () => {
    const input: Array<PlayAnalytics | null> = [
      play([matchup({ offRole: 'WR', offJersey: '88', defRole: 'CB', defJersey: '24' })]),
      play([matchup({ offRole: 'WR', offJersey: '88', defRole: 'CB', defJersey: '24' })]),
      play([matchup({ offRole: 'WR', offJersey: '88', defRole: 'CB', defJersey: '24' })]),
    ];
    const result = reconcileMatchupJerseyRoles(input);
    expect(result.inconsistencies).toEqual([]);
  });

  it('handles null analytics gracefully', () => {
    const input: Array<PlayAnalytics | null> = [null, null, null];
    const result = reconcileMatchupJerseyRoles(input);
    expect(result.inconsistencies).toEqual([]);
    expect(result.analytics).toEqual(input);
  });

  it('handles jersey-less matchups (ignores them for voting)', () => {
    const input: Array<PlayAnalytics | null> = [
      play([matchup({ offRole: 'WR', defRole: 'CB' })]), // no jerseys
      play([matchup({ offRole: 'WR', offJersey: '88', defRole: 'CB', defJersey: '24' })]),
    ];
    const result = reconcileMatchupJerseyRoles(input);
    expect(result.inconsistencies).toEqual([]);
  });
});
