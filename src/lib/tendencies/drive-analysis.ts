/**
 * Drive-sequence analysis — how the coordinator calls plays in order.
 *
 * Groups plays into drives (sequences within a game), then analyzes:
 *   - Opening drive patterns (first drive of each half)
 *   - After big gain (10+ yards) — what do they call next?
 *   - After negative play — how do they adjust?
 *   - Play sequencing (run-run-pass, etc.)
 *   - 3-and-out recovery patterns
 *
 * Drives are inferred from play ordering within a game. A new drive
 * starts when down resets to 1 after a non-first-down play, or when
 * quarter changes with a possession change.
 */

import { eq, and } from 'drizzle-orm';
import { withProgramContext } from '@/lib/db/client';
import { plays, games } from '@/lib/db/schema';
import type { TendencyResult, TendencyBreakdown } from './queries';

// ─── Types ──────────────────────────────────────────────────

interface PlayRow {
  id: string;
  playOrder: number;
  down: number | null;
  distance: number | null;
  quarter: number | null;
  formation: string | null;
  playType: string | null;
  gainLoss: number | null;
  result: string | null;
  gameId: string;
}

interface Drive {
  plays: PlayRow[];
  gameId: string;
  startQuarter: number;
  isOpeningDrive: boolean;
}

// ─── Main analysis ──────────────────────────────────────────

export interface DriveAnalysis {
  openingDrivePatterns: TendencyBreakdown;
  afterBigGain: TendencyBreakdown;
  afterNegativePlay: TendencyBreakdown;
  commonSequences: TendencyBreakdown;
  driveLength: TendencyBreakdown;
}

export async function analyzeDriveSequences(
  programId: string,
  opponentId: string,
): Promise<DriveAnalysis> {
  // Fetch all plays for this opponent, ordered by game then play order
  const filter = [
    eq(plays.programId, programId),
    eq(plays.status, 'ready'),
    eq(games.opponentId, opponentId),
  ];

  const allPlays = await withProgramContext(programId, async (tx) =>
    tx
      .select({
        id: plays.id,
        playOrder: plays.playOrder,
        down: plays.down,
        distance: plays.distance,
        quarter: plays.quarter,
        formation: plays.formation,
        playType: plays.playType,
        gainLoss: plays.gainLoss,
        result: plays.result,
        gameId: plays.gameId,
      })
      .from(plays)
      .innerJoin(games, eq(plays.gameId, games.id))
      .where(and(...filter))
      .orderBy(plays.gameId, plays.playOrder),
  );

  // Group into drives
  const drives = segmentDrives(allPlays);

  return {
    openingDrivePatterns: analyzeOpeningDrives(drives),
    afterBigGain: analyzeAfterBigGain(allPlays),
    afterNegativePlay: analyzeAfterNegative(allPlays),
    commonSequences: analyzeSequences(drives),
    driveLength: analyzeDriveLength(drives),
  };
}

// ─── Drive segmentation ─────────────────────────────────────

function segmentDrives(allPlays: PlayRow[]): Drive[] {
  const drives: Drive[] = [];
  let currentDrive: PlayRow[] = [];
  let currentGameId = '';
  let driveIndex = 0;

  for (const play of allPlays) {
    // New game = new drive
    if (play.gameId !== currentGameId) {
      if (currentDrive.length > 0) {
        drives.push(buildDrive(currentDrive, driveIndex));
      }
      currentDrive = [play];
      currentGameId = play.gameId;
      driveIndex = 0;
      continue;
    }

    // New drive if down resets to 1 and previous play wasn't a first down gain
    const prevPlay = currentDrive[currentDrive.length - 1];
    const isNewDrive =
      play.down === 1 &&
      prevPlay &&
      (prevPlay.down === 4 ||
        prevPlay.result === 'Touchdown' ||
        prevPlay.result === 'Interception' ||
        prevPlay.result === 'Fumble' ||
        (prevPlay.down === 3 && (prevPlay.gainLoss ?? 0) < (prevPlay.distance ?? 10)));

    if (isNewDrive && currentDrive.length > 0) {
      drives.push(buildDrive(currentDrive, driveIndex));
      currentDrive = [play];
      driveIndex++;
    } else {
      currentDrive.push(play);
    }
  }

  if (currentDrive.length > 0) {
    drives.push(buildDrive(currentDrive, driveIndex));
  }

  return drives;
}

function buildDrive(plays: PlayRow[], index: number): Drive {
  return {
    plays,
    gameId: plays[0]?.gameId ?? '',
    startQuarter: plays[0]?.quarter ?? 1,
    isOpeningDrive: index === 0,
  };
}

