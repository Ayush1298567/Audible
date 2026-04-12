import { db } from '@/lib/db/client';
import { players } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import { eq, and, gt } from 'drizzle-orm';
import { z } from 'zod';

const joinCodeSchema = z.object({
  joinCode: z.string().min(4).max(8).transform((s) => s.toUpperCase().trim()),
});

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/player-auth' }, req);

  try {
    const body = await req.json();
    const { joinCode } = joinCodeSchema.parse(body);

    // Join codes bypass RLS — we need to find the player across all programs.
    // The players table IS RLS-enforced, so we query without program context
    // using a direct DB query. This is the ONE place we bypass the
    // withProgramContext pattern, and it's intentional: the join code itself
    // is the auth credential that grants access to a specific program.
    const result = await db
      .select()
      .from(players)
      .where(
        and(
          eq(players.joinCode, joinCode),
          gt(players.joinCodeExpiresAt, new Date()),
        ),
      )
      .limit(1);

    const player = result[0];

    if (!player) {
      span.done({ result: 'invalid_code' });
      return Response.json(
        { error: 'Invalid or expired join code' },
        { status: 401 },
      );
    }

    span.done({ playerId: player.id, programId: player.programId });

    return Response.json({
      player: {
        id: player.id,
        programId: player.programId,
        firstName: player.firstName,
        lastName: player.lastName,
        jerseyNumber: player.jerseyNumber,
        positions: player.positions,
      },
    });
  } catch (error) {
    span.fail(error);
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Invalid join code format' }, { status: 400 });
    }
    return Response.json({ error: 'Authentication failed' }, { status: 500 });
  }
}
