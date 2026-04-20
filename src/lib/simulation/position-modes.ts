/**
 * Position modes — 8 distinct decision models for player simulation.
 *
 * Each position has:
 *   - A camera perspective (where the view is "from")
 *   - Pre-snap decision points (what the player must identify before the snap)
 *   - Post-snap decision points (what they must do after the snap)
 *   - Correct answer logic based on the play state
 *   - Teaching feedback when wrong
 *
 * The position mode runs ON TOP of the base simulation engine.
 * The engine handles 22-player positioning and physics.
 * Position modes add the decision interaction layer.
 */

// ─── Types ──────────────────────────────────────────────────

export type PositionMode = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'CB' | 'S';

export interface CameraConfig {
  /** Descriptive name of the camera angle */
  name: string;
  /** Which player ID the camera centers on (null = top-down) */
  followPlayerId: string | null;
  /** Zoom level (1 = full field, 2 = half field, etc.) */
  zoom: number;
  /** Vertical offset for perspective (higher = more elevated) */
  elevation: 'ground' | 'low' | 'elevated' | 'overhead';
}

export interface DecisionPoint {
  /** What the player must identify/decide */
  prompt: string;
  /** Available options */
  options: string[];
  /** The correct answer(s) — can have multiple valid answers */
  correctAnswers: string[];
  /** When this decision happens */
  phase: 'pre_snap' | 'post_snap';
  /** Teaching explanation when wrong */
  explanation: string;
}

export interface PositionModeConfig {
  position: PositionMode;
  camera: CameraConfig;
  preSnapDecisions: (context: DecisionContext) => DecisionPoint[];
  postSnapDecisions: (context: DecisionContext) => DecisionPoint[];
}

export interface DecisionContext {
  coverageShell: string;
  pressureType: string;
  down: number;
  distance: number;
  formation: string;
}

// ─── Position mode configs ──────────────────────────────────

