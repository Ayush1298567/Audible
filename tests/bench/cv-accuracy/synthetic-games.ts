/**
 * Turn a GroundTruthScenario into the PlayAnalytics shape our
 * aggregators consume. This is what a PERFECT CV pipeline would
 * produce for the given scenario — used as the clean baseline before
 * the noise injectors corrupt it.
 */

import type { KeyMatchup, PlayAnalytics } from '@/lib/cv/track-analytics';
import type { GroundTruthScenario } from './fixtures';

export interface SyntheticPlay {
  playId: string;
  gameId: string;
  analytics: PlayAnalytics;
  /** Metadata matching what the real DB row would have. */
  meta: {
    down: number;
    distance: number;
    quarter: number;
    playType: string;
    formation: string;
    personnel: string;
    motion: string;
    coverage: string;
    route: string;
    gainLoss: number;
  };
}

// ─── Helpers ────────────────────────────────────────────────

// Deterministic PRNG so every bench run is reproducible.
function mulberry32(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)] as T;
}

function makeMatchup(
  offJersey: string,
  offRole: string,
  defJersey: string,
  defRole: string,
  sep: number,
  rand: () => number,
): KeyMatchup {
  // Jitter separation slightly so rollup isn't mechanical (±0.6yd).
  const jitter = (rand() - 0.5) * 1.2;
  return {
    offense: { trackId: `off-${offJersey}`, role: offRole, jersey: offJersey },
    defense: { trackId: `def-${defJersey}`, role: defRole, jersey: defJersey },
    minSeparationYards: Math.max(0.5, Number((sep + jitter).toFixed(2))),
    atT: 1.5 + rand() * 1.5,
    closingYps: 1.5 + rand() * 1.5,
    offenseMaxSpeedYps: 7.5 + rand() * 2, // 7.5-9.5
    // Clean baseline = maximum confidence. Noise injectors lower this.
    confidence: 0.85,
  };
}

// ─── Synthetic-game generator ───────────────────────────────

export function generateScenario(
  scenario: GroundTruthScenario,
  seed = 42,
): SyntheticPlay[] {
  const rand = mulberry32(seed);
  const plays: SyntheticPlay[] = [];

  const offBySide = (side: 'off' | 'def') =>
    scenario.roster.filter((p) => p.side === side);
  const offense = offBySide('off');
  const defense = offBySide('def');

  const COVERAGES = ['cover_2', 'cover_3', 'cover_1', 'quarters'];
  const ROUTES = ['mesh', 'slant_flat', 'four_verts', 'stick'];
  const FORMATIONS = ['Shotgun Spread', 'Trips Rt', 'Empty', 'I-Form'];
  const PERSONNEL = ['11', '12', '21'];
  const PLAY_TYPES = ['Pass', 'Pass', 'Pass', 'Run', 'Run']; // bias toward pass

  let playIdx = 0;
  for (let g = 1; g <= scenario.gameCount; g++) {
    const gameId = `game-${g}`;

    // 1. Plays that materialize each scripted matchup tendency
    const scriptedPlays: SyntheticPlay[] = [];
    for (const mu of scenario.matchups) {
      if (!mu.games.includes(g)) continue;

      const offPlayer = offense.find((p) => p.jersey === mu.offJersey);
      const defPlayer = defense.find((p) => p.jersey === mu.defJersey);
      if (!offPlayer || !defPlayer) continue;

      for (let i = 0; i < mu.playsPerGame; i++) {
        const matchupObj = makeMatchup(
          mu.offJersey,
          offPlayer.role,
          mu.defJersey,
          defPlayer.role,
          mu.avgSeparationYards,
          rand,
        );
        const playId = `g${g}-p${playIdx++}`;
        scriptedPlays.push({
          playId,
          gameId,
          analytics: {
            tracks: [],
            peakSpeedYps: matchupObj.offenseMaxSpeedYps,
            playDurationSeconds: 4.5 + rand() * 1.5,
            fieldSpace: true,
            keyMatchups: [matchupObj],
          },
          meta: {
            down: 1 + Math.floor(rand() * 3), // 1-3
            distance: 3 + Math.floor(rand() * 10), // 3-12
            quarter: 1 + Math.floor(rand() * 4),
            playType: pick(PLAY_TYPES, rand),
            formation: pick(FORMATIONS, rand),
            personnel: pick(PERSONNEL, rand),
            motion: rand() > 0.6 ? 'jet right' : 'None',
            coverage: pick(COVERAGES, rand),
            route: pick(ROUTES, rand),
            gainLoss: Math.round((matchupObj.minSeparationYards - 1) * 3),
          },
        });
      }
    }

    // 2. Fill out the rest of the game with non-matchup plays. Real CV
    //    only produces a keyMatchup when an offensive skill player gets
    //    close to a defender; most plays (OL blocks, run-up-the-middle,
    //    DB drops deep with no WR nearby) produce no matchup.
    //
    //    We additionally produce some "good coverage" matchups at realistic
    //    low separation (~0.8-1.8yd) to simulate defenders WINNING plays.
    //    Those plays pull the aggregator's median DOWN for good defenders,
    //    which is exactly how real film should work.
    const remaining = scenario.playsPerGame - scriptedPlays.length;
    for (let i = 0; i < remaining; i++) {
      const playId = `g${g}-p${playIdx++}`;

      // 30% of fill plays produce a low-sep matchup (good coverage).
      // 70% produce no matchup at all (blocked OL, handoff, deep shell).
      const produceMatchup = rand() < 0.3;

      const matchups: typeof scriptedPlays[number]['analytics']['keyMatchups'] = [];
      if (produceMatchup) {
        const off = pick(offense.filter((p) => p.role === 'WR' || p.role === 'TE' || p.role === 'RB'), rand);
        const def = pick(defense.filter((p) => p.role === 'CB' || p.role === 'S' || p.role === 'LB'), rand);
        matchups.push(
          makeMatchup(
            off.jersey,
            off.role,
            def.jersey,
            def.role,
            0.5 + rand() * 1.5, // realistic "covered well" separation 0.5-2.0yd
            rand,
          ),
        );
      }

      scriptedPlays.push({
        playId,
        gameId,
        analytics: {
          tracks: [],
          peakSpeedYps: 6 + rand() * 2,
          playDurationSeconds: 3.5 + rand() * 2,
          fieldSpace: true,
          keyMatchups: matchups,
        },
        meta: {
          down: 1 + Math.floor(rand() * 3),
          distance: 3 + Math.floor(rand() * 10),
          quarter: 1 + Math.floor(rand() * 4),
          playType: pick(PLAY_TYPES, rand),
          formation: pick(FORMATIONS, rand),
          personnel: pick(PERSONNEL, rand),
          motion: rand() > 0.8 ? 'jet right' : 'None',
          coverage: pick(COVERAGES, rand),
          route: pick(ROUTES, rand),
          gainLoss: Math.round(3 + rand() * 8 - 4),
        },
      });
    }

    plays.push(...scriptedPlays);
  }

  return plays;
}
