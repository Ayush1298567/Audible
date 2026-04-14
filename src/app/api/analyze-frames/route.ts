import { withProgramContext } from '@/lib/db/client';
import { plays } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import { generateText, Output, gateway } from 'ai';
import { z } from 'zod';

export const maxDuration = 300;

// Schema for what Claude detects in a frame
const frameAnalysisSchema = z.object({
  isLivePlay: z.boolean().describe('Is this showing a live football play (players lined up or in motion)?'),
  offenseFormation: z.string().describe('Offensive formation (Shotgun, Pistol, I-Form, etc) or "Unknown"'),
  defenseCoverage: z.enum([
    'cover_0', 'cover_1', 'cover_2', 'cover_3', 'cover_4',
    'quarters', 'man_free', 'man_under', 'unknown',
  ]),
  personnel: z.string().describe('Personnel grouping (11, 12, 21) or "Unknown"'),
  playType: z.enum(['Run', 'Pass', 'RPO', 'Screen', 'Play Action', 'Unknown']),
  playDirection: z.enum(['Left', 'Right', 'Middle', 'Unknown']),
  down: z.number().int().min(0).max(4),
  distance: z.number().int().min(0).max(99),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(5).max(300),
});

const requestSchema = z.object({
  programId: z.string().uuid(),
  gameId: z.string().uuid(),
  youtubeUrl: z.string().url(),
  frames: z.array(z.object({
    timestamp: z.number(),
    base64: z.string(),
  })).min(1).max(60),
});

const ANALYSIS_PROMPT = `You are an expert football film analyst watching game footage.

You will see a single frame from a football game. Determine:
1. Is this a LIVE play (teams lined up or in motion)? Or is it sideline/commercial/replay/dead-ball?
2. If yes: formation, personnel, play type, direction
3. Defense: coverage shell (read the safeties — one high = Cover 1/3, two high = Cover 2/4)
4. Read the scoreboard for down & distance if visible

Return Unknown and low confidence when you can't see clearly.
Be honest — don't guess.`;

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/analyze-frames', method: 'POST' }, req);

  try {
    const body = await req.json();
    const input = requestSchema.parse(body);

    // Extract YouTube video ID
    const videoIdMatch = input.youtubeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([a-zA-Z0-9_-]{11})/);
    const videoId = videoIdMatch?.[1] ?? '';

    const detectedPlays: Array<{
      timestamp: number;
      formation: string;
      coverage: string;
      personnel: string;
      playType: string;
      playDirection: string;
      down: number;
      distance: number;
      confidence: number;
      reasoning: string;
    }> = [];

    // Analyze each frame sequentially
    for (const frame of input.frames) {
      try {
        const { output } = await generateText({
          model: gateway('anthropic/claude-sonnet-4.6'),
          system: ANALYSIS_PROMPT,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', image: `data:image/jpeg;base64,${frame.base64}` },
              { type: 'text', text: `Frame at ${Math.floor(frame.timestamp / 60)}:${String(Math.floor(frame.timestamp % 60)).padStart(2, '0')} into the video.` },
            ],
          }],
          output: Output.object({ schema: frameAnalysisSchema }),
        });

        if (output?.isLivePlay && output.confidence >= 0.5) {
          detectedPlays.push({
            timestamp: frame.timestamp,
            formation: output.offenseFormation,
            coverage: output.defenseCoverage,
            personnel: output.personnel,
            playType: output.playType,
            playDirection: output.playDirection,
            down: output.down,
            distance: output.distance,
            confidence: output.confidence,
            reasoning: output.reasoning,
          });
        }
      } catch {
        // skip frames that fail
      }
    }

    // Save detected plays to DB
    let saved = 0;
    await withProgramContext(input.programId, async (tx) => {
      for (let i = 0; i < detectedPlays.length; i++) {
        const play = detectedPlays[i];
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
          quarter: Math.ceil((i + 1) / Math.max(1, detectedPlays.length / 4)),
          formation: play.formation,
          playType: play.playType !== 'Unknown' ? play.playType : null,
          playDirection: play.playDirection !== 'Unknown' ? play.playDirection : null,
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
        saved++;
      }
    });

    span.done({ framesProcessed: input.frames.length, playsDetected: detectedPlays.length, saved });

    return Response.json({
      framesProcessed: input.frames.length,
      playsDetected: detectedPlays.length,
      playsSaved: saved,
    });
  } catch (error) {
    span.fail(error);
    const msg = error instanceof Error ? error.message : 'Failed';
    return Response.json({ error: msg }, { status: 500 });
  }
}