export const POSITION_MODES: Record<PositionMode, PositionModeConfig> = {
  QB: {
    position: 'QB',
    camera: { name: 'Behind Center (Elevated)', followPlayerId: 'o-qb', zoom: 1.5, elevation: 'elevated' },
    preSnapDecisions: (ctx) => [
      {
        prompt: 'Identify the coverage',
        options: ['Cover 0', 'Cover 1', 'Cover 2', 'Cover 3', 'Cover 4', 'Man Free'],
        correctAnswers: [formatCoverage(ctx.coverageShell)],
        phase: 'pre_snap',
        explanation: buildCoverageExplanation(ctx.coverageShell),
      },
      {
        prompt: 'Protection call',
        options: ['Slide Left', 'Slide Right', 'Max Protect', 'Hot Route'],
        correctAnswers: ctx.pressureType.includes('blitz') ? ['Hot Route', 'Max Protect'] : ['Slide Left', 'Slide Right'],
        phase: 'pre_snap',
        explanation: ctx.pressureType.includes('blitz')
          ? 'Blitz is coming — you need a hot route or max protection to pick it up.'
          : 'Base rush only. Standard slide protection is fine.',
      },
    ],
    postSnapDecisions: (ctx) => [
      {
        prompt: 'Read progression — where do you throw?',
        options: ['First Read (Outside)', 'Second Read (Middle)', 'Third Read (Check Down)', 'Scramble'],
        correctAnswers: getQBReadAnswer(ctx),
        phase: 'post_snap',
        explanation: getQBReadExplanation(ctx),
      },
    ],
  },

  RB: {
    position: 'RB',
    camera: { name: 'Mesh Point', followPlayerId: 'o-rb', zoom: 2, elevation: 'low' },
    preSnapDecisions: (ctx) => [
      {
        prompt: 'Identify the front',
        options: ['4-3 Over', '4-3 Under', '3-4', 'Nickel', '4-2-5'],
        correctAnswers: ctx.pressureType.includes('5') ? ['3-4'] : ['4-3 Over', '4-3 Under'],
        phase: 'pre_snap',
        explanation: 'Count the down linemen and linebackers to identify the front.',
      },
    ],
    postSnapDecisions: (_ctx) => [
      {
        prompt: 'Read the hole — where do you cut?',
        options: ['A Gap', 'B Gap', 'C Gap', 'Bounce Outside', 'Cutback'],
        correctAnswers: ['B Gap', 'C Gap'],
        phase: 'post_snap',
        explanation: 'Read your OL blocks. The double team creates the hole — hit it downhill.',
      },
    ],
  },

  WR: {
    position: 'WR',
    camera: { name: 'Receiver LOS', followPlayerId: 'o-wr1', zoom: 2.5, elevation: 'ground' },
    preSnapDecisions: (ctx) => [
      {
        prompt: 'Identify CB technique',
        options: ['Press', 'Off (5 yards)', 'Bail', 'Soft Squat'],
        correctAnswers: ctx.coverageShell.includes('man') || ctx.coverageShell === 'cover_1' ? ['Press'] : ['Off (5 yards)', 'Bail'],
        phase: 'pre_snap',
        explanation: ctx.coverageShell.includes('man')
          ? 'Man coverage — expect press technique at the line.'
          : 'Zone coverage — the corner will play off and read your release.',
      },
    ],
    postSnapDecisions: (ctx) => [
      {
        prompt: 'Choose your release',
        options: ['Inside Release', 'Outside Release', 'Speed Release', 'Swim Move'],
        correctAnswers: ctx.coverageShell.includes('man') ? ['Swim Move', 'Speed Release'] : ['Inside Release', 'Outside Release'],
        phase: 'post_snap',
        explanation: ctx.coverageShell.includes('man')
          ? 'Against man press, use a physical release to create separation at the line.'
          : 'Against zone, your release direction sets up the break point. Match it to your route.',
      },
    ],
  },

  TE: {
    position: 'TE',
    camera: { name: 'Inline Position', followPlayerId: null, zoom: 2, elevation: 'low' },
    preSnapDecisions: (ctx) => [
      {
        prompt: 'Identify your assignment',
        options: ['Pass Route', 'Pass Block', 'Combo Block + Release', 'Chip and Release'],
        correctAnswers: ctx.pressureType.includes('blitz') ? ['Pass Block', 'Chip and Release'] : ['Pass Route', 'Combo Block + Release'],
        phase: 'pre_snap',
        explanation: ctx.pressureType.includes('blitz')
          ? 'Extra pressure coming — you need to stay in and help protect.'
          : 'Base rush only — you can release into your route after a chip.',
      },
    ],
    postSnapDecisions: () => [],
  },

  OL: {
    position: 'OL',
    camera: { name: 'Lineman POV', followPlayerId: 'o-c', zoom: 3, elevation: 'ground' },
    preSnapDecisions: (_ctx) => [
      {
        prompt: 'Identify the Mike linebacker',
        options: ['Middle (#54)', 'Weak Side (#56)', 'Strong Side (#50)', 'No Mike (Nickel)'],
        correctAnswers: ['Middle (#54)'],
        phase: 'pre_snap',
        explanation: 'The Mike sets the protection. Point to the middle linebacker to set the slide.',
      },
    ],
    postSnapDecisions: (_ctx) => [
      {
        prompt: 'Stunt recognition — the DT loops behind the DE. What do you do?',
        options: ['Pass Off', 'Stay on DE', 'Double the Loop', 'Call Switch'],
        correctAnswers: ['Pass Off', 'Call Switch'],
        phase: 'post_snap',
        explanation: 'When defenders cross, communicate and pass off. Don\'t chase — trust your teammate.',
      },
    ],
  },

  DL: {
    position: 'DL',
    camera: { name: 'D-Line View', followPlayerId: 'd-de1', zoom: 2.5, elevation: 'ground' },
    preSnapDecisions: (ctx) => [
      {
        prompt: 'Read the formation — run or pass tendency?',
        options: ['Run Heavy', 'Pass Heavy', 'Balanced', 'Play Action Look'],
        correctAnswers: ctx.formation === 'spread' ? ['Pass Heavy'] : ['Run Heavy', 'Balanced'],
        phase: 'pre_snap',
        explanation: ctx.formation === 'spread'
          ? 'Spread formation with 4 WRs — pass tendency is high.'
          : 'Heavier personnel — be ready for the run.',
      },
    ],
    postSnapDecisions: () => [
      {
        prompt: 'Choose your rush move',
        options: ['Speed Rush', 'Bull Rush', 'Spin Move', 'Counter/Rip'],
        correctAnswers: ['Speed Rush', 'Counter/Rip'],
        phase: 'post_snap',
        explanation: 'Set up with speed, then counter when the OT over-sets. Keep your hands active.',
      },
    ],
  },

  LB: {
    position: 'LB',
    camera: { name: 'LB Depth (Elevated)', followPlayerId: 'd-mlb', zoom: 1.8, elevation: 'elevated' },
    preSnapDecisions: (_ctx) => [
      {
        prompt: 'Key read — who are you reading?',
        options: ['Guard', 'Tackle', 'Running Back', 'Tight End'],
        correctAnswers: ['Guard', 'Running Back'],
        phase: 'pre_snap',
        explanation: 'Read through the guard to the back. The guard\'s first step tells you run/pass and direction.',
      },
    ],
    postSnapDecisions: (_ctx) => [
      {
        prompt: 'Guard pulls — what do you do?',
        options: ['Spill (Force Outside)', 'Squeeze (Close the Hole)', 'Fill the Gap', 'Drop to Coverage'],
        correctAnswers: ['Spill (Force Outside)', 'Fill the Gap'],
        phase: 'post_snap',
        explanation: 'When the guard pulls, attack downhill and spill the play outside to your help defenders.',
      },
    ],
  },

  CB: {
    position: 'CB',
    camera: { name: 'Corner Position', followPlayerId: 'd-cb1', zoom: 2.5, elevation: 'ground' },
    preSnapDecisions: (ctx) => [
      {
        prompt: 'Your coverage technique',
        options: ['Press Man', 'Off Man', 'Zone (Flat)', 'Zone (Deep Third)', 'Bail Technique'],
        correctAnswers: getCBTechnique(ctx),
        phase: 'pre_snap',
        explanation: buildCBExplanation(ctx),
      },
    ],
    postSnapDecisions: (ctx) => [
      {
        prompt: 'Receiver releases inside — what do you do?',
        options: ['Trail Man', 'Jump the Route', 'Pass Off to Safety', 'Squat on Underneath'],
        correctAnswers: ctx.coverageShell.includes('man') ? ['Trail Man'] : ['Squat on Underneath', 'Pass Off to Safety'],
        phase: 'post_snap',
        explanation: ctx.coverageShell.includes('man')
          ? 'Man coverage — stay in phase and trail the receiver through his route.'
          : 'Zone — sit on the underneath route in your zone and watch the QB\'s eyes.',
      },
    ],
  },

  S: {
    position: 'S',
    camera: { name: 'Safety (Widest View)', followPlayerId: 'd-fs', zoom: 1.2, elevation: 'overhead' },
    preSnapDecisions: (_ctx) => [
      {
        prompt: 'Disguise timing — when do you rotate?',
        options: ['Pre-snap (Early)', 'At the Snap', 'Post-snap Read', 'Hold Coverage'],
        correctAnswers: ['At the Snap', 'Post-snap Read'],
        phase: 'pre_snap',
        explanation: 'Don\'t show your rotation early — the QB reads your pre-snap alignment. Rotate at the snap or after your key read.',
      },
    ],
    postSnapDecisions: (ctx) => [
      {
        prompt: 'It\'s a run play. What\'s your responsibility?',
        options: ['Force (Set the Edge)', 'Alley (Fill Inside)', 'Deep Middle (Stay Back)', 'Pursue from Behind'],
        correctAnswers: ctx.coverageShell === 'cover_1' || ctx.coverageShell === 'cover_3'
          ? ['Alley (Fill Inside)']
          : ['Force (Set the Edge)', 'Alley (Fill Inside)'],
        phase: 'post_snap',
        explanation: 'As the safety, you\'re the last line of defense. Fill your gap assignment based on the coverage call — don\'t freelance.',
      },
    ],
  },
};

