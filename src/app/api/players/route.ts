import { withProgramContext } from '@/lib/db/client';
import { players } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const createPlayerSchema = z.object({
  programId: z.string().uuid(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  jerseyNumber: z.number().int().min(0).max(99),
  positions: z.array(z.string().min(1).max(20)).min(1),
  grade: z.string().max(10).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/players', method: 'POST' }, req);

  try {
    const body = await req.json();
    const input = createPlayerSchema.parse(body);

    // Generate a 6-character join code
    const joinCode = generateJoinCode();

    const [player] = await withProgramContext(input.programId, async (tx) =>
      tx
        .insert(players)
        .values({
          programId: input.programId,
          firstName: input.firstName,
          lastName: input.lastName,
          jerseyNumber: input.jerseyNumber,
          positions: input.positions,
          grade: input.grade ?? null,
          joinCode,
          joinCodeExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        })
        .returning(),
    );

    span.done({ playerId: player?.id });
    return Response.json({ player }, { status: 201 });
  } catch (error) {
    span.fail(error);
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    return Response.json({ error: 'Failed to create player' }, { status: 500 });
  }
}

export async function GET(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/players', method: 'GET' }, req);

  try {
    const url = new URL(req.url);
    const programId = url.searchParams.get('programId');

    if (!programId) {
      return Response.json({ error: 'programId is required' }, { status: 400 });
    }

    const result = await withProgramContext(programId, async (tx) =>
      tx
        .select()
        .from(players)
        .where(eq(players.programId, programId))
        .orderBy(players.jerseyNumber),
    );

    span.done({ count: result.length });
    return Response.json({ players: result });
  } catch (error) {
    span.fail(error);
    return Response.json({ error: 'Failed to fetch players' }, { status: 500 });
  }
}

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}
