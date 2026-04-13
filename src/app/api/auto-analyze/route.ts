import { autoAnalyzeGameFilm } from '@/lib/cv/auto-analyze';
import { withProgramContext } from '@/lib/db/client';
import { plays } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import { z } from 'zod';

const requestSchema = z.object({
  programId: z.string().uuid(),
  gameId: z.string().uuid(),
  youtubeUrl: z.string().url(),
  startSeconds: z.number().int().min(0).optional(),
  durationSeconds: z.number().int().min(30).max(1800).optional(),
  sampleInterval: z.number().int().min(10).max(60).optional(),
});

// This route does heavy AI work — Vercel Fluid Compute allows up to 800s
export const maxDuration = 800;

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/auto-analyze', method: 'POST' }, req);

  try {
    const body = await req.json();
    const input = requestSchema.parse(body);

    // Extract YouTube video ID for embed URLs
    const videoIdMatch = input.youtubeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([a-zA-Z0-9_-]{11})/);
    const videoId = videoIdMatch?.[1] ?? '';

    // Run the autonomous pipeline
    const result = await autoAnalyzeGameFilm({
      youtubeUrl: input.youtubeUrl,
      startSeconds: input.startSeconds,
      durationSeconds: input.durationSeconds ?? 600, // default to 10 minutes
      sampleInterval: input.sampleInterval ?? 25,
    });

    // Save detected plays to database
    let inserted = 0;
    await withProgramContext(input.programId, async (tx) => {
      for (let i = 0; i < result.detectedPlays.length; i++) {
        const play = result.detectedPlays[i];
        if (!play) continue;

        const embedUrl = videoId
          ? `https://www.youtube.com/embed/${videoId}?start=${Math.max(0, Math.floor(play.timestamp - 2))}&end=${Math.floor(play.timestamp + 8)}&autoplay=1`
          : null;

        await tx.insert(plays).values({
          programId: input.programId,
          gameId: input.gameId,
          playOrder: i + 1,
          down: play.down || null,
          distance: play.distance || null,
          distanceBucket: play.distance <= 3 ? 'short' : play.distance <= 6 ? 'medium' : 'long',
          hash: 'Middle',
          quarter: Math.ceil((i + 1) / Math.max(1, result.detectedPlays.length / 4)),
          formation: play.formation,
          playType: play.playType !== 'Unknown' ? play.playType : null,
          clipStartSeconds: play.timestamp,
          clipEndSeconds: play.timestamp + 8,
          clipBlobKey: embedUrl,
          status: 'ready',
          coachOverride: {
            aiCoverage: play.coverage,
            aiPersonnel: play.personnel,
            aiConfidence: String(play.confidence),
            aiReasoning: play.reasoning,
          },
        });
        inserted++;
      }
    });

    span.done({
      playsDetected: result.detectedPlays.length,
      inserted,
      framesAnalyzed: result.framesAnalyzed,
    });

    return Response.json({
      videoTitle: result.videoInfo.title,
      videoDuration: result.videoInfo.durationSeconds,
      framesAnalyzed: result.framesAnalyzed,
      playsDetected: result.detectedPlays.length,
      playsSaved: inserted,
      message: `Analyzed ${result.framesAnalyzed} frames from "${result.videoInfo.title}" and detected ${result.detectedPlays.length} live plays.`,
    });
  } catch (error) {
    span.fail(error);
    const msg = error instanceof Error ? error.message : 'Analysis failed';
    return Response.json({ error: msg }, { status: 500 });
  }
}
