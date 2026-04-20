/**
 * /api/live-game — Real-time play logging during a game.
 *
 * POST: log a play (down, distance, formation, coverage, result, etc.)
 * GET: fetch all logged plays for a game (for hydrating the live dashboard)
 *
 * Plays logged here are lightweight — just the data the coach taps in
 * on their tablet. After the game, these become the seed for the real
 * play rows when film is uploaded and analyzed.
 */

import { withProgramContext } from '@/lib/db/client';
import { plays, games } from '@/lib/db/schema';
import { beginSpan, log } from '@/lib/observability/log';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { AuthError, requireCoachForProgram } from '@/lib/auth/guards';

const logPlaySchema = z.object({
  programId: z.string().uuid(),
  gameId: z.string().uuid(),
  down: z.number().int().min(1).max(4),
  distance: z.number().int().min(1).max(99),
  quarter: z.number().int().min(1).max(5), // 5 = OT
  yardLine: z.number().int().min(1).max(99).optional(),
  hash: z.enum(['Left', 'Middle', 'Right']).optional(),
  formation: z.string().max(40).optional(),
  personnel: z.string().max(10).optional(),
  motion: z.string().max(40).optional(),
  playType: z.enum(['run', 'pass', 'screen', 'rpo', 'trick', 'special']).optional(),
  playDirection: z.string().max(20).optional(),
  coverage: z.string().max(40).optional(),
  pressure: z.string().max(40).optional(),
  result: z.string().max(40).optional(),
  gainLoss: z.number().int().min(-99).max(99).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/live-game', method: 'POST' }, req);
  try {
    const body = await req.json();
    const input = logPlaySchema.parse(body);
    await requireCoachForProgram(input.programId);

    // Get next play order for this game
    const [maxOrder] = await withProgramContext(input.programId, async (tx) =>
      tx
        .select({ max: sql<number>`coalesce(max(${plays.playOrder}), 0)` })
        .from(plays)
        .where(and(eq(plays.gameId, input.gameId), eq(plays.programId, input.programId))),
    );

    const distBucket = input.distance <= 3 ? 'short' : input.distance <= 6 ? 'medium' : 'long';

    const [play] = await withProgramContext(input.programId, async (tx) =>
      tx
        .insert(plays)
        .values({
          programId: input.programId,
          gameId: input.gameId,
          playOrder: (maxOrder?.max ?? 0) + 1,
          down: input.down,
          distance: input.distance,
          distanceBucket: distBucket,
          quarter: input.quarter,
          yardLine: input.yardLine ?? null,
          hash: input.hash ?? null,
          formation: input.formation ?? null,
          personnel: input.personnel ?? null,
          motion: input.motion ?? null,
          playType: input.playType ?? null,
          playDirection: input.playDirection ?? null,
          gainLoss: input.gainLoss ?? null,
          result: input.result ?? null,
          status: 'ready', // Live-logged plays are immediately "ready" (no clip yet)
          coachOverride: {
            liveLogged: true,
            aiCoverage: input.coverage ?? null,
            aiPressure: input.pressure ?? null,
          },
        })
        .returning({ id: plays.id, playOrder: plays.playOrder }),
    );

    log.info('live_play_logged', {
      gameId: input.gameId,
      playOrder: play?.playOrder,
      down: input.down,
      distance: input.distance,
    });

    span.done({ playId: play?.id, playOrder: play?.playOrder });
    return Response.json({ play }, { status: 201 });
  } catch (error) {
    span.fail(error);
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Failed to log play' }, { status: 500 });
  }
}

export async function GET(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/live-game', method: 'GET' }, req);
  try {
    const url = new URL(req.url);
    const programId = url.searchParams.get('programId');
    const gameId = url.searchParams.get('gameId');
    if (!programId || !gameId) {
      return Response.json({ error: 'programId and gameId required' }, { status: 400 });
    }
    await requireCoachForProgram(programId);

    const [game] = await withProgramContext(programId, async (tx) =>
      tx
        .select({
          id: games.id,
          opponentId: games.opponentId,
          playedAt: games.playedAt,
          ourScore: games.ourScore,
          opponentScore: games.opponentScore,
        })
        .from(games)
        .where(and(eq(games.id, gameId), eq(games.programId, programId))),
    );
    if (!game) {
      return Response.json({ error: 'Game not found' }, { status: 404 });
    }

    const loggedPlays = await withProgramContext(programId, async (tx) =>
      tx
        .select({
          id: plays.id,
          playOrder: plays.playOrder,
          down: plays.down,
          distance: plays.distance,
          quarter: plays.quarter,
          yardLine: plays.yardLine,
          hash: plays.hash,
          formation: plays.formation,
          personnel: plays.personnel,
          motion: plays.motion,
          playType: plays.playType,
          playDirection: plays.playDirection,
          gainLoss: plays.gainLoss,
          result: plays.result,
          coachOverride: plays.coachOverride,
        })
        .from(plays)
        .where(and(eq(plays.gameId, gameId), eq(plays.programId, programId)))
        .orderBy(plays.playOrder),
    );

    span.done({ gameId, playCount: loggedPlays.length });
    return Response.json({ game, plays: loggedPlays });
  } catch (error) {
    span.fail(error);
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Failed to fetch live game data' }, { status: 500 });
  }
}
