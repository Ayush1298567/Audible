/**
 * Tendency engine — SQL-based computation over the tag DB.
 *
 * Every tendency is a filtered aggregate with clip evidence.
 * The engine computes formation frequency, play-type rates by
 * situation, and multi-dimensional tendency breakdowns.
 *
 * All queries run through withProgramContext (RLS-enforced).
 * All results include play count (sample size) and the play IDs
 * that back the number (evidence linkage, PLAN.md §8 rule 1).
 *
 * ─── How tendencies work ───────────────────────────────────
 *
 *   INPUT:  plays table rows, filtered by opponent + situation
 *   OUTPUT: { label, count, total, rate, playIds[] }
 *
 *   Example: "run rate on 1st and 10"
 *     filter: down=1, distance=10
 *     group:  playType
 *     result: [
 *       { label: "Run", count: 32, total: 42, rate: 0.762, playIds: [...] },
 *       { label: "Pass", count: 10, total: 42, rate: 0.238, playIds: [...] }
 *     ]
 *
 * ────────────────────────────────────────────────────────────
 */

import { sql, eq, and, type SQL } from 'drizzle-orm';
import { withProgramContext } from '@/lib/db/client';
import { plays, games } from '@/lib/db/schema';

// ─── Types ──────────────────────────────────────────────────

export interface TendencyResult {
  label: string;
  count: number;
  total: number;
  rate: number;
  playIds: string[];
}

export interface TendencyBreakdown {
  situation: string;
  tendencies: TendencyResult[];
  sampleSize: number;
  confidence: 'low' | 'medium' | 'high' | 'very_high';
}

export interface SituationFilter {
  opponentId?: string;
  down?: number;
  distanceBucket?: string;
  quarter?: number;
  fieldZone?: string;
  formation?: string;
  personnel?: string;
}

// ─── Core query builder ─────────────────────────────────────

function buildWhereClause(
  programId: string,
  filter: SituationFilter,
): SQL[] {
  const conditions: SQL[] = [
    eq(plays.programId, programId),
    eq(plays.status, 'ready'),
  ];

  if (filter.opponentId) {
    conditions.push(eq(games.opponentId, filter.opponentId));
  }
  if (filter.down != null) {
    conditions.push(eq(plays.down, filter.down));
  }
  if (filter.distanceBucket) {
    conditions.push(eq(plays.distanceBucket, filter.distanceBucket));
  }
  if (filter.quarter != null) {
    conditions.push(eq(plays.quarter, filter.quarter));
  }
  if (filter.formation) {
    conditions.push(eq(plays.formation, filter.formation));
  }
  if (filter.personnel) {
    conditions.push(eq(plays.personnel, filter.personnel));
  }

  return conditions;
}

function confidenceFromCount(count: number): TendencyBreakdown['confidence'] {
  if (count >= 30) return 'very_high';
  if (count >= 15) return 'high';
  if (count >= 8) return 'medium';
  return 'low';
}

// ─── Tendency queries ───────────────────────────────────────

/**
 * Formation frequency — how often each formation appears.
 */
export async function getFormationFrequency(
  programId: string,
  filter: SituationFilter,
): Promise<TendencyBreakdown> {
  return groupByColumn(programId, filter, 'formation', 'Formation Frequency');
}

/**
 * Play type distribution — run vs pass vs RPO etc.
 */
export async function getPlayTypeDistribution(
  programId: string,
  filter: SituationFilter,
): Promise<TendencyBreakdown> {
  return groupByColumn(programId, filter, 'playType', 'Play Type Distribution');
}

/**
 * Play direction tendency.
 */
export async function getPlayDirectionTendency(
  programId: string,
  filter: SituationFilter,
): Promise<TendencyBreakdown> {
  return groupByColumn(programId, filter, 'playDirection', 'Play Direction');
}

/**
 * Personnel grouping frequency.
 */
export async function getPersonnelFrequency(
  programId: string,
  filter: SituationFilter,
): Promise<TendencyBreakdown> {
  return groupByColumn(programId, filter, 'personnel', 'Personnel Grouping');
}

/**
 * Success rate by play type — "success" = gained expected yards.
 * Short: 4+ yards, medium: 60%+ of distance, long: first down.
 */
