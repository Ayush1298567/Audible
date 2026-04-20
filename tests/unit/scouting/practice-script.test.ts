/**
 * Tests for the pure helpers in src/lib/scouting/practice-script.ts —
 * Zod schema, prompt-context builder, plain-text renderer, and the
 * Monday-of-this-week date helper. The Claude call itself is exercised
 * in dev / against the real API.
 */

import { describe, expect, it } from 'vitest';
import {
  buildPromptContext,
  nextPracticeMonday,
  practiceScriptResponseSchema,
  renderScriptAsText,
  type PracticeScript,
} from '@/lib/scouting/practice-script';
import type { Walkthrough } from '@/lib/scouting/insights';

const sampleWalkthrough: Walkthrough = {
  opponentId: '11111111-1111-1111-1111-111111111111',
  opponentName: 'Alabama Crimson Tide',
  playsAnalyzed: 92,
  summary: 'They lean Cover 3 on third down and run jet motion right almost every time.',
  generatedAt: '2026-04-14T12:00:00Z',
  insights: [
    {
      id: 'cover-3-third-long',
      rank: 1,
      headline: 'COVER 3 ROTATION ON 3RD & LONG',
      narrative: 'They rotate to Cover 3 on 3rd & long 65% of the time, FS widening late.',
      evidenceCount: 8,
      examples: [],
      recommendations: [
        {
          situation: '3rd & long vs Cover 3 rotation',
          call: 'Mesh vs Trips Rt',
          rationale: 'Beats their 60% Cover 3 rotation, mesh sits in the rotated hole.',
        },
      ],
    },
    {
      id: 'jet-tells-direction',
      rank: 2,
      headline: 'JET MOTION TELLS RUN DIRECTION',
      narrative: 'When they motion jet right, they run jet right 78% of the time.',
      evidenceCount: 14,
      examples: [],
      recommendations: [
        {
          situation: 'jet motion right pre-snap',
          call: 'Match jet — LBs slide weak',
          rationale: 'High confidence jet right means jet right; cheat one gap weak.',
        },
      ],
    },
  ],
  callSheet: {
    buckets: [
      {
        bucket: '3rd & long',
        recommendations: [
          {
            insightHeadline: 'COVER 3 ROTATION ON 3RD & LONG',
            insightId: 'cover-3-third-long',
            call: 'Mesh vs Trips Rt',
            rationale: 'Beats their 60% Cover 3 rotation.',
          },
        ],
      },
      {
        bucket: 'after motion',
        recommendations: [
          {
            insightHeadline: 'JET MOTION TELLS RUN DIRECTION',
            insightId: 'jet-tells-direction',
            call: 'Match jet — LBs slide weak',
            rationale: 'Cheat one gap weak when jet shows.',
          },
        ],
      },
    ],
  },
};

describe('buildPromptContext', () => {
  it('includes opponent name, plays analyzed, and ranked insights', () => {
    const ctx = buildPromptContext(sampleWalkthrough);
    expect(ctx).toContain('Alabama Crimson Tide');
    expect(ctx).toContain('92');
    expect(ctx).toContain('#1 [cover-3-third-long]');
    expect(ctx).toContain('COVER 3 ROTATION ON 3RD & LONG');
    expect(ctx).toContain('#2 [jet-tells-direction]');
  });

  it('renders each insight\'s recommendations', () => {
    const ctx = buildPromptContext(sampleWalkthrough);
    expect(ctx).toContain('Mesh vs Trips Rt');
    expect(ctx).toContain('Match jet — LBs slide weak');
    expect(ctx).toContain('3rd & long vs Cover 3 rotation');
  });

  it('renders the call sheet buckets when present', () => {
    const ctx = buildPromptContext(sampleWalkthrough);
    expect(ctx).toContain('CALL SHEET BUCKETS');
    expect(ctx).toContain('3rd & long:');
    expect(ctx).toContain('after motion:');
    expect(ctx).toContain('insight: cover-3-third-long');
  });

  it('skips the call sheet section when none is present', () => {
    const wt: Walkthrough = { ...sampleWalkthrough, callSheet: undefined };
    const ctx = buildPromptContext(wt);
    expect(ctx).not.toContain('CALL SHEET BUCKETS');
  });
});

