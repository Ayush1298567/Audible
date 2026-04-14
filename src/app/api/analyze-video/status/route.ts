import { beginSpan } from '@/lib/observability/log';
import { getRun } from 'workflow/api';
import { withProgramContext } from '@/lib/db/client';
import { plays } from '@/lib/db/schema';
import { eq, and, gte, sql } from 'drizzle-orm';

/**
 * GET /api/analyze-video/status?runId=XXX&programId=YYY&gameId=ZZZ
 *
 * Returns the status of a game-breakdown workflow run + count of plays
 * saved so far for the given game.
 */

export async function GET(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/analyze-video/status', method: 'GET' }, req);

  try {
    const url = new URL(req.url);
    const runId = url.searchParams.get('runId');
    const programId = url.searchParams.get('programId');
    const gameId = url.searchParams.get('gameId');
    const sinceStr = url.searchParams.get('since'); // ISO timestamp

    if (!runId || !programId || !gameId) {
      return Response.json({ error: 'runId, programId, gameId all required' }, { status: 400 });
    }

    // Get workflow status
    const run = await getRun(runId);
    const status = await run.status;

    // Count plays saved since the workflow started
    const since = sinceStr ? new Date(sinceStr) : new Date(Date.now() - 60 * 60 * 1000); // default: last 60min

    const playCount = await withProgramContext(programId, async (tx) =>
      tx
        .select({ count: sql<number>`COUNT(*)` })
        .from(plays)
        .where(and(
          eq(plays.programId, programId),
          eq(plays.gameId, gameId),
          gte(plays.createdAt, since),
        )),
    );

    const saved = Number(playCount[0]?.count ?? 0);

    let returnValue: unknown = null;
    if (status === 'completed') {
      try {
        returnValue = await run.returnValue;
      } catch {
        // ignore
      }
    }

    span.done({ runId, status, playsSaved: saved });

    return Response.json({
      runId,
      status, // 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
      playsSaved: saved,
      result: returnValue,
    });
  } catch (error) {
    span.fail(error);
    const msg = error instanceof Error ? error.message : 'Failed';
    return Response.json({ error: msg }, { status: 500 });
  }
}