export async function getSuccessRateByPlayType(
  programId: string,
  filter: SituationFilter,
): Promise<TendencyBreakdown> {
  const conditions = buildWhereClause(programId, filter);

  const result = await withProgramContext(programId, async (tx) =>
    tx
      .select({
        playType: plays.playType,
        gainLoss: plays.gainLoss,
        down: plays.down,
        distance: plays.distance,
        id: plays.id,
      })
      .from(plays)
      .leftJoin(games, eq(plays.gameId, games.id))
      .where(and(...conditions)),
  );

  // Group by play type, calculate success rate
  const groups: Record<string, { success: number; total: number; playIds: string[] }> = {};

  for (const row of result) {
    const key = row.playType ?? 'Unknown';
    if (!groups[key]) groups[key] = { success: 0, total: 0, playIds: [] };
    groups[key].total++;
    groups[key].playIds.push(row.id);

    // Success = gained expected yards for the situation
    const gain = row.gainLoss ?? 0;
    const dist = row.distance ?? 10;
    const isSuccess =
      (row.down === 1 && gain >= 4) ||
      (row.down === 2 && gain >= dist * 0.6) ||
      ((row.down === 3 || row.down === 4) && gain >= dist);

    if (isSuccess) groups[key].success++;
  }

  const tendencies: TendencyResult[] = Object.entries(groups)
    .map(([label, g]) => ({
      label,
      count: g.success,
      total: g.total,
      rate: g.total > 0 ? g.success / g.total : 0,
      playIds: g.playIds,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    situation: 'Success Rate by Play Type',
    tendencies,
    sampleSize: result.length,
    confidence: confidenceFromCount(result.length),
  };
}

/**
 * Situation breakdown — tendencies across standard football situations.
 * Returns one TendencyBreakdown per situation.
 */
export async function getSituationBreakdown(
  programId: string,
  opponentId: string,
): Promise<TendencyBreakdown[]> {
  const situations: Array<{ label: string; filter: SituationFilter }> = [
    { label: '1st & 10', filter: { opponentId, down: 1 } },
    { label: '2nd & Short (1-3)', filter: { opponentId, down: 2, distanceBucket: 'short' } },
    { label: '2nd & Long (7+)', filter: { opponentId, down: 2, distanceBucket: 'long' } },
    { label: '3rd & Short (1-3)', filter: { opponentId, down: 3, distanceBucket: 'short' } },
    { label: '3rd & Medium (4-6)', filter: { opponentId, down: 3, distanceBucket: 'medium' } },
    { label: '3rd & Long (7+)', filter: { opponentId, down: 3, distanceBucket: 'long' } },
  ];

  const results: TendencyBreakdown[] = [];

  for (const sit of situations) {
    const breakdown = await getPlayTypeDistribution(programId, sit.filter);
    results.push({
      ...breakdown,
      situation: sit.label,
    });
  }

  return results;
}

/**
 * Self-scout: identify your own most predictable tendencies.
 * Returns tendencies where the top option rate exceeds 70%.
 */
export async function getSelfScoutAlerts(
  programId: string,
): Promise<TendencyBreakdown[]> {
  const situations: Array<{ label: string; filter: SituationFilter }> = [
    { label: '1st & 10', filter: { down: 1 } },
    { label: '2nd & Short', filter: { down: 2, distanceBucket: 'short' } },
    { label: '2nd & Long', filter: { down: 2, distanceBucket: 'long' } },
    { label: '3rd & Short', filter: { down: 3, distanceBucket: 'short' } },
    { label: '3rd & Medium', filter: { down: 3, distanceBucket: 'medium' } },
    { label: '3rd & Long', filter: { down: 3, distanceBucket: 'long' } },
  ];

  const alerts: TendencyBreakdown[] = [];

  for (const sit of situations) {
    const breakdown = await getPlayTypeDistribution(programId, sit.filter);
    // Only flag if sample size is meaningful and top tendency is predictable
    if (breakdown.sampleSize >= 8 && breakdown.tendencies.length > 0) {
      const topRate = breakdown.tendencies[0]?.rate ?? 0;
      if (topRate >= 0.70) {
        alerts.push({
          ...breakdown,
          situation: sit.label,
        });
      }
    }
  }

  return alerts;
}

// ─── Generic group-by helper ────────────────────────────────

type TextColumnName = 'formation' | 'personnel' | 'playType' | 'playDirection' | 'motion' | 'odk' | 'result' | 'hash' | 'distanceBucket';

async function groupByColumn(
  programId: string,
  filter: SituationFilter,
  columnName: TextColumnName,
  situationLabel: string,
): Promise<TendencyBreakdown> {
  const conditions = buildWhereClause(programId, filter);

  // Use raw SQL for the column reference to avoid Drizzle's strict column typing
  const columnRef = sql.raw(`"${columnName === 'playType' ? 'play_type' : columnName === 'playDirection' ? 'play_direction' : columnName === 'distanceBucket' ? 'distance_bucket' : columnName}"`);

  const result = await withProgramContext(programId, async (tx) =>
    tx
      .select({
        value: sql<string>`${columnRef}`,
        id: plays.id,
      })
      .from(plays)
      .leftJoin(games, eq(plays.gameId, games.id))
      .where(and(...conditions)),
  );

  // Group results
  const groups: Record<string, string[]> = {};
  for (const row of result) {
    const key = (row.value ?? 'Unknown') as string;
    if (!groups[key]) groups[key] = [];
    groups[key].push(row.id);
  }

  const total = result.length;
  const tendencies: TendencyResult[] = Object.entries(groups)
    .map(([label, playIds]) => ({
      label,
      count: playIds.length,
      total,
      rate: total > 0 ? playIds.length / total : 0,
      playIds,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    situation: situationLabel,
    tendencies,
    sampleSize: total,
    confidence: confidenceFromCount(total),
  };
}
