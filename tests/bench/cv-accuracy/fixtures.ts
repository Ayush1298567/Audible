/**
 * Ground-truth scenarios for the CV-accuracy benchmark.
 *
 * A scenario is a description of an OPPONENT: their roster, a set of
 * football-real tendencies they exhibit, and how many games of film
 * we're simulating. The synthetic generator turns it into PlayAnalytics
 * objects that look exactly like what the real CV pipeline would
 * produce on that same opponent. Then we inject controlled noise and
 * measure how accurately our aggregators recover the known truth.
 */

export type Role = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'CB' | 'S';

export interface GroundTruthPlayer {
  jersey: string;
  role: Role;
  /** Team side — 'off' or 'def'. */
  side: 'off' | 'def';
}

/**
 * A known player-vs-player tendency we want the pipeline to recover:
 * "this CB consistently gives up separation to this WR on this route
 *  against this coverage, in at least N of the M games."
 */
export interface GroundTruthMatchup {
  offJersey: string;
  defJersey: string;
  avgSeparationYards: number;
  /** Samples per game. */
  playsPerGame: number;
  /** In which games this matchup appears (1-indexed). */
  games: number[];
}

export interface GroundTruthScenario {
  name: string;
  roster: GroundTruthPlayer[];
  matchups: GroundTruthMatchup[];
  /** Number of games to simulate. */
  gameCount: number;
  /** Total plays per game (split across matchups + other random plays). */
  playsPerGame: number;
}

// ─── Scenario 1: Jefferson Eagles ──────────────────────────
//
// Four known tendencies across 3 games × 30 plays each = 90 plays:
//   - CB #24 gives up avg 4.1 yd separation to WR #88 on 8 plays across all 3 games
//     → should surface as HIGH trust defender
//   - S #9 gets beat 3.5yd by WR #11 on 5 plays across 2 games
//     → should surface as MEDIUM trust defender
//   - CB #21 gets beat 5.0yd in 3 plays, all in game 2 only
//     → should surface as LOW trust (single-game tendency)
//   - WR #88 hits 9 yds/s peak on 12 plays across 3 games
//     → should surface as HIGH trust offensive playmaker
export const JEFFERSON_EAGLES: GroundTruthScenario = {
  name: 'Jefferson Eagles',
  gameCount: 3,
  playsPerGame: 30,
  roster: [
    // Offense
    { jersey: '7', role: 'QB', side: 'off' },
    { jersey: '22', role: 'RB', side: 'off' },
    { jersey: '88', role: 'WR', side: 'off' },
    { jersey: '11', role: 'WR', side: 'off' },
    { jersey: '80', role: 'TE', side: 'off' },
    { jersey: '55', role: 'OL', side: 'off' },
    // Defense
    { jersey: '24', role: 'CB', side: 'def' },
    { jersey: '21', role: 'CB', side: 'def' },
    { jersey: '9', role: 'S', side: 'def' },
    { jersey: '33', role: 'LB', side: 'def' },
    { jersey: '99', role: 'DL', side: 'def' },
  ],
  matchups: [
    // HIGH TRUST: WR #88 vs CB #24 consistently, across all 3 games
    {
      offJersey: '88',
      defJersey: '24',
      avgSeparationYards: 4.1,
      playsPerGame: 3,
      games: [1, 2, 3],
    },
    // MEDIUM TRUST: WR #11 vs S #9 in 2 games
    {
      offJersey: '11',
      defJersey: '9',
      avgSeparationYards: 3.5,
      playsPerGame: 3,
      games: [1, 3],
    },
    // LOW TRUST: WR #88 vs CB #21 only in game 2 (single-game anomaly)
    {
      offJersey: '88',
      defJersey: '21',
      avgSeparationYards: 5.0,
      playsPerGame: 3,
      games: [2],
    },
  ],
};

/**
 * Expected outcomes from the accuracy measurement — what we want the
 * pipeline to recover from the Jefferson scenario under CLEAN data.
 *
 * Under the current trust-tier rules (≥4 matchups, cross-game, median
 * sep ≥2.5yd, conf ≥0.7), both CB#24 and S#9 qualify for high trust:
 *   - CB#24: 9 plays × 3 games × ~4.1yd  → high
 *   - S#9:   6 plays × 2 games × ~3.5yd  → high
 *   - CB#21: 3 plays × 1 game  × ~5.0yd  → must NOT be high (single game)
 */
export const JEFFERSON_EXPECTED = {
  highTrustDefenders: ['CB#24', 'S#9'],
  mediumTrustDefenders: [] as string[],
  mustNotBeHighTrust: ['CB#21'],
  highTrustOffense: ['WR#88'],
};
