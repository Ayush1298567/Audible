import { Sandbox } from '@vercel/sandbox';
import { withProgramContext } from '@/lib/db/client';
import { plays } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import { generateText, Output, gateway } from 'ai';
import { z } from 'zod';

export const maxDuration = 300;

const requestSchema = z.object({
  programId: z.string().uuid(),
  gameId: z.string().uuid(),
  youtubeUrl: z.string().url(),
  startSeconds: z.number().int().min(0).default(0),
  durationSeconds: z.number().int().min(30).max(600).default(300),
  sampleInterval: z.number().int().min(15).max(60).default(30),
});

const frameAnalysisSchema = z.object({
  isLivePlay: z.boolean(),
  offenseFormation: z.string(),
  defenseCoverage: z.enum([
    'cover_0', 'cover_1', 'cover_2', 'cover_3', 'cover_4',
    'quarters', 'man_free', 'man_under', 'unknown',
  ]),
  personnel: z.string(),
  playType: z.enum(['Run', 'Pass', 'RPO', 'Screen', 'Play Action', 'Unknown']),
  playDirection: z.enum(['Left', 'Right', 'Middle', 'Unknown']),
  down: z.number().int().min(0).max(4),
  distance: z.number().int().min(0).max(99),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(5).max(300),
});

const ANALYSIS_PROMPT = `You are an expert football film analyst.
Analyze this single frame from game footage:
1. Is this a LIVE play (teams lined up/in motion)? Or sideline/commercial/replay?
2. If live: formation, personnel, play type, direction
3. Defense: coverage shell (read the safeties)
4. Read scoreboard for down & distance
Return Unknown + low confidence when you can't see clearly. Don't guess.`;

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/analyze-youtube', method: 'POST' }, req);

  let sandbox: Sandbox | null = null;

  try {
    const body = await req.json();
    const input = requestSchema.parse(body);

    const videoIdMatch = input.youtubeUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([a-zA-Z0-9_-]{11})/);
    const videoId = videoIdMatch?.[1] ?? '';

    // Step 1: Create a Vercel Sandbox (has real IP, can use yt-dlp)
    sandbox = await Sandbox.create({
      timeout: 280_000, // 280s, leaving buffer for cleanup
    });

    // Step 2: Install yt-dlp in the sandbox
    await sandbox.runCommand({
      cmd: 'bash',
      args: ['-c', 'pip install -q yt-dlp || apt-get install -y yt-dlp || curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod +x /usr/local/bin/yt-dlp'],
    });

    // Step 3: Get video stream URL
    const streamCmd = await sandbox.runCommand({
      cmd: 'yt-dlp',
      args: ['-g', '-f', 'best[height<=480]', input.youtubeUrl],
    });

    const streamUrl = (await streamCmd.stdout()).trim().split('\n')[0] ?? '';
    if (!streamUrl) {
      throw new Error('Failed to get video stream URL');
    }

    // Step 4: Extract frames at intervals
    const timestamps: number[] = [];
    for (let t = input.startSeconds; t < input.startSeconds + input.durationSeconds; t += input.sampleInterval) {
      timestamps.push(t);
    }

    const frames: Array<{ timestamp: number; base64: string }> = [];
    for (const t of timestamps) {
      const framePath = `/tmp/frame-${t}.jpg`;
      const extractCmd = await sandbox.runCommand({
        cmd: 'ffmpeg',
        args: [
          '-y', '-ss', String(t), '-i', streamUrl,
          '-frames:v', '1', '-q:v', '3', '-vf', 'scale=640:-1',
          '-update', '1', framePath,
        ],
      });

      if (extractCmd.exitCode === 0) {
        const catCmd = await sandbox.runCommand({
          cmd: 'base64',
          args: [framePath],
        });
        const b64 = (await catCmd.stdout()).replace(/\s/g, '');
        if (b64) {
          frames.push({ timestamp: t, base64: b64 });
        }
      }
    }

    // Step 5: Analyze each frame with Claude
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

    for (const frame of frames) {
      try {
        const { output } = await generateText({
          model: gateway('anthropic/claude-sonnet-4.6'),
          system: ANALYSIS_PROMPT,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', image: `data:image/jpeg;base64,${frame.base64}` },
              { type: 'text', text: `Frame at ${Math.floor(frame.timestamp / 60)}:${String(Math.floor(frame.timestamp % 60)).padStart(2, '0')}` },
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
        // skip bad frames
      }
    }

    // Step 6: Save plays to DB
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

    span.done({ framesExtracted: frames.length, playsDetected: detectedPlays.length, saved });

    return Response.json({
      framesExtracted: frames.length,
      playsDetected: detectedPlays.length,
      playsSaved: saved,
      message: `Extracted ${frames.length} frames, Claude detected ${detectedPlays.length} live plays.`,
    });
  } catch (error) {
    span.fail(error);
    const msg = error instanceof Error ? error.message : 'Failed';
    return Response.json({ error: msg }, { status: 500 });
  } finally {
    if (sandbox) {
      await sandbox.stop().catch(() => {});
    }
  }
}
