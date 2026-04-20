import { withProgramContext } from '@/lib/db/client';
import { scenarios } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { AuthError, requireCoachForProgram, requireCoachRoleForProgram } from '@/lib/auth/guards';

const createSchema = z.object({
  programId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  down: z.number().int().min(1).max(4),
  distance: z.number().int().min(1).max(99),
  yardLine: z.number().int().min(1).max(99),
  formation: z.string().min(1),
  coverageShell: z.string().optional(),
  pressureType: z.string().optional(),
  positionMode: z.string().optional(),
  opponentId: z.string().uuid().optional(),
  accessLevel: z.enum(['open', 'assigned', 'locked']).default('open'),
});

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/scenarios', method: 'POST' }, req);

  try {
    const body = await req.json();
    const input = createSchema.parse(body);
    await requireCoachRoleForProgram('coordinator', input.programId);

    const [scenario] = await withProgramContext(input.programId, async (tx) =>
      tx.insert(scenarios).values({
        programId: input.programId,
        name: input.name,
        description: input.description ?? null,
        down: input.down,
        distance: input.distance,
        yardLine: input.yardLine,
        formation: input.formation,
        coverageShell: input.coverageShell ?? null,
        pressureType: input.pressureType ?? null,
        positionMode: input.positionMode ?? null,
        opponentId: input.opponentId ?? null,
        accessLevel: input.accessLevel,
      }).returning(),
    );

    span.done({ scenarioId: scenario?.id });
    return Response.json({ scenario }, { status: 201 });
  } catch (error) {
    span.fail(error);
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Failed to create scenario' }, { status: 500 });
  }
}

export async function GET(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/scenarios', method: 'GET' }, req);

  try {
    const url = new URL(req.url);
    const programId = url.searchParams.get('programId');
    const positionMode = url.searchParams.get('positionMode');

    if (!programId) {
      return Response.json({ error: 'programId required' }, { status: 400 });
    }
    await requireCoachForProgram(programId);

    const conditions = [eq(scenarios.programId, programId)];
    if (positionMode) {
      conditions.push(eq(scenarios.positionMode, positionMode));
    }

    const result = await withProgramContext(programId, async (tx) =>
      tx.select().from(scenarios).where(and(...conditions)),
    );

    span.done({ count: result.length });
    return Response.json({ scenarios: result });
  } catch (error) {
    span.fail(error);
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Failed to fetch scenarios' }, { status: 500 });
  }
}
