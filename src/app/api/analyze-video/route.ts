import { beginSpan } from '@/lib/observability/log';
import { z } from 'zod';
import { start } from 'workflow/api';
import { gameBreakdownWorkflow } from '@/lib/cv/game-breakdown';
import { AuthError, requireCoachRoleForProgram } from '@/lib/auth/guards';

export const maxDuration = 60;

/**
 * POST /api/analyze-video — kick off the full game-breakdown workflow.
 *
 * Returns immediately with a workflow run ID. The workflow runs durably
 * in the background (Vercel Workflow). Poll GET /api/analyze-video?runId=X
 * for progress.
 */

const requestSchema = z.object({
  programId: z.string().uuid(),
  gameId: z.string().uuid(),
  blobUrl: z.string().url(),
});

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/analyze-video', method: 'POST' }, req);

  try {
    const body = await req.json();
    const input = requestSchema.parse(body);
    await requireCoachRoleForProgram('coordinator', input.programId);

    const run = await start(gameBreakdownWorkflow, [{
      programId: input.programId,
      gameId: input.gameId,
      videoBlobUrl: input.blobUrl,
    }]);

    span.done({ runId: run.runId });

    return Response.json({
      runId: run.runId,
      status: 'started',
      message: 'Analysis started. Poll /api/analyze-video/status?runId=... for progress.',
    }, { status: 202 });
  } catch (error) {
    span.fail(error);
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    const msg = error instanceof Error ? error.message : 'Failed';
    return Response.json({ error: msg }, { status: 500 });
  }
}
