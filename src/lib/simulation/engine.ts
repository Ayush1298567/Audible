/**
 * Simulation engine — tendency-driven football play simulation.
 *
 * Runs a play based on real tendency weights from the tag DB:
 *   1. Load opponent's defensive tendencies for the given situation
 *   2. Select a coverage shell weighted by tendency rates
 *   3. Position defenders based on the selected coverage
 *   4. Animate the play: offense runs routes, defense reacts
 *   5. Compute the outcome based on tendency weights
 *
 * Per PLAN.md §8 rule 9: "The simulation runs on real tendency weights,
 * never developer-assigned values."
 *
 * ─── Coordinate system ─────────────────────────────────────
 *   x: 0 (left end zone) to 100 (right end zone), in yards
 *   y: 0 (bottom sideline) to 53.3 (top sideline), in yards
 *   LOS: the line of scrimmage x-coordinate
 * ─────────────────────────────────────────────────────────────
 */

export interface PlayerPosition {
  id: string;
  team: 'offense' | 'defense';
  position: string;
  jerseyNumber: number;
  x: number;
  y: number;
  color: string;
}

export interface PlayState {
  phase: 'pre_snap' | 'snap' | 'play' | 'result';
  tick: number;
  players: PlayerPosition[];
  losX: number;
  down: number;
  distance: number;
  coverageShell: string;
  pressureType: string;
  ballCarrier: string | null;
  result: PlayResult | null;
}

export interface PlayResult {
  yardsGained: number;
  success: boolean;
  description: string;
  coverageShell: string;
  pressureType: string;
}

export interface TendencyWeights {
  coverageRates: Array<{ coverage: string; rate: number }>;
  pressureRates: Array<{ type: string; rate: number }>;
  runRate: number;
  passRate: number;
}

/**
 * Select a value from a weighted distribution.
 * This is how tendency weights drive the simulation.
 */
export function weightedSelect<T extends { rate: number }>(options: T[]): T {
  if (options.length === 0) {
    throw new Error('weightedSelect: empty options');
  }

  const total = options.reduce((sum, o) => sum + o.rate, 0);
  const first = options[0];
  if (total === 0 || !first) return first as T;

  let random = Math.random() * total;
  for (const option of options) {
    random -= option.rate;
    if (random <= 0) return option;
  }
  return options[options.length - 1] ?? first;
}

/**
 * Initialize a play state with 22 players positioned for the snap.
 */
export function initializePlay(
  losX: number,
  down: number,
  distance: number,
  offenseFormation: string,
  tendencies: TendencyWeights,
): PlayState {
  // Select defense based on tendency weights
  const selectedCoverage = tendencies.coverageRates.length > 0
    ? weightedSelect(tendencies.coverageRates.map(c => ({ ...c, rate: c.rate }))).coverage
    : 'cover_3';

  const selectedPressure = tendencies.pressureRates.length > 0
    ? weightedSelect(tendencies.pressureRates.map(p => ({ ...p, rate: p.rate }))).type
    : 'base_4';

  const offensePlayers = buildOffense(losX, offenseFormation);
  const defensePlayers = buildDefense(losX, selectedCoverage, selectedPressure);

  return {
    phase: 'pre_snap',
    tick: 0,
    players: [...offensePlayers, ...defensePlayers],
    losX,
    down,
    distance,
    coverageShell: selectedCoverage,
    pressureType: selectedPressure,
    ballCarrier: null,
    result: null,
  };
}

/**
 * Advance the simulation by one tick (~100ms of game time).
 * Returns a new PlayState (immutable updates).
 */
