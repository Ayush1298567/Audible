import { Sandbox } from '@vercel/sandbox';
import { withProgramContext } from '@/lib/db/client';
import { plays } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import { generateText, Output, gateway } from 'ai';
import { z } from 'zod';

export const maxDuration = 300;

/**
 * Analyze an uploaded video from Vercel Blob.
 *
 * Flow:
 *   1. Spin up a Vercel Sandbox (has ffmpeg access)
 *   2. Download the video from Blob URL into the sandbox
 *   3. Extract frames at intervals with ffmpeg
 *   4. Send each frame to Claude Sonnet vision
 *   5. Claude detects live plays and tags them
 *   6. Save plays to database
 */

const requestSchema = z.object({
  programId: z.string().uuid(),
  gameId: z.string().uuid(),
  blobUrl: z.string().url(),
  startSeconds: z.number().int().min(0).default(0),
  durationSeconds: z.number().int().min(30).max(3600).default(300),
  sampleInterval: z.number().int().min(10).max(60).default(25),
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
Analyze this frame from game footage:
1. Is this a LIVE play (teams lined up/in motion)? Or sideline/commercial/replay/dead ball?
2. If live: formation, personnel, play type, direction
3. Defense: coverage shell (read the safeties — one high = C1/C3, two high = C2/C4)
4. Read the scoreboard for down & distance
Return Unknown + low confidence when you can't see clearly. Don't guess.`;

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/analyze-video', method: 'POST' }, req);

  let sandbox: Sandbox | null = null;

  try {
    const body = await req.json();
    const input = requestSchema.parse(body);

    // Step 1: Create sandbox
    sandbox = await Sandbox.create({
      runtime: 'node22',
      timeout: 280_000,
    });

    // Step 2: Install ffmpeg (static binary) + download video
    const setupAndDownload = await sandbox.runCommand({
      cmd: 'bash',
      args: ['-c', `
        set -e
        sudo dnf install -y xz >/dev/null 2>&1
        curl -sL https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz | tar xJ -C /tmp
        sudo mv /tmp/ffmpeg-*/ffmpeg /usr/local/bin/
        curl -sL "${input.blobUrl}" -o /tmp/video.mp4
        ls -la /tmp/video.mp4
        ffmpeg -i /tmp/video.mp4 -hide_banner 2>&1 | grep Duration | head -1
      `],
      sudo: true,
    });

    if (setupAndDownload.exitCode !== 0) {
      const err = await setupAndDownload.stderr();
      throw new Error(`Setup failed: ${err.slice(0, 200)}`);
    }

    // Step 3: Extract frames
    const timestamps: number[] = [];
    for (let t = input.startSeconds; t < input.startSeconds + input.durationSeconds; t += input.sampleInterval) {
      timestamps.push(t);
    }

    // Build a single ffmpeg command that extracts multiple frames
    const frameArgs: string[] = ['-y'];
    const framePaths: string[] = [];
    for (const t of timestamps) {
      const path = `/tmp/f${t}.jpg`;
      framePaths.push(path);
      frameArgs.push('-ss', String(t), '-i', '/tmp/video.mp4', '-frames:v', '1', '-q:v', '3', '-vf', 'scale=640:-1', '-update', '1', path);
    }

    // Extract frames one at a time (simpler than batched) — could optimize
    for (const t of timestamps) {
      await sandbox.runCommand({
        cmd: 'ffmpeg',
        args: ['-y', '-ss', String(t), '-i', '/tmp/video.mp4',
          '-frames:v', '1', '-q:v', '3', '-vf', 'scale=640:-1',
          '-update', '1', `/tmp/f${t}.jpg`],
      });
    }

    // Step 4: Read frames as base64
    const frames: Array<{ timestamp: number; base64: string }> = [];
    for (const t of timestamps) {
      const buf = await sandbox.readFileToBuffer({ path: `/tmp/f${t}.jpg` });
      if (buf) {
        frames.push({ timestamp: t, base64: buf.toString('base64') });
      }
    }

    // Clean up sandbox early (don't wait to free resources)
    await sandbox.stop().catch(() => {});
    sandbox = null;

    // Step 5: Send each frame to Claude
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

    // Step 6: Save plays
    let saved = 0;
    await withProgramContext(input.programId, async (tx) => {
      for (let i = 0; i < detectedPlays.length; i++) {
        const play = detectedPlays[i];
        if (!play) continue;

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
          clipBlobKey: input.blobUrl,
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
    if (sandbox) {
      await sandbox.stop().catch(() => {});
    }
    const msg = error instanceof Error ? error.message : 'Failed';
    return Response.json({ error: msg }, { status: 500 });
  }
}
