/**
 * Opponent Playbook Extraction — auto-groups plays by formation + concept.
 *
 * Analyzes all plays against an opponent and groups them into
 * a browsable playbook structure:
 *   Formation → Play Concept → clips with success rate
 *
 * This is the evidence behind the scouting report — what they
 * actually run from each formation, how often, and how well.
 */

import { eq, and } from 'drizzle-orm';
import { withProgramContext } from '@/lib/db/client';
import { plays, games } from '@/lib/db/schema';

// ─── Types ──────────────────────────────────────────────────

export interface PlaybookPlay {
  name: string;
  formation: string;
  playType: string;
  direction: string;
  clipCount: number;
  successRate: number;
  avgGain: number;
  playIds: string[];
}

export interface FormationGroup {
  formation: string;
  totalPlays: number;
  runRate: number;
  plays: PlaybookPlay[];
}

export interface OpponentPlaybook {
  formations: FormationGroup[];
  totalPlays: number;
  uniqueFormations: number;
  uniqueConcepts: number;
}

// ─── Extraction ─────────────────────────────────────────────

export async function extractOpponentPlaybook(
  programId: string,
  opponentId: string,
): Promise<OpponentPlaybook> {
  const filter = [
    eq(plays.programId, programId),
    eq(plays.status, 'ready'),
    eq(games.opponentId, opponentId),
  ];

  const allPlays = await withProgramContext(programId, async (tx) =>
    tx
      .select({
        id: plays.id,
        formation: plays.formation,
        playType: plays.playType,
        playDirection: plays.playDirection,
        gainLoss: plays.gainLoss,
        down: plays.down,
        distance: plays.distance,
      })
      .from(plays)
      .innerJoin(games, eq(plays.gameId, games.id))
      .where(and(...filter)),
  );

  // Group by formation → play type + direction
  const formationMap: Record<string, Record<string, {
    playIds: string[];
    gains: number[];
    successes: number;
    direction: string;
    playType: string;
  }>> = {};

  for (const play of allPlays) {
    const fmt = play.formation ?? 'Unknown';
    const pt = play.playType ?? 'Unknown';
    const dir = play.playDirection ?? '';
    const key = `${pt}${dir ? ` ${dir}` : ''}`;

    if (!formationMap[fmt]) formationMap[fmt] = {};
    if (!formationMap[fmt][key]) {
      formationMap[fmt][key] = {
        playIds: [],
        gains: [],
        successes: 0,
        direction: dir,
        playType: pt,
      };
    }

    const group = formationMap[fmt]?.[key];
    if (!group) continue;
    group.playIds.push(play.id);
    group.gains.push(play.gainLoss ?? 0);

    // Calculate success
    const gain = play.gainLoss ?? 0;
    const dist = play.distance ?? 10;
    const isSuccess =
      (play.down === 1 && gain >= 4) ||
      (play.down === 2 && gain >= dist * 0.6) ||
      ((play.down === 3 || play.down === 4) && gain >= dist);
    if (isSuccess) group.successes++;
  }

  // Build formation groups
  const formations: FormationGroup[] = [];
  let uniqueConcepts = 0;

  for (const [formation, concepts] of Object.entries(formationMap)) {
    const playbookPlays: PlaybookPlay[] = [];
    let totalInFormation = 0;
    let runCount = 0;

    for (const [name, data] of Object.entries(concepts)) {
      uniqueConcepts++;
      const avgGain = data.gains.length > 0
        ? data.gains.reduce((s, g) => s + g, 0) / data.gains.length
        : 0;

      playbookPlays.push({
        name: `${formation} — ${name}`,
        formation,
        playType: data.playType,
        direction: data.direction,
        clipCount: data.playIds.length,
        successRate: data.playIds.length > 0 ? data.successes / data.playIds.length : 0,
        avgGain: Math.round(avgGain * 10) / 10,
        playIds: data.playIds,
      });

      totalInFormation += data.playIds.length;
      if (data.playType.toLowerCase().includes('run')) runCount += data.playIds.length;
    }

    playbookPlays.sort((a, b) => b.clipCount - a.clipCount);

    formations.push({
      formation,
      totalPlays: totalInFormation,
      runRate: totalInFormation > 0 ? runCount / totalInFormation : 0,
      plays: playbookPlays,
    });
  }

  formations.sort((a, b) => b.totalPlays - a.totalPlays);

  return {
    formations,
    totalPlays: allPlays.length,
    uniqueFormations: formations.length,
    uniqueConcepts,
  };
}