// ─── Analysis functions ─────────────────────────────────────

function analyzeOpeningDrives(drives: Drive[]): TendencyBreakdown {
  const openingDrives = drives.filter((d) => d.isOpeningDrive);
  const groups: Record<string, string[]> = {};

  for (const drive of openingDrives) {
    // Get the first 3 play types as the pattern
    const pattern = drive.plays
      .slice(0, 3)
      .map((p) => p.playType ?? '?')
      .join(' → ');

    if (!groups[pattern]) groups[pattern] = [];
    for (const p of drive.plays.slice(0, 3)) {
      groups[pattern].push(p.id);
    }
  }

  return buildBreakdown('Opening Drive Sequences', groups, openingDrives.length);
}

function analyzeAfterBigGain(allPlays: PlayRow[]): TendencyBreakdown {
  const groups: Record<string, string[]> = {};

  for (let i = 0; i < allPlays.length - 1; i++) {
    const current = allPlays[i];
    const next = allPlays[i + 1];
    if (!current || !next) continue;

    // Big gain = 10+ yards, same game
    if (
      (current.gainLoss ?? 0) >= 10 &&
      current.gameId === next.gameId
    ) {
      const label = next.playType ?? 'Unknown';
      if (!groups[label]) groups[label] = [];
      groups[label].push(next.id);
    }
  }

  const total = Object.values(groups).reduce((s, ids) => s + ids.length, 0);
  return buildBreakdown('Play Call After Big Gain (10+ yds)', groups, total);
}

function analyzeAfterNegative(allPlays: PlayRow[]): TendencyBreakdown {
  const groups: Record<string, string[]> = {};

  for (let i = 0; i < allPlays.length - 1; i++) {
    const current = allPlays[i];
    const next = allPlays[i + 1];
    if (!current || !next) continue;

    // Negative play = loss of yardage, same game
    if (
      (current.gainLoss ?? 0) < 0 &&
      current.gameId === next.gameId
    ) {
      const label = next.playType ?? 'Unknown';
      if (!groups[label]) groups[label] = [];
      groups[label].push(next.id);
    }
  }

  const total = Object.values(groups).reduce((s, ids) => s + ids.length, 0);
  return buildBreakdown('Play Call After Negative Play', groups, total);
}

function analyzeSequences(drives: Drive[]): TendencyBreakdown {
  // Find the most common 2-play sequences
  const groups: Record<string, string[]> = {};

  for (const drive of drives) {
    for (let i = 0; i < drive.plays.length - 1; i++) {
      const playA = drive.plays[i];
      const playB = drive.plays[i + 1];
      if (!playA || !playB) continue;
      const a = playA.playType ?? '?';
      const b = playB.playType ?? '?';
      const seq = `${a} → ${b}`;
      if (!groups[seq]) groups[seq] = [];
      groups[seq].push(playA.id);
      groups[seq].push(playB.id);
    }
  }

  const total = Object.values(groups).reduce((s, ids) => s + ids.length, 0);
  return buildBreakdown('Common 2-Play Sequences', groups, total);
}

function analyzeDriveLength(drives: Drive[]): TendencyBreakdown {
  const buckets: Record<string, string[]> = {
    '1-3 plays': [],
    '4-6 plays': [],
    '7-9 plays': [],
    '10+ plays': [],
  };

  for (const drive of drives) {
    const len = drive.plays.length;
    const bucket = len <= 3 ? '1-3 plays' : len <= 6 ? '4-6 plays' : len <= 9 ? '7-9 plays' : '10+ plays';
    for (const p of drive.plays) {
      buckets[bucket]?.push(p.id);
    }
  }

  return buildBreakdown('Drive Length Distribution', buckets, drives.length);
}

// ─── Helpers ────────────────────────────────────────────────

function confidenceFromCount(count: number): TendencyBreakdown['confidence'] {
  if (count >= 30) return 'very_high';
  if (count >= 15) return 'high';
  if (count >= 8) return 'medium';
  return 'low';
}

function buildBreakdown(
  situation: string,
  groups: Record<string, string[]>,
  sampleSize: number,
): TendencyBreakdown {
  const total = Object.values(groups).reduce((s, ids) => s + ids.length, 0);

  const tendencies: TendencyResult[] = Object.entries(groups)
    .map(([label, playIds]) => ({
      label,
      count: playIds.length,
      total,
      rate: total > 0 ? playIds.length / total : 0,
      playIds,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    situation,
    tendencies,
    sampleSize,
    confidence: confidenceFromCount(sampleSize),
  };
}
