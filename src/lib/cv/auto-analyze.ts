/**
 * Autonomous YouTube game film analyzer.
 *
 * Given a YouTube URL, this:
 *   1. Uses yt-dlp to get the direct video stream URL + duration
 *   2. Uses ffmpeg to sample frames at regular intervals (without downloading)
 *   3. Sends each frame to Claude Sonnet vision
 *   4. Claude detects if the frame is a live play and analyzes it
 *   5. Returns a list of detected plays with full AI tagging
 *
 * This is the CV pipeline — zero manual marking required.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import ytdl from '@distube/ytdl-core';
import { generateText, Output, gateway } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { log } from '@/lib/observability/log';

const execFileAsync = promisify(execFile);

// Use bundled ffmpeg binary (works on Vercel serverless)
function getFfmpegPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const installer = require('@ffmpeg-installer/ffmpeg');
    return installer.path;
  } catch {
    return 'ffmpeg';
  }
}

// Use direct Anthropic provider locally (Vercel AI Gateway only works in Vercel runtime)
// On Vercel, gateway() uses the team's AI Gateway credits
const getModel = () => {
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    return gateway('anthropic/claude-sonnet-4.6');
  }
  return anthropic('claude-sonnet-4.6');
};

// ─── Schema for frame analysis ──────────────────────────────

const frameAnalysisSchema = z.object({
  isLivePlay: z.boolean().describe('Is this frame showing a live football play (offense vs defense lined up or in motion)? Not sidelines, not commercials, not between plays.'),
  playPhase: z.enum(['pre_snap', 'snap', 'post_snap', 'dead_ball', 'not_play']).describe('What phase of the play is this?'),
  offenseFormation: z.string().describe('Offensive formation if visible (Shotgun, Pistol, I-Form, etc) or "Unknown"'),
  defenseCoverage: z.enum(['cover_0', 'cover_1', 'cover_2', 'cover_3', 'cover_4', 'quarters', 'man_free', 'unknown']).describe('Defensive coverage shell'),
  personnel: z.string().describe('Offensive personnel grouping (11, 12, 21, etc) or "Unknown"'),
  playType: z.enum(['Run', 'Pass', 'RPO', 'Screen', 'Play Action', 'Unknown']).describe('Play type if determinable'),
  down: z.number().int().min(0).max(4).describe('Down from scoreboard if visible (0 if not visible)'),
  distance: z.number().int().min(0).max(99).describe('Distance from scoreboard if visible (0 if not visible)'),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(5).max(300).describe('What you see in the frame'),
});

export type FrameAnalysis = z.infer<typeof frameAnalysisSchema>;

// ─── Get video info ─────────────────────────────────────────

export interface VideoInfo {
  streamUrl: string;
  durationSeconds: number;
  title: string;
}

export async function getYouTubeVideoInfo(youtubeUrl: string): Promise<VideoInfo> {
  const info = await ytdl.getInfo(youtubeUrl);

  // Pick the best format at <=480p to keep bandwidth manageable
  const format = ytdl.chooseFormat(info.formats, {
    quality: 'lowest',
    filter: (f) => f.hasVideo && f.hasAudio && (f.height ?? 1080) <= 480,
  }) ?? ytdl.chooseFormat(info.formats, { quality: 'lowest', filter: 'audioandvideo' });

  return {
    streamUrl: format.url,
    durationSeconds: Number(info.videoDetails.lengthSeconds),
    title: info.videoDetails.title,
  };
}

// ─── Extract a single frame at a timestamp ──────────────────

export async function extractFrameAtTimestamp(
  streamUrl: string,
  timestamp: number,
): Promise<Buffer | null> {
  const outputPath = join(tmpdir(), `frame-${randomUUID()}.jpg`);

  try {
    await execFileAsync(getFfmpegPath(), [
      '-y',
      '-ss', String(timestamp),
      '-i', streamUrl,
      '-frames:v', '1',
      '-q:v', '3',
      '-vf', 'scale=640:-1',
      '-update', '1',
      outputPath,
    ], { timeout: 30000 });

    const buffer = await readFile(outputPath);
    return buffer;
  } catch {
    return null;
  } finally {
    await unlink(outputPath).catch(() => {});
  }
}

// ─── Analyze a single frame with Claude ─────────────────────

export async function analyzeFrame(
  frameBuffer: Buffer,
  timestamp: number,
): Promise<FrameAnalysis | null> {
  try {
    const b64 = frameBuffer.toString('base64');

    const { output } = await generateText({
      model: getModel(),
      system: FRAME_ANALYSIS_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', image: `data:image/jpeg;base64,${b64}` },
          { type: 'text', text: `This frame is from ${formatTime(timestamp)} into the game video. Analyze it.` },
        ],
      }],
      output: Output.object({ schema: frameAnalysisSchema }),
    });

    return output ?? null;
  } catch (error) {
    log.warn('frame_analysis_failed', {
      timestamp,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ─── Full pipeline: analyze a range of video ────────────────

export interface AutoAnalyzeOptions {
  youtubeUrl: string;
  /** Start timestamp in seconds (0 = beginning) */
  startSeconds?: number;
  /** Number of seconds to analyze (null = full video) */
  durationSeconds?: number | null;
  /** Seconds between frame samples (default: 25) */
  sampleInterval?: number;
}