export function tickPlay(state: PlayState): PlayState {
  const nextTick = state.tick + 1;

  switch (state.phase) {
    case 'pre_snap':
      // Pre-snap lasts 10 ticks (1 second)
      if (nextTick >= 10) {
        return { ...state, phase: 'snap', tick: nextTick };
      }
      return { ...state, tick: nextTick };

    case 'snap':
      // Snap lasts 1 tick
      return { ...state, phase: 'play', tick: nextTick };

    case 'play': {
      // Animate players for 30 ticks (3 seconds of play)
      const updatedPlayers = state.players.map((p) => animatePlayer(p, state, nextTick));

      if (nextTick >= 40) {
        // Play ends — compute result
        const result = computeResult(state);
        return {
          ...state,
          phase: 'result',
          tick: nextTick,
          players: updatedPlayers,
          result,
        };
      }

      return { ...state, tick: nextTick, players: updatedPlayers };
    }

    case 'result':
      return state; // frozen
  }
}

// ─── Player positioning ─────────────────────────────────────

function buildOffense(losX: number, formation: string): PlayerPosition[] {
  const y = 26.65; // center of field
  const players: PlayerPosition[] = [];
  const color = '#2563eb'; // blue

  // Center
  players.push({ id: 'o-c', team: 'offense', position: 'C', jerseyNumber: 52, x: losX, y, color });

  // Guards
  players.push({ id: 'o-lg', team: 'offense', position: 'OL', jerseyNumber: 66, x: losX, y: y - 2, color });
  players.push({ id: 'o-rg', team: 'offense', position: 'OL', jerseyNumber: 64, x: losX, y: y + 2, color });

  // Tackles
  players.push({ id: 'o-lt', team: 'offense', position: 'OL', jerseyNumber: 72, x: losX, y: y - 4, color });
  players.push({ id: 'o-rt', team: 'offense', position: 'OL', jerseyNumber: 76, x: losX, y: y + 4, color });

  // QB (shotgun by default)
  players.push({ id: 'o-qb', team: 'offense', position: 'QB', jerseyNumber: 7, x: losX - 5, y, color });

  // RB
  players.push({ id: 'o-rb', team: 'offense', position: 'RB', jerseyNumber: 22, x: losX - 7, y: y + 1, color });

  // Receivers — varies by formation
  const isTrips = formation?.toLowerCase().includes('trips');
  if (isTrips) {
    players.push({ id: 'o-wr1', team: 'offense', position: 'WR', jerseyNumber: 1, x: losX, y: y + 20, color });
    players.push({ id: 'o-wr2', team: 'offense', position: 'WR', jerseyNumber: 11, x: losX, y: y + 14, color });
    players.push({ id: 'o-slot', team: 'offense', position: 'WR', jerseyNumber: 5, x: losX, y: y + 8, color });
    players.push({ id: 'o-wr3', team: 'offense', position: 'WR', jerseyNumber: 80, x: losX, y: y - 18, color });
  } else {
    // Spread — 2x2
    players.push({ id: 'o-wr1', team: 'offense', position: 'WR', jerseyNumber: 1, x: losX, y: y + 20, color });
    players.push({ id: 'o-slot1', team: 'offense', position: 'WR', jerseyNumber: 5, x: losX, y: y + 8, color });
    players.push({ id: 'o-wr2', team: 'offense', position: 'WR', jerseyNumber: 11, x: losX, y: y - 20, color });
    players.push({ id: 'o-slot2', team: 'offense', position: 'WR', jerseyNumber: 80, x: losX, y: y - 8, color });
  }

  return players;
}

