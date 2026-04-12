import { withProgramContext } from '@/lib/db/client';
import { plays, games, opponents, gamePlans } from '@/lib/db/schema';
import { gamePlanPlays } from '@/lib/db/schema-gameplan';
import { beginSpan } from '@/lib/observability/log';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/player-data' }, req);

  try {
    const url = new URL(req.url);
    const programId = url.searchParams.get('programId');
    const type = url.searchParams.get('type') ?? 'film';

    if (!programId) {
      return Response.json({ error: 'programId required' }, { status: 400 });
    }

    switch (type) {
      case 'film': {
        // Get recent plays with clips for the player to review
        const result = await withProgramContext(programId, async (tx) =>
          tx
            .select({
              id: plays.id,
              playOrder: plays.playOrder,
              down: plays.down,
              distance: plays.distance,
              formation: plays.formation,
              playType: plays.playType,
              gainLoss: plays.gainLoss,
              clipBlobKey: plays.clipBlobKey,
              opponentName: opponents.name,
            })
            .from(plays)
            .leftJoin(games, eq(plays.gameId, games.id))
            .leftJoin(opponents, eq(games.opponentId, opponents.id))
            .where(and(eq(plays.programId, programId), eq(plays.status, 'ready')))
            .orderBy(desc(plays.createdAt))
            .limit(50),
        );
        span.done({ type, count: result.length });
        return Response.json({ plays: result });
      }

      case 'gameplan': {
        // Get the most recent published game plan with its plays
        const [plan] = await withProgramContext(programId, async (tx) =>
          tx
            .select()
            .from(gamePlans)
            .where(and(
              eq(gamePlans.programId, programId),
              eq(gamePlans.publishStatus, 'published'),
            ))
            .orderBy(desc(gamePlans.publishedAt))
            .limit(1),
        );

        if (!plan) {
          span.done({ type, result: 'no_published_plan' });
          return Response.json({ gamePlan: null, plays: [] });
        }

        const planPlays = await withProgramContext(programId, async (tx) =>
          tx
            .select()
            .from(gamePlanPlays)
            .where(eq(gamePlanPlays.gamePlanId, plan.id))
            .orderBy(gamePlanPlays.situation, gamePlanPlays.sortOrder),
        );

        span.done({ type, gamePlanId: plan.id, playCount: planPlays.length });
        return Response.json({ gamePlan: plan, plays: planPlays });
      }

      default:
        return Response.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }
  } catch (error) {
    span.fail(error);
    return Response.json({ error: 'Failed to fetch player data' }, { status: 500 });
  }
}
