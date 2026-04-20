import { withProgramContext } from '@/lib/db/client';
import { plays, games, opponents } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import { eq, and, desc, sql, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { AuthError, requireCoachForProgram, requireCoachRoleForProgram } from '@/lib/auth/guards';

export async function GET(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/plays', method: 'GET' }, req);

  try {
    const url = new URL(req.url);
    const programId = url.searchParams.get('programId');
    const gameId = url.searchParams.get('gameId');
    const collectionId = url.searchParams.get('collectionId');

    if (!programId) {
      return Response.json({ error: 'programId required' }, { status: 400 });
    }
    await requireCoachForProgram(programId);

    const conditions = [eq(plays.programId, programId)];
    if (gameId) {
      conditions.push(eq(plays.gameId, gameId));
    }
    if (collectionId) {
      // Filter to plays in this collection via subquery
      conditions.push(
        inArray(
          plays.id,
          sql`(SELECT play_id FROM collection_plays WHERE collection_id = ${collectionId})`,
        ),
      );
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
          coachOverride: plays.coachOverride,
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
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Failed to fetch plays' }, { status: 500 });
  }
}

// ─── PATCH: Coach tag override (2-tap correction) ───────────────

const overrideSchema = z.object({
  programId: z.string().uuid(),
  playId: z.string().uuid(),
  field: z.enum([
    'formation', 'personnel', 'playType', 'playDirection',
    'hash', 'result', 'motion', 'odk',
  ]),
  value: z.string().min(1).max(100),
});

export async function PATCH(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/plays', method: 'PATCH' }, req);

  try {
    const body = await req.json();
    const input = overrideSchema.parse(body);
    await requireCoachRoleForProgram('coordinator', input.programId);

    const [updated] = await withProgramContext(input.programId, async (tx) =>
      tx
        .update(plays)
        .set({
          // Merge new override into existing overrides
          coachOverride: sql`COALESCE(coach_override, '{}'::jsonb) || ${JSON.stringify({ [input.field]: input.value })}::jsonb`,
          updatedAt: new Date(),
        })
        .where(and(eq(plays.id, input.playId), eq(plays.programId, input.programId)))
        .returning({ id: plays.id, coachOverride: plays.coachOverride }),
    );

    if (!updated) {
      return Response.json({ error: 'Play not found' }, { status: 404 });
    }

    span.done({ playId: updated.id });
    return Response.json({ play: updated });
  } catch (error) {
    span.fail(error);
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Failed to update play' }, { status: 500 });
  }
}
