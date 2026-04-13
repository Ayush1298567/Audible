/**
 * Tests for the simulation engine.
 *
 * Covers: weightedSelect, initializePlay, tickPlay state machine,
 * computeResult outcome calculation.
 */

import { describe, expect, it } from 'vitest';
import {
  weightedSelect,
  initializePlay,
  tickPlay,
  type TendencyWeights,
  type PlayState,
} from '@/lib/simulation/engine';

// ─── Test data ──────────────────────────────────────────────

const defaultWeights: TendencyWeights = {
  coverageRates: [
    { coverage: 'cover_3', rate: 0.5 },
    { coverage: 'cover_2', rate: 0.3 },
    { coverage: 'cover_1', rate: 0.2 },
  ],
  pressureRates: [
    { type: 'base_4', rate: 0.6 },
    { type: 'lb_blitz', rate: 0.3 },
    { type: 'db_blitz', rate: 0.1 },
  ],
  runRate: 0.5,
  passRate: 0.5,
};

// ─── weightedSelect ─────────────────────────────────────────

describe('weightedSelect', () => {
  it('returns an item from the options array', () => {
    const options = [
      { rate: 0.5, label: 'a' },
      { rate: 0.3, label: 'b' },
      { rate: 0.2, label: 'c' },
    ];
    const result = weightedSelect(options);
    expect(options).toContainEqual(result);
  });

  it('throws on empty options', () => {
    expect(() => weightedSelect([])).toThrow('empty options');
  });

  it('handles all-zero rates without crashing', () => {
    const options = [
      { rate: 0, label: 'a' },
      { rate: 0, label: 'b' },
    ];
    const result = weightedSelect(options);
    expect(result).toBeDefined();
  });

  it('returns the only option when there is one', () => {
    const options = [{ rate: 1, label: 'only' }];
    const result = weightedSelect(options);
    expect(result.label).toBe('only');
  });

  it('statistically favors higher-rate options over 1000 runs', () => {
    const options = [
      { rate: 0.9, label: 'high' },
      { rate: 0.1, label: 'low' },
    ];
    let highCount = 0;
    for (let i = 0; i < 1000; i++) {
      if (weightedSelect(options).label === 'high') highCount++;
    }
    // Should be ~900 but allow wide margin for randomness
    expect(highCount).toBeGreaterThan(700);
    expect(highCount).toBeLessThan(1000);
  });
});

// ─── initializePlay ─────────────────────────────────────────

describe('initializePlay', () => {
  it('creates a play state with 22 players', () => {
    const state = initializePlay(35, 1, 10, 'spread', defaultWeights);
    // Should have offense + defense players
    const offenseCount = state.players.filter((p) => p.team === 'offense').length;
    const defenseCount = state.players.filter((p) => p.team === 'defense').length;
    expect(offenseCount).toBe(11);
    expect(defenseCount).toBe(11);
  });

  it('starts in pre_snap phase at tick 0', () => {
    const state = initializePlay(35, 1, 10, 'spread', defaultWeights);
    expect(state.phase).toBe('pre_snap');
    expect(state.tick).toBe(0);
  });

  it('sets the correct down and distance', () => {
    const state = initializePlay(40, 3, 7, 'trips', defaultWeights);
    expect(state.down).toBe(3);
    expect(state.distance).toBe(7);
    expect(state.losX).toBe(40);
  });

  it('selects coverage from the tendency weights', () => {
    const state = initializePlay(35, 1, 10, 'spread', defaultWeights);
    const validCoverages = defaultWeights.coverageRates.map((c) => c.coverage);
    expect(validCoverages).toContain(state.coverageShell);
  });

  it('handles trips formation', () => {
    const state = initializePlay(35, 1, 10, 'trips', defaultWeights);
    const wrs = state.players.filter(
      (p) => p.team === 'offense' && p.position === 'WR',
    );
    expect(wrs.length).toBe(4);
  });

  it('has no result initially', () => {
    const state = initializePlay(35, 1, 10, 'spread', defaultWeights);
    expect(state.result).toBeNull();
  });
});