// ─── Helpers ────────────────────────────────────────────────

function formatCoverage(shell: string): string {
  const map: Record<string, string> = {
    cover_0: 'Cover 0',
    cover_1: 'Cover 1',
    cover_2: 'Cover 2',
    cover_3: 'Cover 3',
    cover_4: 'Cover 4',
    quarters: 'Cover 4',
    man_free: 'Man Free',
    man_under: 'Cover 2',
  };
  return map[shell] ?? 'Cover 3';
}

function buildCoverageExplanation(shell: string): string {
  const map: Record<string, string> = {
    cover_0: 'No safety help — pure man coverage. Look for the single high safety... wait, there isn\'t one. All man, all pressure.',
    cover_1: 'One high safety. Look at the safeties — single high tells you Cover 1 or Cover 3. The corners\' technique (press vs off) tells you which.',
    cover_2: 'Two high safeties. Both safeties are deep — that\'s Cover 2 or Cover 4. Watch the corners\' depth to distinguish.',
    cover_3: 'One high safety, corners at depth. The single high safety + off corners = Cover 3. The deep middle is covered.',
    cover_4: 'Four defenders deep. Both safeties and both corners play deep quarter zones.',
    man_free: 'One high safety with man underneath. The safety is free — everyone else is in man.',
    man_under: 'Two high safeties, man underneath. Looks like Cover 2 but the underneath defenders are in man, not zone.',
  };
  return map[shell] ?? 'Read the safeties first — one high or two high tells you the family of coverages.';
}

