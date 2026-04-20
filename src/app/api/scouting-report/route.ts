import { generateScoutingReport } from '@/lib/scouting/report-generator';
import { beginSpan } from '@/lib/observability/log';
import { z } from 'zod';
import { AuthError, requireCoachForProgram } from '@/lib/auth/guards';

const requestSchema = z.object({
  programId: z.string().uuid(),
  opponentId: z.string().uuid(),
  opponentName: z.string().min(1),
});

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/scouting-report', method: 'POST' }, req);

  try {
    const body = await req.json();
    const input = requestSchema.parse(body);
    await requireCoachForProgram(input.programId);

    const report = await generateScoutingReport(
      input.programId,
      input.opponentId,
      input.opponentName,
    );

    span.done({ sections: Object.keys(report).length });
    return Response.json({ report });
  } catch (error) {
    span.fail(error);

    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    const message = error instanceof Error ? error.message : 'Failed to generate report';
    return Response.json({ error: message }, { status: 500 });
  }
}
