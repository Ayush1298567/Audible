/* biome-ignore-all lint/style/noNonNullAssertion: tests deliberately access
   optional fields after asserting they exist. */
/**
 * Unit tests for the derived Friday call sheet.
 *
 * `bucketizeSituation` normalizes free-form recommendation situation
 * strings into coarse bucket labels. `buildCallSheet` groups every
 * recommendation across all insights by bucket.
 */

import { describe, expect, it } from 'vitest';
import {
  bucketizeSituation,
  buildCallSheet,
  renderCallSheetAsText,
} from '@/lib/scouting/call-sheet';
import type { Insight } from '@/lib/scouting/insights';

// Helper: build a minimal insight with N recommendations.
function mkInsight(
  id: string,
  headline: string,
  recs: Array<{ situation: string; call: string; rationale: string }>,
): Insight {
  return {
    id,
    rank: 1,
    headline,
    narrative: 'test narrative placeholder',
    evidenceCount: 3,
    examples: [],
    recommendations: recs,
  };
}

describe('bucketizeSituation', () => {
  it('maps "3rd & long" variants to "3rd & long"', () => {
    expect(bucketizeSituation('3rd & long vs Cover 3')).toBe('3rd & long');
    expect(bucketizeSituation('3rd & 8')).toBe('3rd & long');
    expect(bucketizeSituation('3rd & 12 with 2-minute tempo')).toBe('3rd & long');
  });

  it('maps "3rd & short" variants to "3rd & short"', () => {
    expect(bucketizeSituation('3rd & short')).toBe('3rd & short');
    expect(bucketizeSituation('3rd & 2')).toBe('3rd & short');
    expect(bucketizeSituation('3rd & 1 at the sticks')).toBe('3rd & short');
  });

  it('maps "3rd & medium" variants to "3rd & medium"', () => {
    expect(bucketizeSituation('3rd & 5')).toBe('3rd & medium');
    expect(bucketizeSituation('3rd & medium')).toBe('3rd & medium');
  });

  it('recognizes 4th down, red zone, 2-minute', () => {
    expect(bucketizeSituation('4th & 1 QB sneak')).toBe('4th down');
    expect(bucketizeSituation('red zone, 12 personnel')).toBe('red zone');
    expect(bucketizeSituation('inside the 10-yard line')).toBe('red zone');
    expect(bucketizeSituation('2-minute drill, trailing')).toBe('2-minute drill');
    expect(bucketizeSituation('two-minute offense')).toBe('2-minute drill');
  });

  it('recognizes motion-based situations', () => {
    expect(bucketizeSituation('when they motion jet right')).toBe('after motion');
    expect(bucketizeSituation('post-motion, single-high look')).toBe('after motion');
  });

  it('identifies 1st & 10 / base downs', () => {
    expect(bucketizeSituation('1st & 10')).toBe('1st & 10 / base');
    expect(bucketizeSituation('1st & 10 from the 30')).toBe('1st & 10 / base');
    expect(bucketizeSituation('base down, spread formation')).toBe('1st & 10 / base');
  });

  it('falls back to the raw situation when nothing matches', () => {
    expect(bucketizeSituation('after they sub')).toBe('after they sub');
  });

  it('truncates overlong fallback situations with ellipsis', () => {
    const longStr = 'a'.repeat(80);
    const result = bucketizeSituation(longStr);
    expect(result.endsWith('...')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(40);
  });
});

describe('buildCallSheet', () => {
  it('returns empty buckets when there are no insights', () => {
    const sheet = buildCallSheet([]);
    expect(sheet.buckets).toEqual([]);
  });

  it('returns empty buckets when insights have no recommendations', () => {
    const sheet = buildCallSheet([mkInsight('i1', 'TEST', [])]);
    expect(sheet.buckets).toEqual([]);
  });

  it('buckets recommendations from a single insight', () => {
    const sheet = buildCallSheet([
      mkInsight('i1', 'BEAT COVER 3', [
        { situation: '3rd & 8', call: 'Mesh vs Rt Trips', rationale: 'beats C3' },
        { situation: '1st & 10', call: 'Power Read', rationale: 'base down hitter' },
      ]),
    ]);
    expect(sheet.buckets).toHaveLength(2);
    const thirdLong = sheet.buckets.find((b) => b.bucket === '3rd & long');
    expect(thirdLong?.recommendations).toHaveLength(1);
    expect(thirdLong?.recommendations[0]?.call).toBe('Mesh vs Rt Trips');
    expect(thirdLong?.recommendations[0]?.insightHeadline).toBe('BEAT COVER 3');
    expect(thirdLong?.recommendations[0]?.insightId).toBe('i1');
  });

  it('merges same-bucket recs from multiple insights', () => {
    const sheet = buildCallSheet([
      mkInsight('i1', 'ATTACK FS', [
        { situation: '3rd & 8 vs Cover 3', call: 'Four Verts', rationale: 'r1' },
      ]),
      mkInsight('i2', 'BURN CB #24', [
        { situation: '3rd & 10', call: 'Slant-Flat', rationale: 'r2' },
      ]),
    ]);
    const thirdLong = sheet.buckets.find((b) => b.bucket === '3rd & long');
    expect(thirdLong?.recommendations).toHaveLength(2);
    const calls = thirdLong?.recommendations.map((r) => r.call).sort();
    expect(calls).toEqual(['Four Verts', 'Slant-Flat']);
  });

  it('sorts buckets with money downs first, then red zone, then base', () => {
    const sheet = buildCallSheet([
      mkInsight('i1', 'I1', [
        { situation: '1st & 10', call: 'Inside Zone', rationale: 'r' },
        { situation: 'red zone', call: 'Fade', rationale: 'r' },
        { situation: '3rd & 8', call: 'Mesh', rationale: 'r' },
      ]),
    ]);
    const order = sheet.buckets.map((b) => b.bucket);
    const thirdIdx = order.indexOf('3rd & long');
    const rzIdx = order.indexOf('red zone');
    const baseIdx = order.indexOf('1st & 10 / base');
    expect(thirdIdx).toBeLessThan(rzIdx);
    expect(rzIdx).toBeLessThan(baseIdx);
  });

  it('preserves insight attribution for every recommendation', () => {
    const sheet = buildCallSheet([
      mkInsight('safety-widens', 'SAFETY WIDENS', [
        { situation: '3rd & 8', call: 'Post-Wheel', rationale: 'exploits widening FS' },
      ]),
    ]);
    const rec = sheet.buckets[0]?.recommendations[0];
    expect(rec?.insightId).toBe('safety-widens');
    expect(rec?.insightHeadline).toBe('SAFETY WIDENS');
    expect(rec?.rationale).toBe('exploits widening FS');
  });
});

describe('renderCallSheetAsText', () => {
  it('emits a terse sideline-card header + body', () => {
    const sheet = buildCallSheet([
      mkInsight('i1', 'BURN CB #24', [
        { situation: '3rd & 8', call: 'Mesh vs Trips Rt', rationale: 'beats C3 rotation' },
      ]),
    ]);
    const text = renderCallSheetAsText({ opponentName: 'Jefferson', callSheet: sheet });
    expect(text).toContain('CALL SHEET — Jefferson');
    expect(text).toContain('3RD & LONG');
    expect(text).toContain('• Mesh vs Trips Rt');
    expect(text).toContain('beats C3 rotation');
  });

  it('handles an empty call sheet gracefully', () => {
    expect(renderCallSheetAsText({ opponentName: 'Jefferson', callSheet: undefined }))
      .toContain('(no recommendations)');
    expect(renderCallSheetAsText({ opponentName: 'Jefferson', callSheet: { buckets: [] } }))
      .toContain('(no recommendations)');
  });

  it('keeps bucket order from the sheet', () => {
    const sheet = buildCallSheet([
      mkInsight('i1', 'I1', [
        { situation: '1st & 10', call: 'Inside Zone', rationale: 'r' },
        { situation: '3rd & 8', call: 'Mesh', rationale: 'r' },
      ]),
    ]);
    const text = renderCallSheetAsText({ opponentName: 'Jefferson', callSheet: sheet });
    const thirdIdx = text.indexOf('3RD & LONG');
    const baseIdx = text.indexOf('1ST & 10 / BASE');
    expect(thirdIdx).toBeLessThan(baseIdx);
  });
});