describe('practiceScriptResponseSchema', () => {
  const validBody = {
    weekTheme: 'Attack their Cover 3 rotation on 3rd & long; force them out of jet motion looks.',
    days: [
      {
        day: 'Monday',
        theme: 'Install',
        periods: [
          {
            name: 'Walk-through',
            durationMinutes: 20,
            focus: 'Install Mesh vs Cover 3',
            drills: [
              {
                name: 'Mesh install vs C3',
                reps: 5,
                scoutLook: 'Cover 3 with FS widening late',
                rationale: 'Lock in the mesh-sit landmark vs the rotated hole',
                insightId: 'cover-3-third-long',
              },
            ],
          },
        ],
      },
      { day: 'Tuesday', theme: 'Heavy', periods: [{ name: '7-on-7', durationMinutes: 20, focus: 'Reps the install', drills: [] }] },
      { day: 'Wednesday', theme: 'Situational', periods: [{ name: '3rd Down', durationMinutes: 15, focus: 'Money down', drills: [] }] },
      { day: 'Thursday', theme: 'Walk-through', periods: [{ name: 'Mock Game', durationMinutes: 20, focus: 'First 15 script', drills: [] }] },
    ],
  };

  it('accepts a well-formed script', () => {
    expect(() => practiceScriptResponseSchema.parse(validBody)).not.toThrow();
  });

  it('rejects scripts that do not have exactly 4 days', () => {
    const tooFew = { ...validBody, days: validBody.days.slice(0, 3) };
    expect(() => practiceScriptResponseSchema.parse(tooFew)).toThrow();
  });

  it('rejects unrealistic rep counts', () => {
    const insane = JSON.parse(JSON.stringify(validBody));
    insane.days[0].periods[0].drills[0].reps = 200;
    expect(() => practiceScriptResponseSchema.parse(insane)).toThrow();
  });

  it('rejects unknown day names', () => {
    const friday = JSON.parse(JSON.stringify(validBody));
    friday.days[0].day = 'Friday';
    expect(() => practiceScriptResponseSchema.parse(friday)).toThrow();
  });

  it('rejects too-long week themes', () => {
    const huge = { ...validBody, weekTheme: 'x'.repeat(500) };
    expect(() => practiceScriptResponseSchema.parse(huge)).toThrow();
  });
});

describe('renderScriptAsText', () => {
  const script: PracticeScript = {
    opponentId: 'op-1',
    opponentName: 'Alabama',
    weekOfMonday: '2026-04-13',
    weekTheme: 'Attack their Cover 3 rotation.',
    generatedAt: '2026-04-14T12:00:00Z',
    days: [
      {
        day: 'Monday',
        theme: 'Install',
        periods: [
          {
            name: 'Walk-through',
            durationMinutes: 20,
            focus: 'Mesh install',
            drills: [
              {
                name: 'Mesh vs C3',
                reps: 6,
                scoutLook: 'Cover 3 widening',
                rationale: 'Locks in the mesh-sit landmark',
                insightId: 'cover-3-third-long',
              },
            ],
          },
        ],
      },
      { day: 'Tuesday', theme: 'Heavy', periods: [] },
      { day: 'Wednesday', theme: 'Situational', periods: [] },
      { day: 'Thursday', theme: 'Walk-through', periods: [] },
    ],
  };

  it('renders the header with opponent + week', () => {
    const text = renderScriptAsText(script);
    expect(text).toContain('PRACTICE SCRIPT — Alabama');
    expect(text).toContain('Week of 2026-04-13');
    expect(text).toContain('THEME: Attack their Cover 3 rotation.');
  });

  it('renders day blocks with periods and drills', () => {
    const text = renderScriptAsText(script);
    expect(text).toContain('── MONDAY (Install) ──');
    expect(text).toContain('Walk-through · 20 min');
    expect(text).toContain('Mesh vs C3 (×6)');
    expect(text).toContain('Scout look: Cover 3 widening');
  });
});

describe('nextPracticeMonday', () => {
  it('returns this week\'s Monday on Tuesday-Thursday', () => {
    // Tuesday 2026-04-14 → Monday 2026-04-13
    expect(nextPracticeMonday(new Date('2026-04-14T10:00:00Z'))).toBe('2026-04-13');
    // Wednesday 2026-04-15 → Monday 2026-04-13
    expect(nextPracticeMonday(new Date('2026-04-15T10:00:00Z'))).toBe('2026-04-13');
    // Thursday 2026-04-16 → Monday 2026-04-13
    expect(nextPracticeMonday(new Date('2026-04-16T10:00:00Z'))).toBe('2026-04-13');
  });

  it('returns next week\'s Monday on Friday/Sat/Sun', () => {
    // Friday 2026-04-17 → next Monday 2026-04-20
    expect(nextPracticeMonday(new Date('2026-04-17T10:00:00Z'))).toBe('2026-04-20');
    // Saturday 2026-04-18 → next Monday 2026-04-20
    expect(nextPracticeMonday(new Date('2026-04-18T10:00:00Z'))).toBe('2026-04-20');
    // Sunday 2026-04-19 → next Monday 2026-04-20
    expect(nextPracticeMonday(new Date('2026-04-19T10:00:00Z'))).toBe('2026-04-20');
  });

  it('returns today on Monday', () => {
    expect(nextPracticeMonday(new Date('2026-04-13T10:00:00Z'))).toBe('2026-04-13');
  });
});
