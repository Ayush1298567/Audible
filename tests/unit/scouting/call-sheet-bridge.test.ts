/**
 * Tests that the call sheet → board suggestion bridge correctly
 * maps walkthrough call-sheet buckets to board situations using the
 * same bucketizeSituation logic the call sheet itself was built with.
 */

import { describe, expect, it } from 'vitest';
import { bucketizeSituation } from '@/lib/scouting/call-sheet';

describe('bucketizeSituation matches board situation labels', () => {
  const boardSituations = [
    // Offense
    { label: '1st Down', expectedBucket: '1st down' },
    { label: '2nd & Short', expectedBucket: '2nd down' },
    { label: '2nd & Long', expectedBucket: '2nd down' },
    { label: '3rd & Short', expectedBucket: '3rd & short' },
    { label: '3rd & Medium', expectedBucket: '3rd & medium' },
    { label: '3rd & Long', expectedBucket: '3rd & long' },
    { label: 'Red Zone', expectedBucket: 'red zone' },
    { label: 'Two Minute', expectedBucket: '2-minute drill' },
    { label: 'Goal Line', expectedBucket: 'red zone' },
  ];

  for (const { label, expectedBucket } of boardSituations) {
    it(`"${label}" → "${expectedBucket}"`, () => {
      expect(bucketizeSituation(label)).toBe(expectedBucket);
    });
  }

  it('walkthrough-generated buckets are stable', () => {
    expect(bucketizeSituation('3rd & long vs Cover 3 rotation')).toBe('3rd & long');
    expect(bucketizeSituation('3rd & 8')).toBe('3rd & long');
    expect(bucketizeSituation('3rd & 2')).toBe('3rd & short');
    expect(bucketizeSituation('3rd & 5')).toBe('3rd & medium');
    expect(bucketizeSituation('red zone, 11 personnel')).toBe('red zone');
    expect(bucketizeSituation('jet motion right pre-snap')).toBe('after motion');
    expect(bucketizeSituation('1st & 10')).toBe('1st & 10 / base');
  });
});
