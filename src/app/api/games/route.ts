import { withProgramContext } from '@/lib/db/client';
import { games, opponents } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { AuthError, requireCoachForProgram, requireCoachRoleForProgram } from '@/lib/auth/guards';

const createGameSchema = z.object({
  programId: z.string().uuid(),
  opponentId: z.string().uuid(),
  seasonId: z.string().uuid().optional(),
  playedAt: z.string().datetime().optional(),
  isHome: z.boolean().optional(),
});

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/games', method: 'POST' }, req);
  try {
    const body = await req.json();
    const input = createGameSchema.parse(body);
    await requireCoachRoleForProgram('coordinator', input.programId);

    const [game] = await withProgramContext(input.programId, async (tx) =>
      tx.insert(games).values({
        programId: input.programId,
        opponentId: input.opponentId,
        seasonId: input.seasonId ?? null,
        playedAt: input.playedAt ? new Date(input.playedAt) : null,
        isHome: input.isHome ?? null,
      }).returning(),
    );

    span.done({ gameId: game?.id });
    return Response.json({ game }, { status: 201 });
  } catch (error) {
    span.fail(error);
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Failed to create game' }, { status: 500 });
  }
}

export async function GET(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/games', method: 'GET' }, req);
  try {
    const url = new URL(req.url);
    const programId = url.searchParams.get('programId');
    if (!programId) {
      return Response.json({ error: 'programId required' }, { status: 400 });
    }
    await requireCoachForProgram(programId);

    const result = await withProgramContext(programId, async (tx) =>
      tx
        .select({
          id: games.id,
          opponentName: opponents.name,
          opponentId: games.opponentId,
          seasonId: games.seasonId,
          playedAt: games.playedAt,
          isHome: games.isHome,
          ourScore: games.ourScore,
          opponentScore: games.opponentScore,
          createdAt: games.createdAt,
        })
        .from(games)
        .leftJoin(opponents, eq(games.opponentId, opponents.id))
        .where(eq(games.programId, programId))
        .orderBy(games.playedAt),
    );

    span.done({ count: result.length });
    return Response.json({ games: result });
  } catch (error) {
    span.fail(error);
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Failed to fetch games' }, { status: 500 });
  }
}
