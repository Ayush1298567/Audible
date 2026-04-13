import { withProgramContext } from '@/lib/db/client';
import { plays } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import { z } from 'zod';

const playSchema = z.object({
  startSeconds: z.number(),
  endSeconds: z.number().nullable(),
  down: z.number().int().min(1).max(4),
  distance: z.number().int().min(0).max(99),
  formation: z.string().min(1),
  playType: z.string().min(1),
  playDirection: z.string(),
  gainLoss: z.number().int(),
  result: z.string().min(1),
});

const requestSchema = z.object({
  programId: z.string().uuid(),
  gameId: z.string().uuid(),
  videoId: z.string().min(1),
  plays: z.array(playSchema).min(1).max(200),
});

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/ingest/youtube', method: 'POST' }, req);

  try {
    const body = await req.json();
    const input = requestSchema.parse(body);

    const youtubeBaseUrl = `https://www.youtube.com/embed/${input.videoId}`;

    let inserted = 0;

    await withProgramContext(input.programId, async (tx) => {
      for (let i = 0; i < input.plays.length; i++) {
        const play = input.plays[i];
        if (!play) continue;
        const dist = play.distance;
        const distanceBucket = dist <= 3 ? 'short' : dist <= 6 ? 'medium' : 'long';

        await tx.insert(plays).values({
          programId: input.programId,
          gameId: input.gameId,
          playOrder: i + 1,
          down: play.down,
          distance: play.distance,
          distanceBucket,
          hash: 'Middle',
          quarter: Math.ceil((i + 1) / (input.plays.length / 4)),
          formation: play.formation,
          playType: play.playType,
          playDirection: play.playDirection,
          gainLoss: play.gainLoss,
          result: play.result,
          clipStartSeconds: play.startSeconds,
          clipEndSeconds: play.endSeconds,
          // Store YouTube embed URL with timestamp as the clip URL
          clipBlobKey: `${youtubeBaseUrl}?start=${Math.floor(play.startSeconds)}&end=${Math.floor(play.endSeconds ?? play.startSeconds + 10)}&autoplay=1`,
          status: 'ready',
        });
        inserted++;
      }
    });

    span.done({ playCount: inserted, videoId: input.videoId });
    return Response.json({ playCount: inserted, videoId: input.videoId }, { status: 201 });
  } catch (error) {
    span.fail(error);
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    return Response.json({ error: 'Failed to import YouTube plays' }, { status: 500 });
  }
}
