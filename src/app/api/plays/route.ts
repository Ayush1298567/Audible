import { withProgramContext } from '@/lib/db/client';
import { plays, games, opponents } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import { eq, and, desc } from 'drizzle-orm';

export async function GET(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/plays', method: 'GET' }, req);

  try {
    const url = new URL(req.url);
    const programId = url.searchParams.get('programId');
    const gameId = url.searchParams.get('gameId');

    if (!programId) {
      return Response.json({ error: 'programId required' }, { status: 400 });
    }

    const conditions = [eq(plays.programId, programId)];
    if (gameId) {
      conditions.push(eq(plays.gameId, gameId));
    }

    const result = await withProgramContext(programId, async (tx) =>
      tx
        .select({
          id: plays.id,
          playOrder: plays.playOrder,
          down: plays.down,
          distance: plays.distance,
          distanceBucket: plays.distanceBucket,
          hash: plays.hash,
          quarter: plays.quarter,
          formation: plays.formation,
          personnel: plays.personnel,
          motion: plays.motion,
          odk: plays.odk,
          playType: plays.playType,
          playDirection: plays.playDirection,
          gainLoss: plays.gainLoss,
          result: plays.result,
          clipBlobKey: plays.clipBlobKey,
          status: plays.status,
          opponentName: opponents.name,
        })
        .from(plays)
        .leftJoin(games, eq(plays.gameId, games.id))
        .leftJoin(opponents, eq(games.opponentId, opponents.id))
        .where(and(...conditions))
        .orderBy(desc(plays.createdAt), plays.playOrder),
    );

    span.done({ count: result.length });
    return Response.json({ plays: result });
  } catch (error) {
    span.fail(error);
    return Response.json({ error: 'Failed to fetch plays' }, { status: 500 });
  }
}
