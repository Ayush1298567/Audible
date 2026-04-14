import { beginSpan } from '@/lib/observability/log';
import { z } from 'zod';
import { gameBreakdownWorkflow } from '@/lib/cv/game-breakdown';

export const maxDuration = 300;

/**
 * Kick off the full game breakdown pipeline.
 *
 * The workflow is durable (Vercel Workflow) — it survives the 300s
 * function timeout. This route returns immediately after starting
 * the workflow; the UI polls the DB for plays as they appear.
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

    // Fire-and-forget the workflow. It persists across function invocations
    // via Vercel Workflow.
    const result = await gameBreakdownWorkflow({
      programId: input.programId,
      gameId: input.gameId,
      videoBlobUrl: input.blobUrl,
    });

    span.done({
      playsDetected: result.totalPlaysDetected,
      playsSaved: result.playsSaved,
    });

    return Response.json({
      playsDetected: result.totalPlaysDetected,
      playsSaved: result.playsSaved,
      message: `Gemini detected ${result.totalPlaysDetected} plays. Claude analyzed ${result.playsSaved} of them. All plays are now in the Film Room with full AI tags.`,
    });
  } catch (error) {
    span.fail(error);
    const msg = error instanceof Error ? error.message : 'Failed';
    return Response.json({ error: msg }, { status: 500 });
  }
}
