import { describe, it, expect } from 'vitest';
import {
  POSITION_MODES,
  computeSessionScore,
  type DecisionResult,
  type PositionMode,
} from '@/lib/simulation/position-modes';

describe('Position modes', () => {
  const ALL_POSITIONS: PositionMode[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S'];

  const baseContext = {
    coverageShell: 'cover_3',
    pressureType: 'base_4',
    down: 2,
    distance: 7,
    formation: 'spread',
  };

  describe('all positions have valid configs', () => {
    for (const pos of ALL_POSITIONS) {
      it(`${pos} has camera, pre-snap, and post-snap`, () => {
        const config = POSITION_MODES[pos];
        expect(config.position).toBe(pos);
        expect(config.camera.name).toBeTruthy();
        expect(config.camera.elevation).toBeTruthy();
        expect(typeof config.preSnapDecisions).toBe('function');
        expect(typeof config.postSnapDecisions).toBe('function');
      });
    }
  });

  describe('QB mode decisions', () => {
    const qb = POSITION_MODES.QB;

    it('generates pre-snap decisions', () => {
      const decisions = qb.preSnapDecisions(baseContext);
      expect(decisions.length).toBeGreaterThan(0);
      expect(decisions[0]?.prompt).toContain('coverage');
    });

    it('correct answer for Cover 3 is Cover 3', () => {
      const decisions = qb.preSnapDecisions(baseContext);
      expect(decisions[0]?.correctAnswers).toContain('Cover 3');
    });

    it('correct answer for Cover 1 is Cover 1', () => {
      const decisions = qb.preSnapDecisions({ ...baseContext, coverageShell: 'cover_1' });
      expect(decisions[0]?.correctAnswers).toContain('Cover 1');
    });

    it('protection call recommends hot route on blitz', () => {
      const decisions = qb.preSnapDecisions({ ...baseContext, pressureType: 'lb_blitz' });
      const protectionDecision = decisions.find(d => d.prompt.includes('Protection'));
      expect(protectionDecision?.correctAnswers).toContain('Hot Route');
    });

    it('generates post-snap read decisions', () => {
      const decisions = qb.postSnapDecisions(baseContext);
      expect(decisions.length).toBeGreaterThan(0);
      expect(decisions[0]?.prompt).toContain('throw');
    });

    it('recommends middle read against Cover 2', () => {
      const decisions = qb.postSnapDecisions({ ...baseContext, coverageShell: 'cover_2' });
      expect(decisions[0]?.correctAnswers).toContain('Second Read (Middle)');
    });
  });

  describe('CB mode decisions', () => {
    const cb = POSITION_MODES.CB;

    it('recommends press man in Cover 1', () => {
      const decisions = cb.preSnapDecisions({ ...baseContext, coverageShell: 'cover_1' });
      expect(decisions[0]?.correctAnswers).toContain('Press Man');
    });

    it('recommends zone flat in Cover 2', () => {
      const decisions = cb.preSnapDecisions({ ...baseContext, coverageShell: 'cover_2' });
      expect(decisions[0]?.correctAnswers).toContain('Zone (Flat)');
    });

    it('recommends deep third in Cover 3', () => {
      const decisions = cb.preSnapDecisions({ ...baseContext, coverageShell: 'cover_3' });
      expect(decisions[0]?.correctAnswers).toContain('Zone (Deep Third)');
    });
  });

  describe('DL mode decisions', () => {
    const dl = POSITION_MODES.DL;

    it('identifies spread as pass heavy', () => {
      const decisions = dl.preSnapDecisions({ ...baseContext, formation: 'spread' });
      expect(decisions[0]?.correctAnswers).toContain('Pass Heavy');
    });

    it('identifies non-spread as run/balanced', () => {
      const decisions = dl.preSnapDecisions({ ...baseContext, formation: 'i_form' });
      const answers = decisions[0]?.correctAnswers ?? [];
      expect(answers.some(a => a === 'Run Heavy' || a === 'Balanced')).toBe(true);
    });
  });

  describe('Safety mode decisions', () => {
    const s = POSITION_MODES.S;

    it('recommends rotating at snap, not early', () => {
      const decisions = s.preSnapDecisions(baseContext);
      const answers = decisions[0]?.correctAnswers ?? [];
      expect(answers).toContain('At the Snap');
      expect(answers).not.toContain('Pre-snap (Early)');
    });
  });
});

describe('computeSessionScore', () => {
  it('computes 100% accuracy for all correct', () => {
    const results: DecisionResult[] = [
      { decision: { prompt: 'Q1', options: ['A', 'B'], correctAnswers: ['A'], phase: 'pre_snap', explanation: '' }, playerAnswer: 'A', correct: true, timeMs: 1000 },
      { decision: { prompt: 'Q2', options: ['A', 'B'], correctAnswers: ['B'], phase: 'post_snap', explanation: '' }, playerAnswer: 'B', correct: true, timeMs: 2000 },
    ];

    const score = computeSessionScore(results);
    expect(score.accuracy).toBe(1);
    expect(score.correctDecisions).toBe(2);
    expect(score.totalDecisions).toBe(2);
    expect(score.avgDecisionTimeMs).toBe(1500);
  });

  it('computes 50% accuracy for half correct', () => {
    const results: DecisionResult[] = [
      { decision: { prompt: 'Q1', options: ['A', 'B'], correctAnswers: ['A'], phase: 'pre_snap', explanation: '' }, playerAnswer: 'A', correct: true, timeMs: 1000 },
      { decision: { prompt: 'Q2', options: ['A', 'B'], correctAnswers: ['B'], phase: 'post_snap', explanation: '' }, playerAnswer: 'A', correct: false, timeMs: 3000 },
    ];

    const score = computeSessionScore(results);
    expect(score.accuracy).toBe(0.5);
    expect(score.correctDecisions).toBe(1);
  });

  it('handles empty results', () => {
    const score = computeSessionScore([]);
    expect(score.accuracy).toBe(0);
    expect(score.totalDecisions).toBe(0);
    expect(score.avgDecisionTimeMs).toBe(0);
  });
});
