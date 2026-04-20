/**
 * POST /api/scouting/college-roster
 *
 * Fetches a college opponent's roster + coaching info from ESPN's public
 * API and caches it on the opponents row. Refuses to operate on HS
 * programs by policy — high-school player data is off-limits regardless
 * of public availability.
 */

import { withProgramContext } from '@/lib/db/client';
import { opponents, programs } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import {
  fetchCollegeOpponent,
  searchCollegeTeam,
  type ProgramLevel,
} from '@/lib/scouting/college-scout';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { AuthError, requireCoachRoleForProgram } from '@/lib/auth/guards';

const requestSchema = z.object({
  programId: z.string().uuid(),
  opponentId: z.string().uuid(),
  /** Optional override — if not provided, we use the opponent's stored name. */
  searchQuery: z.string().min(1).max(200).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/scouting/college-roster', method: 'POST' }, req);
  try {
    const body = await req.json();
    const input = requestSchema.parse(body);
    await requireCoachRoleForProgram('coordinator', input.programId);

    const result = await withProgramContext(input.programId, async (tx) => {
      const [program] = await tx
        .select({ level: programs.level })
        .from(programs)
        .where(eq(programs.id, input.programId));
      if (!program) {
        return { status: 404 as const, error: 'Program not found' };
      }
      if (program.level === 'hs') {
        return {
          status: 403 as const,
          error:
            'College roster scraping is disabled for high-school programs by policy.',
        };
      }

      const [opponent] = await tx
        .select()
        .from(opponents)
        .where(eq(opponents.id, input.opponentId));
      if (!opponent || opponent.programId !== input.programId) {
        return { status: 404 as const, error: 'Opponent not found' };
      }

      const level = program.level as ProgramLevel;
      const query = input.searchQuery ?? opponent.name;

      const team = await searchCollegeTeam(query, level);
      if (!team) {
        return {
          status: 404 as const,
          error: `No ESPN team matched "${query}". Try a different search query.`,
        };
      }

      const scoutData = await fetchCollegeOpponent(team.espnId, level);

      const [updated] = await tx
        .update(opponents)
        .set({
          scoutData,
          scoutDataFetchedAt: new Date(),
        })
        .where(eq(opponents.id, input.opponentId))
        .returning();

      return { status: 200 as const, opponent: updated, scoutData };
    });

    if (result.status !== 200) {
      span.done({ status: result.status });
      return Response.json({ error: result.error }, { status: result.status });
    }

    span.done({
      opponentId: input.opponentId,
      espnTeam: result.scoutData.team.displayName,
      rosterSize: result.scoutData.roster.length,
    });
    return Response.json({
      opponent: result.opponent,
      scoutData: result.scoutData,
    });
  } catch (error) {
    span.fail(error);
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to fetch roster';
    return Response.json({ error: message }, { status: 500 });
  }
}