// ─── tickPlay state machine ─────────────────────────────────

describe('tickPlay', () => {
  let initialState: PlayState;

  it('stays in pre_snap for 10 ticks', () => {
    initialState = initializePlay(35, 1, 10, 'spread', defaultWeights);
    let state = initialState;
    for (let i = 0; i < 9; i++) {
      state = tickPlay(state);
      expect(state.phase).toBe('pre_snap');
    }
    // Tick 10 transitions to snap
    state = tickPlay(state);
    expect(state.phase).toBe('snap');
  });

  it('transitions from snap to play in 1 tick', () => {
    let state = initializePlay(35, 1, 10, 'spread', defaultWeights);
    // Fast-forward through pre_snap
    for (let i = 0; i < 10; i++) state = tickPlay(state);
    expect(state.phase).toBe('snap');
    state = tickPlay(state);
    expect(state.phase).toBe('play');
  });

  it('reaches result phase after ~40 ticks total', () => {
    let state = initializePlay(35, 1, 10, 'spread', defaultWeights);
    // Tick until result
    for (let i = 0; i < 50; i++) {
      state = tickPlay(state);
      if (state.phase === 'result') break;
    }
    expect(state.phase).toBe('result');
    expect(state.result).not.toBeNull();
  });

  it('stays frozen in result phase (no further ticks change state)', () => {
    let state = initializePlay(35, 1, 10, 'spread', defaultWeights);
    for (let i = 0; i < 50; i++) state = tickPlay(state);
    expect(state.phase).toBe('result');

    const frozenState = tickPlay(state);
    expect(frozenState.phase).toBe('result');
    expect(frozenState.tick).toBe(state.tick);
  });

  it('moves players during play phase', () => {
    let state = initializePlay(35, 1, 10, 'spread', defaultWeights);
    const initialQB = state.players.find((p) => p.position === 'QB');

    // Advance to play phase + a few ticks
    for (let i = 0; i < 20; i++) state = tickPlay(state);
    expect(state.phase).toBe('play');

    const movedQB = state.players.find((p) => p.position === 'QB');
    // QB should have dropped back (x decreased in our coordinate system)
    expect(movedQB?.x).not.toBe(initialQB?.x);
  });
});

// ─── Result computation ─────────────────────────────────────

describe('play results', () => {
  it('produces a result with yardsGained, success, description', () => {
    let state = initializePlay(35, 1, 10, 'spread', defaultWeights);
    for (let i = 0; i < 50; i++) state = tickPlay(state);

    const result = state.result;
    expect(result).not.toBeNull();
    expect(typeof result?.yardsGained).toBe('number');
    expect(typeof result?.success).toBe('boolean');
    expect(typeof result?.description).toBe('string');
    expect(result?.description.length).toBeGreaterThan(0);
  });

  it('includes the coverage shell and pressure type in the result', () => {
    let state = initializePlay(35, 1, 10, 'spread', defaultWeights);
    for (let i = 0; i < 50; i++) state = tickPlay(state);

    expect(state.result?.coverageShell).toBeDefined();
    expect(state.result?.pressureType).toBeDefined();
  });

  it('produces stochastic results (different outcomes on repeated runs)', () => {
    const results: number[] = [];
    for (let run = 0; run < 20; run++) {
      let state = initializePlay(35, 1, 10, 'spread', defaultWeights);
      for (let i = 0; i < 50; i++) state = tickPlay(state);
      results.push(state.result?.yardsGained ?? 0);
    }
    // Not all results should be identical (stochastic)
    const unique = new Set(results);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('yards gained is bounded (no infinite or NaN values)', () => {
    for (let run = 0; run < 50; run++) {
      let state = initializePlay(35, 1, 10, 'spread', defaultWeights);
      for (let i = 0; i < 50; i++) state = tickPlay(state);
      const yards = state.result?.yardsGained ?? 0;
      expect(Number.isFinite(yards)).toBe(true);
      expect(yards).toBeGreaterThanOrEqual(-10);
      expect(yards).toBeLessThanOrEqual(30);
    }
  });
});
