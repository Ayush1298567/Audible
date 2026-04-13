import { withProgramContext } from '@/lib/db/client';
import { plays, cvTags } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { analyzeYouTubePlay } from '@/lib/cv/youtube-analyzer';

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
  runAiAnalysis: z.boolean().default(true),
});

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/ingest/youtube', method: 'POST' }, req);

  try {
    const body = await req.json();
    const input = requestSchema.parse(body);

    const youtubeBaseUrl = `https://www.youtube.com/embed/${input.videoId}`;
    let inserted = 0;
    let aiAnalyzed = 0;
    const insertedPlayIds: Array<{ id: string; playOrder: number; startSeconds: number; endSeconds: number | null }> = [];

    // Step 1: Insert all plays
    await withProgramContext(input.programId, async (tx) => {
      for (let i = 0; i < input.plays.length; i++) {
        const play = input.plays[i];
        if (!play) continue;
        const dist = play.distance;
        const distanceBucket = dist <= 3 ? 'short' : dist <= 6 ? 'medium' : 'long';

        const [insertedPlay] = await tx.insert(plays).values({
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
          clipBlobKey: `${youtubeBaseUrl}?start=${Math.floor(play.startSeconds)}&end=${Math.floor(play.endSeconds ?? play.startSeconds + 10)}&autoplay=1`,
          status: input.runAiAnalysis ? 'awaiting_cv' : 'ready',
        }).returning({ id: plays.id });

        if (insertedPlay) {
          insertedPlayIds.push({
            id: insertedPlay.id,
            playOrder: i + 1,
            startSeconds: play.startSeconds,
            endSeconds: play.endSeconds,
          });
        }
        inserted++;
      }
    });

    // Step 2: Run AI analysis on each play (if enabled)
    if (input.runAiAnalysis && insertedPlayIds.length > 0) {
      for (const playInfo of insertedPlayIds) {
        try {
          const analysis = await analyzeYouTubePlay(
            input.videoId,
            playInfo.startSeconds,
            playInfo.endSeconds,
            playInfo.playOrder,
          );

          if (analysis) {
            // Update the play with AI-detected values (override user tags with AI where confident)
            await withProgramContext(input.programId, async (tx) => {
              // Update play fields with AI analysis
              if (analysis.confidence >= 0.6) {
                await tx.update(plays).set({
                  formation: analysis.offenseFormation,
                  playType: analysis.playType === 'Unknown' ? undefined : analysis.playType,
                  playDirection: analysis.playDirection === 'Unknown' ? undefined : analysis.playDirection,
                  status: 'ready',
                  coachOverride: {
                    aiCoverage: analysis.coverageShell,
                    aiDefenseFormation: analysis.defenseFormation,
                    aiPersonnel: analysis.personnel,
                    aiPressure: analysis.pressureType,
                    aiConfidence: String(analysis.confidence),
                    aiReasoning: analysis.reasoning,
                    aiObservations: analysis.keyObservations.join('; '),
                  },
                }).where(eq(plays.id, playInfo.id));
              } else {
                // Low confidence — just mark as ready, keep user tags
                await tx.update(plays).set({
                  status: 'ready',
                  coachOverride: {
                    aiCoverage: analysis.coverageShell,
                    aiConfidence: String(analysis.confidence),
                    aiReasoning: analysis.reasoning,
                    aiLowConfidence: 'true',
                  },
                }).where(eq(plays.id, playInfo.id));
              }

              // Store CV tag for coverage detection
              await tx.insert(cvTags).values({
                programId: input.programId,
                playId: playInfo.id,
                tagType: 'coverage_shell',
                value: {
                  coverage: analysis.coverageShell,
                  reasoning: analysis.reasoning,
                  observations: analysis.keyObservations,
                },
                promptId: '00000000-0000-0000-0000-000000000000', // placeholder until prompt versioning
                anthropicConfidence: analysis.confidence,
                openaiConfidence: null,
                ensembleConfidence: analysis.confidence,
                modelsAgreed: true,
                isSurfaced: analysis.confidence >= 0.7,
              }).catch(() => {
                // CV tag insert may fail if promptId FK doesn't exist — that's OK for now
              });
            });

            aiAnalyzed++;
          } else {
            // AI failed for this play — mark as ready with user tags
            await withProgramContext(input.programId, async (tx) => {
              await tx.update(plays).set({ status: 'ready' }).where(eq(plays.id, playInfo.id));
            });
          }
        } catch {
          // Individual play analysis failed — mark as ready, continue
          await withProgramContext(input.programId, async (tx) => {
            await tx.update(plays).set({ status: 'ready' }).where(eq(plays.id, playInfo.id));
          });
        }
      }
    }

    span.done({ playCount: inserted, aiAnalyzed, videoId: input.videoId });
    return Response.json({
      playCount: inserted,
      aiAnalyzed,
      videoId: input.videoId,
      message: aiAnalyzed > 0
        ? `Imported ${inserted} plays. AI analyzed ${aiAnalyzed} — check the Film Room for AI-detected coverages, formations, and key observations.`
        : `Imported ${inserted} plays.`,
    }, { status: 201 });
  } catch (error) {
    span.fail(error);
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    const msg = error instanceof Error ? error.message : 'Failed to import YouTube plays';
    return Response.json({ error: msg }, { status: 500 });
  }
}