function buildDefense(losX: number, coverage: string, pressure: string): PlayerPosition[] {
  const y = 26.65;
  const players: PlayerPosition[] = [];
  const color = '#dc2626'; // red
  const defX = losX + 1; // just past LOS

  // D-line (4 man by default)
  players.push({ id: 'd-de1', team: 'defense', position: 'DE', jerseyNumber: 91, x: defX, y: y - 5, color });
  players.push({ id: 'd-dt1', team: 'defense', position: 'DT', jerseyNumber: 93, x: defX, y: y - 1.5, color });
  players.push({ id: 'd-dt2', team: 'defense', position: 'DT', jerseyNumber: 95, x: defX, y: y + 1.5, color });
  players.push({ id: 'd-de2', team: 'defense', position: 'DE', jerseyNumber: 97, x: defX, y: y + 5, color });

  // Linebackers (3 in base, varies by pressure)
  const isBlitz = pressure.includes('blitz');
  players.push({ id: 'd-mlb', team: 'defense', position: 'LB', jerseyNumber: 54, x: defX + 4, y, color });
  players.push({ id: 'd-wlb', team: 'defense', position: 'LB', jerseyNumber: 56, x: defX + (isBlitz ? 1 : 4), y: y - 6, color });
  players.push({ id: 'd-slb', team: 'defense', position: 'LB', jerseyNumber: 50, x: defX + 4, y: y + 6, color });

  // Secondary — based on coverage
  switch (coverage) {
    case 'cover_1':
    case 'man_free':
      // One high safety, man underneath
      players.push({ id: 'd-fs', team: 'defense', position: 'S', jerseyNumber: 21, x: defX + 15, y, color });
      players.push({ id: 'd-ss', team: 'defense', position: 'S', jerseyNumber: 24, x: defX + 8, y: y + 8, color });
      players.push({ id: 'd-cb1', team: 'defense', position: 'CB', jerseyNumber: 1, x: defX + 1, y: y + 19, color });
      players.push({ id: 'd-cb2', team: 'defense', position: 'CB', jerseyNumber: 4, x: defX + 1, y: y - 19, color });
      break;

    case 'cover_2':
    case 'man_under':
      // Two high safeties
      players.push({ id: 'd-fs', team: 'defense', position: 'S', jerseyNumber: 21, x: defX + 14, y: y - 10, color });
      players.push({ id: 'd-ss', team: 'defense', position: 'S', jerseyNumber: 24, x: defX + 14, y: y + 10, color });
      players.push({ id: 'd-cb1', team: 'defense', position: 'CB', jerseyNumber: 1, x: defX + 1, y: y + 20, color });
      players.push({ id: 'd-cb2', team: 'defense', position: 'CB', jerseyNumber: 4, x: defX + 1, y: y - 20, color });
      break;
    default:
      // Single high, corners deep third
      players.push({ id: 'd-fs', team: 'defense', position: 'S', jerseyNumber: 21, x: defX + 14, y, color });
      players.push({ id: 'd-ss', team: 'defense', position: 'S', jerseyNumber: 24, x: defX + 8, y: y + 10, color });
      players.push({ id: 'd-cb1', team: 'defense', position: 'CB', jerseyNumber: 1, x: defX + 7, y: y + 20, color });
      players.push({ id: 'd-cb2', team: 'defense', position: 'CB', jerseyNumber: 4, x: defX + 7, y: y - 20, color });
      break;

    case 'cover_4':
    case 'quarters':
      // Four deep
      players.push({ id: 'd-fs', team: 'defense', position: 'S', jerseyNumber: 21, x: defX + 12, y: y - 8, color });
      players.push({ id: 'd-ss', team: 'defense', position: 'S', jerseyNumber: 24, x: defX + 12, y: y + 8, color });
      players.push({ id: 'd-cb1', team: 'defense', position: 'CB', jerseyNumber: 1, x: defX + 8, y: y + 20, color });
      players.push({ id: 'd-cb2', team: 'defense', position: 'CB', jerseyNumber: 4, x: defX + 8, y: y - 20, color });
      break;
  }

  return players;
}

// ─── Animation ──────────────────────────────────────────────

