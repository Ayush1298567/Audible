import { withProgramContext } from '@/lib/db/client';
import { opponents } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { AuthError, requireCoachForProgram, requireCoachRoleForProgram } from '@/lib/auth/guards';

const createOpponentSchema = z.object({
  programId: z.string().uuid(),
  name: z.string().min(1).max(200),
  city: z.string().max(100).optional(),
  state: z.string().length(2).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/opponents', method: 'POST' }, req);
  try {
    const body = await req.json();
    const input = createOpponentSchema.parse(body);
    await requireCoachRoleForProgram('coordinator', input.programId);

    const [opponent] = await withProgramContext(input.programId, async (tx) =>
      tx.insert(opponents).values({
        programId: input.programId,
        name: input.name,
        city: input.city ?? null,
        state: input.state ?? null,
      }).returning(),
    );

    span.done({ opponentId: opponent?.id });
    return Response.json({ opponent }, { status: 201 });
  } catch (error) {
    span.fail(error);
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Failed to create opponent' }, { status: 500 });
  }
}

export async function GET(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/opponents', method: 'GET' }, req);
  try {
    const url = new URL(req.url);
    const programId = url.searchParams.get('programId');
    if (!programId) {
      return Response.json({ error: 'programId required' }, { status: 400 });
    }
    await requireCoachForProgram(programId);

    const result = await withProgramContext(programId, async (tx) =>
      tx.select().from(opponents).where(eq(opponents.programId, programId)),
    );

    span.done({ count: result.length });
    return Response.json({ opponents: result });
  } catch (error) {
    span.fail(error);
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Failed to fetch opponents' }, { status: 500 });
  }
}