export interface DetectedPlay {
  timestamp: number;
  formation: string;
  coverage: string;
  personnel: string;
  playType: string;
  down: number;
  distance: number;
  confidence: number;
  reasoning: string;
}

export async function autoAnalyzeGameFilm(options: AutoAnalyzeOptions): Promise<{
  videoInfo: VideoInfo;
  detectedPlays: DetectedPlay[];
  framesAnalyzed: number;
}> {
  const sampleInterval = options.sampleInterval ?? 25;
  const start = options.startSeconds ?? 0;

  // Get video metadata
  const videoInfo = await getYouTubeVideoInfo(options.youtubeUrl);
  const endTime = options.durationSeconds
    ? Math.min(start + options.durationSeconds, videoInfo.durationSeconds)
    : videoInfo.durationSeconds;

  // Build timestamp list
  const timestamps: number[] = [];
  for (let t = start; t < endTime; t += sampleInterval) {
    timestamps.push(t);
  }

  log.info('auto_analyze_started', {
    videoTitle: videoInfo.title,
    totalDuration: videoInfo.durationSeconds,
    framesToAnalyze: timestamps.length,
    sampleInterval,
  });

  const detectedPlays: DetectedPlay[] = [];
  let framesAnalyzed = 0;

  // Process frames sequentially (rate-limit-safe)
  for (const timestamp of timestamps) {
    const frame = await extractFrameAtTimestamp(videoInfo.streamUrl, timestamp);
    if (!frame) continue;

    const analysis = await analyzeFrame(frame, timestamp);
    framesAnalyzed++;

    if (!analysis) continue;

    // Only keep frames that are actual live plays with reasonable confidence
    if (analysis.isLivePlay && analysis.confidence >= 0.5 && analysis.playPhase !== 'not_play') {
      detectedPlays.push({
        timestamp,
        formation: analysis.offenseFormation,
        coverage: analysis.defenseCoverage,
        personnel: analysis.personnel,
        playType: analysis.playType,
        down: analysis.down,
        distance: analysis.distance,
        confidence: analysis.confidence,
        reasoning: analysis.reasoning,
      });
    }
  }

  log.info('auto_analyze_done', {
    framesAnalyzed,
    playsDetected: detectedPlays.length,
  });

  return {
    videoInfo,
    detectedPlays,
    framesAnalyzed,
  };
}

// ─── Helpers ────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

// ─── System prompt ──────────────────────────────────────────

const FRAME_ANALYSIS_PROMPT = `You are an expert football film analyst watching a game video.

You will see a single frame. Determine:
1. Is this frame showing a LIVE football play? (teams lined up or in motion, not sideline, not commentary, not commercial, not replay, not between-play)
2. If yes, what phase: pre_snap (lined up, not yet snapped), snap (ball just snapped), post_snap (play is live), dead_ball (play over)
3. Analyze what you can see

READ THE SCOREBOARD: Look at the on-screen graphics for down & distance. Most HS games show "1st & 10" or similar. Extract those numbers.

READ FORMATIONS:
- Shotgun, Pistol, Under Center, I-Form, Singleback, Spread, Trips, Empty
- Count RBs, TEs, WRs for personnel (11 = 1RB 1TE 3WR, 12 = 1RB 2TE 2WR, 21 = 2RB 1TE 2WR, etc)

READ COVERAGE:
- Cover 1: one high safety, man underneath
- Cover 2: two high safeties splitting field
- Cover 3: one high safety + corners at depth
- Cover 4: four deep (2 safeties + 2 corners deep)
- Man: corners pressing receivers

If you can't tell something, say Unknown and give low confidence.
Be honest — wrong tags are worse than Unknown.`;