function getQBReadAnswer(ctx: DecisionContext): string[] {
  if (ctx.coverageShell === 'cover_2') return ['Second Read (Middle)'];
  if (ctx.coverageShell === 'cover_3') return ['First Read (Outside)'];
  if (ctx.pressureType.includes('blitz')) return ['First Read (Outside)', 'Third Read (Check Down)'];
  return ['First Read (Outside)', 'Second Read (Middle)'];
}

function getQBReadExplanation(ctx: DecisionContext): string {
  if (ctx.coverageShell === 'cover_2') {
    return 'Cover 2 has two deep safeties splitting the field. The void is the deep middle — work your second read over the middle.';
  }
  if (ctx.coverageShell === 'cover_3') {
    return 'Cover 3 has three deep defenders. The voids are the flats and the seams — attack outside first.';
  }
  if (ctx.pressureType.includes('blitz')) {
    return 'Pressure is coming. Get the ball out fast — hit your first read or check down. Don\'t hold it.';
  }
  return 'Work through your progression. First read to second read — trust your eyes and deliver on time.';
}

function getCBTechnique(ctx: DecisionContext): string[] {
  if (ctx.coverageShell === 'cover_1' || ctx.coverageShell === 'man_free') return ['Press Man'];
  if (ctx.coverageShell === 'cover_2') return ['Zone (Flat)'];
  if (ctx.coverageShell === 'cover_3') return ['Zone (Deep Third)', 'Bail Technique'];
  if (ctx.coverageShell === 'cover_4') return ['Zone (Deep Third)'];
  return ['Off Man'];
}

function buildCBExplanation(ctx: DecisionContext): string {
  if (ctx.coverageShell === 'cover_1' || ctx.coverageShell === 'man_free') {
    return 'Cover 1 — you have man responsibility with a free safety behind you. Press at the line.';
  }
  if (ctx.coverageShell === 'cover_2') {
    return 'Cover 2 — you have the flat zone. Funnel the receiver inside and jam at the line, then drop to the flat.';
  }
  if (ctx.coverageShell === 'cover_3') {
    return 'Cover 3 — you have the deep third on your side. Get depth and width. Don\'t let anyone behind you.';
  }
  return 'Match your technique to the coverage call.';
}

// ─── Scoring ────────────────────────────────────────────────

export interface DecisionResult {
  decision: DecisionPoint;
  playerAnswer: string;
  correct: boolean;
  timeMs: number;
}

export interface SessionScore {
  totalDecisions: number;
  correctDecisions: number;
  accuracy: number;
  avgDecisionTimeMs: number;
  results: DecisionResult[];
}

export function computeSessionScore(results: DecisionResult[]): SessionScore {
  const correct = results.filter((r) => r.correct).length;
  const avgTime = results.length > 0
    ? results.reduce((sum, r) => sum + r.timeMs, 0) / results.length
    : 0;

  return {
    totalDecisions: results.length,
    correctDecisions: correct,
    accuracy: results.length > 0 ? correct / results.length : 0,
    avgDecisionTimeMs: Math.round(avgTime),
    results,
  };
}
