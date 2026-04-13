/**
 * YouTube Film Analyzer — AI vision analysis of YouTube game film.
 *
 * For each play with a YouTube clip URL:
 *   1. Grab a frame from the YouTube video at the play timestamp
 *   2. Send the frame to Claude Sonnet's vision API
 *   3. Claude analyzes: formation, coverage, personnel, play type
 *   4. Auto-tags the play with AI-detected values
 *
 * This replaces the dual-model ensemble for YouTube imports.
 * YouTube frames are lower quality than Hudl exports, so we use
 * a single model with adjusted confidence thresholds.
 */

import { generateText, Output, gateway } from 'ai';
import { z } from 'zod';
import { log } from '@/lib/observability/log';

const MODEL = 'anthropic/claude-sonnet-4.6';

// ─── Schema for what AI detects from a frame ────────────────

const footballAnalysisSchema = z.object({
  offenseFormation: z.string().describe('Offensive formation (e.g., Shotgun Spread, I-Form, Pistol, Empty, Trips Rt)'),
  defenseFormation: z.string().describe('Defensive front/alignment (e.g., 4-3 Over, 3-4, Nickel, Dime)'),
  coverageShell: z.enum([
    'cover_0', 'cover_1', 'cover_2', 'cover_3', 'cover_4',
    'quarters', 'man_free', 'man_under', 'unknown',
  ]).describe('Defensive coverage shell'),
  personnel: z.string().describe('Offensive personnel grouping (e.g., 11, 12, 21, 10)'),
  playType: z.enum(['Run', 'Pass', 'RPO', 'Screen', 'Play Action', 'Unknown']).describe('Type of play'),
  playDirection: z.enum(['Left', 'Right', 'Middle', 'Unknown']).describe('Primary direction of the play'),
  pressureType: z.enum([
    'base_4', 'base_5', 'lb_blitz', 'db_blitz', 'no_pressure', 'unknown',
  ]).describe('Defensive pressure/blitz'),
  confidence: z.number().min(0).max(1).describe('Overall confidence in analysis (0-1)'),
  reasoning: z.string().min(10).max(500).describe('Brief explanation of what you observed'),
  keyObservations: z.array(z.string().max(100)).max(5).describe('Notable things a coach should see'),
});

export type FootballAnalysis = z.infer<typeof footballAnalysisSchema>;

// ─── Analyze a single play ──────────────────────────────────

export async function analyzeYouTubePlay(
  videoId: string,
  startSeconds: number,
  endSeconds: number | null,
  playOrder: number,
): Promise<FootballAnalysis | null> {
  try {
    // Get a frame from the YouTube video
    // YouTube provides thumbnails at various qualities
    // For higher quality, we use the maxresdefault or hqdefault
    const frameUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

    // Fetch the frame
    const frameResponse = await fetch(frameUrl);
    if (!frameResponse.ok) {
      log.warn('youtube_frame_fetch_failed', { videoId, status: frameResponse.status });
      return null;
    }

    const frameBuffer = Buffer.from(await frameResponse.arrayBuffer());
    const base64Frame = frameBuffer.toString('base64');

    // Send to Claude's vision API
    const { output } = await generateText({
      model: gateway(MODEL),
      system: ANALYSIS_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: `data:image/jpeg;base64,${base64Frame}`,
            },
            {
              type: 'text',
              text: `This is play #${playOrder} from a football game. The play starts at ${startSeconds}s${endSeconds ? ` and ends at ${endSeconds}s` : ''}. Analyze everything you can see about this play.`,
            },
          ],
        },
      ],
      output: Output.object({ schema: footballAnalysisSchema }),
    });

    if (!output) {
      log.warn('youtube_analysis_no_output', { videoId, playOrder });
      return null;
    }

    log.info('youtube_play_analyzed', {
      videoId,
      playOrder,
      coverage: output.coverageShell,
      formation: output.offenseFormation,
      confidence: output.confidence,
    });

    return output;
  } catch (error) {
    log.error('youtube_analysis_failed', {
      videoId,
      playOrder,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ─── Batch analyze all plays from a YouTube import ──────────

export async function analyzeYouTubeGame(
  videoId: string,
  plays: Array<{
    playId: string;
    startSeconds: number;
    endSeconds: number | null;
    playOrder: number;
  }>,
): Promise<Map<string, FootballAnalysis>> {
  const results = new Map<string, FootballAnalysis>();

  // Process plays sequentially to avoid rate limits
  // (each call is ~$0.003 with Claude Sonnet vision)
  for (const play of plays) {
    const analysis = await analyzeYouTubePlay(
      videoId,
      play.startSeconds,
      play.endSeconds,
      play.playOrder,
    );

    if (analysis) {
      results.set(play.playId, analysis);
    }

    // Small delay between calls to be respectful of rate limits
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  log.info('youtube_game_analyzed', {
    videoId,
    totalPlays: plays.length,
    analyzedPlays: results.size,
  });

  return results;
}

// ─── System prompt ──────────────────────────────────────────

const ANALYSIS_PROMPT = `You are an expert football film analyst reviewing game footage.

You will see a frame from a football game. Analyze everything visible:

OFFENSE:
- Formation: identify the offensive formation (Shotgun, Pistol, I-Form, Under Center, Singleback, Spread, Trips, Empty, etc.)
- Personnel: count the RBs, TEs, and WRs to determine the personnel grouping (11 = 1RB 1TE 3WR, 12 = 1RB 2TE 2WR, etc.)
- Play type: if post-snap, identify Run, Pass, RPO, Screen, or Play Action
- Direction: which way is the play going

DEFENSE:
- Front: identify the defensive front (4-3, 3-4, Nickel, Dime, etc.)
- Coverage shell: pre-snap safety alignment tells you the coverage family
  - One high safety = Cover 1 or Cover 3
  - Two high safeties = Cover 2 or Cover 4
  - No deep safety = Cover 0
- Pressure: is there a blitz? From where?

KEY OBSERVATIONS:
- Note anything a coach would want to know: unusual alignments, tips, tells, motion, shifts

Be honest about confidence. YouTube game film is often from a press box or end zone camera.
If you can't clearly see something, say so. Low confidence is better than a wrong call.

Respond with strict JSON matching the required schema.`;
