/**
 * Command bar tools — the actions the LLM can invoke.
 *
 * Each tool is a structured function the LLM calls via tool-use.
 * The LLM parses natural language into one of these tool calls,
 * the tool executes a query against the tag DB, and the result
 * renders inline below the command bar.
 *
 * Tool categories:
 *   1. Film search — filter plays by tag combinations
 *   2. Tendency query — compute a tendency on the fly
 *   3. Player lookup — find plays involving a specific player
 *   4. Stats query — aggregate stats (completion rate, run rate, etc.)
 *
 * All tools receive programId from the session context, not from
 * the LLM (prevents the LLM from querying other programs).
 */

import { z } from 'zod';
import { tool } from 'ai';
import { withProgramContext } from '@/lib/db/client';
import { plays, games, opponents, cvTags, playerDetections } from '@/lib/db/schema';
import { eq, and, gte, lte, like, sql, type SQL } from 'drizzle-orm';

/**
 * Build the command bar toolset for a specific program.
 * The programId is baked into each tool's execute function
 * so the LLM cannot access data from other programs.
 */
export function buildCommandBarTools(programId: string) {
  return {
    searchPlays: tool({
      description: 'Search for plays matching specific criteria. Use this when the coach asks to "show me" or "find" plays with certain characteristics.',
      inputSchema: z.object({
        down: z.number().int().min(1).max(4).optional().describe('Down number (1-4)'),
        distanceBucket: z.enum(['short', 'medium', 'long']).optional().describe('Distance category: short (1-3), medium (4-6), long (7+)'),
        formation: z.string().optional().describe('Offensive formation name'),
        personnel: z.string().optional().describe('Personnel grouping (11, 12, 21, etc.)'),
        playType: z.string().optional().describe('Play type (Run, Pass, etc.)'),
        playDirection: z.string().optional().describe('Play direction'),
        quarter: z.number().int().min(1).max(5).optional().describe('Game quarter'),
        opponentName: z.string().optional().describe('Opponent team name to filter by'),
        minGain: z.number().optional().describe('Minimum yards gained'),
        maxGain: z.number().optional().describe('Maximum yards gained'),
        coverageShell: z.string().optional().describe('Defensive coverage (cover_1, cover_2, cover_3, cover_4, quarters, man_free, man_under)'),
        pressureType: z.string().optional().describe('Pressure type (base_4, lb_blitz, db_blitz, etc.)'),
        blockingScheme: z.string().optional().describe('Blocking scheme (inside_zone, power, counter, etc.)'),
        routeConcept: z.string().optional().describe('Route concept (mesh, levels, flood, etc.)'),
        limit: z.number().int().min(1).max(100).default(20).describe('Max results to return'),
      }),
      execute: async (params) => {
        const conditions: SQL[] = [
          eq(plays.programId, programId),
          eq(plays.status, 'ready'),
        ];

        if (params.down) conditions.push(eq(plays.down, params.down));
        if (params.distanceBucket) conditions.push(eq(plays.distanceBucket, params.distanceBucket));
        if (params.formation) conditions.push(like(plays.formation, `%${params.formation}%`));
        if (params.personnel) conditions.push(eq(plays.personnel, params.personnel));
        if (params.playType) conditions.push(like(plays.playType, `%${params.playType}%`));
        if (params.playDirection) conditions.push(like(plays.playDirection, `%${params.playDirection}%`));
        if (params.quarter) conditions.push(eq(plays.quarter, params.quarter));
        if (params.minGain != null) conditions.push(gte(plays.gainLoss, params.minGain));
        if (params.maxGain != null) conditions.push(lte(plays.gainLoss, params.maxGain));

        if (params.opponentName) {
          conditions.push(like(opponents.name, `%${params.opponentName}%`));
        }

        let result = await withProgramContext(programId, async (tx) =>
          tx
            .select({
              id: plays.id,
              playOrder: plays.playOrder,
              down: plays.down,
              distance: plays.distance,
              formation: plays.formation,
              personnel: plays.personnel,
              playType: plays.playType,
              gainLoss: plays.gainLoss,
              result: plays.result,
              clipBlobKey: plays.clipBlobKey,
              opponentName: opponents.name,
            })
            .from(plays)
            .leftJoin(games, eq(plays.gameId, games.id))
            .leftJoin(opponents, eq(games.opponentId, opponents.id))
            .where(and(...conditions))
            .orderBy(plays.playOrder)
            .limit(params.limit),
        );

        // If CV filters were requested, post-filter by cv_tags
        if (params.coverageShell || params.pressureType || params.blockingScheme || params.routeConcept) {
          const playIds = result.map(r => r.id);
          if (playIds.length > 0) {
            const cvResults = await withProgramContext(programId, async (tx) =>
              tx.select({ playId: cvTags.playId, tagType: cvTags.tagType, value: cvTags.value })
                .from(cvTags)
                .where(and(
                  eq(cvTags.programId, programId),
                  eq(cvTags.isSurfaced, true),
                  sql`${cvTags.playId} = ANY(${playIds})`,
                )),
            );

            const cvByPlay = new Map<string, Record<string, unknown>>();
            for (const cv of cvResults) {
              if (!cvByPlay.has(cv.playId)) cvByPlay.set(cv.playId, {});
              const entry = cvByPlay.get(cv.playId);
              if (entry) entry[cv.tagType] = cv.value;
            }

            result = result.filter(r => {
              const cv = cvByPlay.get(r.id);
              if (!cv) return false;
              if (params.coverageShell) {
                const tag = cv.coverage_shell as Record<string, unknown> | undefined;
                if (tag?.coverage !== params.coverageShell) return false;
              }
              if (params.pressureType) {
                const tag = cv.pressure_type as Record<string, unknown> | undefined;
                if (tag?.type !== params.pressureType) return false;
              }
              if (params.blockingScheme) {
                const tag = cv.blocking_scheme as Record<string, unknown> | undefined;
                if (tag?.scheme !== params.blockingScheme) return false;
              }
              if (params.routeConcept) {
                const tag = cv.route_concept as Record<string, unknown> | undefined;
                if (tag?.concept !== params.routeConcept) return false;
              }
              return true;
            });
          }
        }

        return {
          plays: result,
          count: result.length,
          message: result.length > 0
            ? `Found ${result.length} plays matching your criteria.`
            : 'No plays found matching those criteria.',
        };
      },
    }),

    computeTendency: tool({
      description: 'Compute a tendency percentage for a specific situation. Use when the coach asks "what percentage", "how often", "what rate", or any tendency question.',
      inputSchema: z.object({
        groupBy: z.enum(['playType', 'formation', 'personnel', 'playDirection']).describe('What to group the tendency by'),
        opponentName: z.string().optional().describe('Filter to a specific opponent'),
        down: z.number().int().min(1).max(4).optional(),
        distanceBucket: z.enum(['short', 'medium', 'long']).optional(),
        quarter: z.number().int().min(1).max(5).optional(),
        formation: z.string().optional(),
        personnel: z.string().optional(),
      }),
      execute: async (params) => {
        const conditions: SQL[] = [
          eq(plays.programId, programId),
          eq(plays.status, 'ready'),
        ];

        if (params.down) conditions.push(eq(plays.down, params.down));
        if (params.distanceBucket) conditions.push(eq(plays.distanceBucket, params.distanceBucket));
        if (params.quarter) conditions.push(eq(plays.quarter, params.quarter));
        if (params.formation) conditions.push(like(plays.formation, `%${params.formation}%`));
        if (params.personnel) conditions.push(eq(plays.personnel, params.personnel));
        if (params.opponentName) {
          conditions.push(like(opponents.name, `%${params.opponentName}%`));
        }

        // Map groupBy to the actual DB column name (snake_case)
        const columnNameMap: Record<string, string> = {
          playType: 'play_type',
          formation: 'formation',
          personnel: 'personnel',
          playDirection: 'play_direction',
        };
        const dbColumnName = columnNameMap[params.groupBy] ?? 'play_type';
        const columnRef = sql.raw(`"${dbColumnName}"`);

        const result = await withProgramContext(programId, async (tx) =>
          tx
            .select({ value: sql<string>`${columnRef}`, id: plays.id })
            .from(plays)
            .leftJoin(games, eq(plays.gameId, games.id))
            .leftJoin(opponents, eq(games.opponentId, opponents.id))
            .where(and(...conditions)),
        );

        const groups: Record<string, number> = {};
        for (const row of result) {
          const key = (row.value as string | null) ?? 'Unknown';
          groups[key] = (groups[key] ?? 0) + 1;
        }

        const total = result.length;
        const tendencies = Object.entries(groups)
          .map(([label, count]) => ({
            label,
            count,
            total,
            rate: total > 0 ? Math.round((count / total) * 100) : 0,
          }))
          .sort((a, b) => b.count - a.count);

        return {
          tendencies,
          total,
          confidence: total >= 30 ? 'very_high' : total >= 15 ? 'high' : total >= 8 ? 'medium' : 'low',
          message: total > 0
            ? `Based on ${total} plays: ${tendencies.slice(0, 3).map(t => `${t.label} ${t.rate}%`).join(', ')}`
            : 'No plays found for that situation.',
        };
      },
    }),

    getPlayerAlignments: tool({
      description: 'Get alignment data for a specific position or player. Use when the coach asks about cushion depth, safety depth, alignment, or player-specific tendencies.',
      inputSchema: z.object({
        team: z.enum(['offense', 'defense']).describe('Which side of the ball'),
        positionEstimate: z.string().optional().describe('Position to filter (CB, S, LB, WR, OL, etc.)'),
        jerseyNumber: z.number().int().optional().describe('Specific jersey number'),
        opponentName: z.string().optional().describe('Opponent to filter by'),
      }),
      execute: async (params) => {
        const conditions: SQL[] = [
          eq(playerDetections.programId, programId),
          eq(playerDetections.team, params.team),
        ];

        if (params.positionEstimate) {
          conditions.push(eq(playerDetections.positionEstimate, params.positionEstimate));
        }
        if (params.jerseyNumber) {
          conditions.push(eq(playerDetections.jerseyNumber, params.jerseyNumber));
        }

        const result = await withProgramContext(programId, async (tx) =>
          tx
            .select({
              playId: playerDetections.playId,
              jerseyNumber: playerDetections.jerseyNumber,
              positionEstimate: playerDetections.positionEstimate,
              depthYards: playerDetections.depthYards,
              alignmentNotes: playerDetections.alignmentNotes,
            })
            .from(playerDetections)
            .where(and(...conditions))
            .limit(50),
        );

        // Compute average depth
        const depths = result.filter(r => r.depthYards != null).map(r => r.depthYards as number);
        const avgDepth = depths.length > 0 ? depths.reduce((a, b) => a + b, 0) / depths.length : null;

        // Collect unique alignment notes
        const notes = [...new Set(result.map(r => r.alignmentNotes).filter(Boolean))].slice(0, 10);

        return {
          detections: result.length,
          averageDepthYards: avgDepth ? Math.round(avgDepth * 10) / 10 : null,
          commonAlignments: notes,
          details: result.slice(0, 20),
          message: result.length > 0
            ? `Found ${result.length} detections. Average depth: ${avgDepth?.toFixed(1) ?? 'N/A'} yards. Common alignments: ${notes.slice(0, 3).join(', ')}`
            : 'No player detections found matching those criteria.',
        };
      },
    }),

    getStats: tool({
      description: 'Get aggregate stats like completion rate, yards per carry, average gain, etc. Use when the coach asks "what is our/their" followed by a stat.',
      inputSchema: z.object({
        stat: z.enum(['completionRate', 'yardsPerCarry', 'averageGain', 'successRate', 'playCount']).describe('Which stat to compute'),
        opponentName: z.string().optional(),
        down: z.number().int().min(1).max(4).optional(),
        formation: z.string().optional(),
      }),
      execute: async (params) => {
        const conditions: SQL[] = [
          eq(plays.programId, programId),
          eq(plays.status, 'ready'),
        ];

        if (params.down) conditions.push(eq(plays.down, params.down));
        if (params.formation) conditions.push(like(plays.formation, `%${params.formation}%`));
        if (params.opponentName) {
          conditions.push(like(opponents.name, `%${params.opponentName}%`));
        }

        const result = await withProgramContext(programId, async (tx) =>
          tx
            .select({
              playType: plays.playType,
              gainLoss: plays.gainLoss,
              result: plays.result,
              down: plays.down,
              distance: plays.distance,
            })
            .from(plays)
            .leftJoin(games, eq(plays.gameId, games.id))
            .leftJoin(opponents, eq(games.opponentId, opponents.id))
            .where(and(...conditions)),
        );

        const total = result.length;
        if (total === 0) return { value: null, total: 0, message: 'No plays found.' };

        switch (params.stat) {
          case 'playCount':
            return { value: total, total, message: `${total} plays found.` };

          case 'averageGain': {
            const gains = result.filter(r => r.gainLoss != null).map(r => r.gainLoss as number);
            const avg = gains.length > 0 ? gains.reduce((a, b) => a + b, 0) / gains.length : 0;
            return { value: Math.round(avg * 10) / 10, total: gains.length, message: `Average gain: ${avg.toFixed(1)} yards (${gains.length} plays)` };
          }

          case 'yardsPerCarry': {
            const runs = result.filter(r => r.playType?.toLowerCase().includes('run') && r.gainLoss != null);
            const ypc = runs.length > 0 ? runs.reduce((a, b) => a + (b.gainLoss ?? 0), 0) / runs.length : 0;
            return { value: Math.round(ypc * 10) / 10, total: runs.length, message: `Yards per carry: ${ypc.toFixed(1)} (${runs.length} carries)` };
          }

          case 'completionRate': {
            const passes = result.filter(r => r.playType?.toLowerCase().includes('pass'));
            const completions = passes.filter(r => {
              const res = r.result?.toLowerCase() ?? '';
              return res.includes('complete') || (r.gainLoss != null && r.gainLoss > 0);
            });
            const rate = passes.length > 0 ? completions.length / passes.length : 0;
            return { value: Math.round(rate * 100), total: passes.length, message: `Completion rate: ${Math.round(rate * 100)}% (${completions.length}/${passes.length})` };
          }

          case 'successRate': {
            let successes = 0;
            for (const r of result) {
              const gain = r.gainLoss ?? 0;
              const dist = r.distance ?? 10;
              if (
                (r.down === 1 && gain >= 4) ||
                (r.down === 2 && gain >= dist * 0.6) ||
                ((r.down === 3 || r.down === 4) && gain >= dist)
              ) successes++;
            }
            const rate = total > 0 ? successes / total : 0;
            return { value: Math.round(rate * 100), total, message: `Success rate: ${Math.round(rate * 100)}% (${successes}/${total})` };
          }
        }
      },
    }),
  };
}