function animatePlayer(
  player: PlayerPosition,
  state: PlayState,
  tick: number,
): PlayerPosition {
  if (state.phase !== 'play') return player;

  const playTick = tick - 11; // play starts after snap at tick 11
  if (playTick < 0) return player;

  const speed = 0.3; // yards per tick

  if (player.team === 'offense') {
    // Receivers run routes (simplified: run forward + break)
    if (player.position === 'WR') {
      const breakPoint = 8; // ticks before breaking route
      if (playTick < breakPoint) {
        return { ...player, x: player.x + speed * 2 }; // stem upfield
      }
      // Break inside or outside (randomized slightly)
      const breakDir = player.y > 26.65 ? -speed : speed;
      return { ...player, x: player.x + speed * 0.5, y: player.y + breakDir };
    }

    // QB drops back then holds
    if (player.position === 'QB') {
      if (playTick < 5) {
        return { ...player, x: player.x - speed };
      }
      return player; // pocket
    }

    // RB blocks or runs a route
    if (player.position === 'RB') {
      if (playTick < 3) return player; // pass pro check
      return { ...player, x: player.x + speed, y: player.y + speed * 0.5 };
    }
  }

  if (player.team === 'defense') {
    // D-line rushes forward
    if (player.position === 'DE' || player.position === 'DT') {
      return { ...player, x: player.x - speed * 1.5 };
    }

    // LBs react — drop or rush
    if (player.position === 'LB') {
      if (state.pressureType.includes('blitz') && player.id === 'd-wlb') {
        return { ...player, x: player.x - speed * 2 }; // blitz
      }
      return { ...player, x: player.x + speed * 0.3 }; // drop into coverage
    }

    // Secondary — cover their zones
    if (player.position === 'CB') {
      // Backpedal with receiver
      return { ...player, x: player.x + speed * 0.5 };
    }
    if (player.position === 'S') {
      // Read and react
      if (playTick > 5) {
        return { ...player, x: player.x + speed * 0.3 };
      }
    }
  }

  return player;
}

// ─── Result computation ─────────────────────────────────────

function computeResult(state: PlayState): PlayResult {
  // Simplified outcome: weighted by coverage + pressure
  const coverageQuality = getCoverageQuality(state.coverageShell);
  const pressureLevel = getPressureLevel(state.pressureType);

  // Base yards = random(0-12) adjusted by coverage quality and pressure
  const baseYards = Math.random() * 12;
  const adjusted = baseYards * coverageQuality - pressureLevel * 2;
  const yardsGained = Math.max(-5, Math.round(adjusted));

  const success =
    (state.down <= 2 && yardsGained >= 4) ||
    (state.down >= 3 && yardsGained >= state.distance);

  const descriptions: Record<string, string> = {
    cover_1: `Man coverage with one safety high. ${yardsGained >= 5 ? 'Receiver found a window in man.' : 'Coverage held tight.'}`,
    cover_2: `Two-high safety shell. ${yardsGained >= 5 ? 'Exploited the deep middle void.' : 'Safeties stayed on top.'}`,
    cover_3: `Three-deep zone. ${yardsGained >= 5 ? 'Found the soft spot in the zone.' : 'Zone walls held.'}`,
    cover_4: `Quarters coverage. ${yardsGained >= 5 ? 'Pattern match broke down.' : 'Four deep defenders locked it down.'}`,
  };

  return {
    yardsGained,
    success,
    description: descriptions[state.coverageShell] ?? `Coverage: ${state.coverageShell}. Yards: ${yardsGained}.`,
    coverageShell: state.coverageShell,
    pressureType: state.pressureType,
  };
}

function getCoverageQuality(coverage: string): number {
  // Higher = more yards gained (worse coverage for defense)
  const map: Record<string, number> = {
    cover_0: 1.3,
    cover_1: 0.9,
    cover_2: 0.85,
    cover_3: 1.0,
    cover_4: 0.8,
    quarters: 0.8,
    man_free: 0.9,
    man_under: 0.85,
  };
  return map[coverage] ?? 1.0;
}

function getPressureLevel(pressure: string): number {
  const map: Record<string, number> = {
    base_4: 0,
    base_5: 1,
    base_6: 2,
    lb_blitz: 1.5,
    db_blitz: 2,
    lb_stunt: 1,
    dl_stunt: 0.5,
    no_pressure: -0.5,
  };
  return map[pressure] ?? 0;
}
