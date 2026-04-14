/**
 * Full game breakdown pipeline.
 *
 * Orchestrates:
 *   1. Gemini watches the full video → play boundaries + basic tags
 *   2. Vercel Sandbox downloads video, ffmpeg splits it per play,
 *      each clip uploaded to Blob
 *   3. Claude Sonnet deep-analyzes each clip with 7-frame bundles
 *   4. All plays saved to DB with full football tags
 *
 * Runs via Vercel Workflow — durable, survives timeouts, streams
 * progress to the UI.
 */

import { Sandbox } from '@vercel/sandbox';
import { put } from '@vercel/blob';
import { withProgramContext } from '@/lib/db/client';
import { plays } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { detectPlayBoundaries, type DetectedPlay } from './gemini-boundary';
import { analyzePlayFromBlob, type PlayAnalysis } from './claude-play-analyzer';
import { trackPlayersInClip } from './track-clip';
import type { PlayerTrack } from './player-tracker';
import type { PlayAnalytics } from './track-analytics';

// ─── Types ────────────────────────────────────────────────────

export interface GameBreakdownJob {
  programId: string;
  gameId: string;
  videoBlobUrl: string;
}

export interface JobProgress {
  phase: 'gemini_scanning' | 'clipping' | 'claude_analyzing' | 'done' | 'error';
  totalPlays: number | null;
  playsClipped: number;
  playsAnalyzed: number;
  playsSaved: number;
  error?: string;
}

// ─── Stage 1: Gemini boundary detection ─────────────────────

/**
 * Scan the full video with Gemini to find play boundaries.
 * For long videos (>30 min), chunks into segments and runs them sequentially.
 */
export async function geminiScanPlayBoundaries(
  videoBlobUrl: string,
): Promise<DetectedPlay[]> {
  'use step';

  // For the first version, send the full video.
  // TODO: For long games, chunk into 10-15 min segments.
  const result = await detectPlayBoundaries({ videoBlobUrl });
  return result.plays;
}

// ─── Stage 2: Clip extraction via Vercel Sandbox ────────────

/**
 * Use Vercel Sandbox to download the full video, split into per-play
 * clips with ffmpeg, and upload each clip to Blob.
 *
 * Returns the Blob URLs for each clip.
 */
export async function extractPlayClips(
  videoBlobUrl: string,
  playBoundaries: DetectedPlay[],
): Promise<Array<{ blobUrl: string; durationSeconds: number; boundary: DetectedPlay }>> {
  'use step';

  const sandbox = await Sandbox.create({
    runtime: 'node22',
    timeout: 280_000,
  });

  try {
    // Install ffmpeg + download source video + get duration
    const setup = await sandbox.runCommand({
      cmd: 'bash',
      args: ['-c', `
        set -e
        sudo dnf install -y xz >/dev/null 2>&1
        curl -sL https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz | tar xJ -C /tmp
        sudo mv /tmp/ffmpeg-*/ffmpeg /usr/local/bin/
        sudo mv /tmp/ffmpeg-*/ffprobe /usr/local/bin/
        curl -sL "${videoBlobUrl}" -o /tmp/video.mp4
        ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 /tmp/video.mp4
      `],
      sudo: true,
    });

    if (setup.exitCode !== 0) {
      throw new Error(`Sandbox setup failed: ${(await setup.stderr()).slice(0, 200)}`);
    }

    const durationStr = (await setup.stdout()).trim();
    const videoDurationSeconds = Number(durationStr);
    if (!videoDurationSeconds || !isFinite(videoDurationSeconds)) {
      throw new Error(`Could not determine video duration: ${durationStr}`);
    }

    // Filter out Gemini's hallucinated timestamps past video end
    const validBoundaries = playBoundaries.filter(
      (b) => b.startSeconds >= 0 && b.startSeconds < videoDurationSeconds,
    );

    console.log('game_breakdown_duration', {
      videoDurationSeconds,
      geminiDetected: playBoundaries.length,
      withinBounds: validBoundaries.length,
    });

    const clips: Array<{ blobUrl: string; durationSeconds: number; boundary: DetectedPlay }> = [];

    for (let i = 0; i < validBoundaries.length; i++) {
      const boundary = validBoundaries[i]!;
      const duration = Math.min(
        boundary.endSeconds - boundary.startSeconds,
        videoDurationSeconds - boundary.startSeconds,
      );

      // Extract clip with 1s pre-roll for pre-snap context
      const start = Math.max(0, boundary.startSeconds - 1);
      const actualDuration = Math.min(duration + 1, videoDurationSeconds - start);

      if (actualDuration < 3) {
        console.warn('skipping_clip_too_short', { i, actualDuration });
        continue;
      }

      // Re-encode (not -c copy) so clip duration is EXACTLY what we request.
      // -c copy cuts only on keyframes → actual duration can be much shorter.
      const clipResult = await sandbox.runCommand({
        cmd: 'ffmpeg',
        args: [
          '-y',
          '-ss', String(start),
          '-i', '/tmp/video.mp4',
          '-t', String(actualDuration),
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-crf', '23',
          '-c:a', 'aac',
          '-b:a', '96k',
          '-movflags', '+faststart',
          `/tmp/play-${i}.mp4`,
        ],
      });

      if (clipResult.exitCode !== 0) {
        console.warn('ffmpeg_clip_failed', { i, exitCode: clipResult.exitCode });
        continue;
      }

      const clipBuffer = await sandbox.readFileToBuffer({ path: `/tmp/play-${i}.mp4` });
      if (!clipBuffer || clipBuffer.length < 10_000) {
        // Anything under 10KB is an empty/corrupt clip — skip.
        console.warn('clip_too_small', { i, size: clipBuffer?.length ?? 0 });
        continue;
      }

      // Upload to Blob
      const blob = await put(
        `plays/play-${Date.now()}-${i}.mp4`,
        clipBuffer,
        { access: 'public', contentType: 'video/mp4' },
      );

      clips.push({
        blobUrl: blob.url,
        durationSeconds: actualDuration,
        boundary,
      });
    }

    return clips;
  } finally {
    await sandbox.stop().catch(() => {});
  }
}

// ─── Stage 3: Claude per-play deep analysis ─────────────────

/**
 * Run Claude on a single play clip.
 * Step-level granularity so Workflow can retry individual plays.
 */
export async function claudeAnalyzeOnePlay(
  clipBlobUrl: string,
  durationSeconds: number,
  down: number,
  distance: number,
): Promise<PlayAnalysis | null> {
  'use step';
  try {
    return await analyzePlayFromBlob(
      clipBlobUrl,
      durationSeconds,
      down > 0 ? { down, distance } : undefined,
    );
  } catch (err) {
    // If Claude fails on one play, don't nuke the whole pipeline.
    // Fall back to Gemini's basic tags for this play.
    console.error('claude_analysis_failed', {
      clipBlobUrl,
      error: err instanceof Error ? err.message.slice(0, 200) : String(err),
    });
    return null;
  }
}

/**
 * Run player detection + tracking on a single clip.
 * Step-level so Workflow can retry individual plays.
 */
export async function trackPlayersForOnePlay(
  clipBlobUrl: string,
  durationSeconds: number,
  playContext?: { playType?: string; formation?: string; coverage?: string },
): Promise<{ tracks: PlayerTrack[]; analytics: PlayAnalytics | null }> {
  'use step';
  try {
    const result = await trackPlayersInClip(clipBlobUrl, durationSeconds, {
      fps: 2,
      playContext,
    });
    console.log('tracking_done', {
      clipBlobUrl,
      tracks: result.tracks.length,
      frames: result.frameCount,
      jerseysRead: result.jerseysRead ?? 0,
      fieldRegistered: result.fieldRegistered ?? false,
      fieldError: result.fieldCalibrationError,
      peakSpeed: result.analytics?.peakSpeedYps,
      rolesAssigned: result.rolesAssigned ?? 0,
      durationMs: result.durationMs,
    });
    return { tracks: result.tracks, analytics: result.analytics ?? null };
  } catch (err) {
    console.error('tracking_failed', {
      clipBlobUrl,
      error: err instanceof Error ? err.message.slice(0, 200) : String(err),
    });
    return { tracks: [], analytics: null };
  }
}

// ─── Stage 4: Persist plays to DB ───────────────────────────

export async function savePlayToDb(
  programId: string,
  gameId: string,
  playOrder: number,
  boundary: DetectedPlay,
  clipBlobUrl: string,
  analysis: PlayAnalysis | null,
  tracks: PlayerTrack[] = [],
  analytics: PlayAnalytics | null = null,
): Promise<string> {
  'use step';

  const dist = analysis?.yardsGained ?? boundary.yardsGained;
  const down = boundary.down || 0;
  const distance = boundary.distance || 10;

  const distBucket = distance <= 3 ? 'short' : distance <= 6 ? 'medium' : 'long';

  const [insertedPlay] = await withProgramContext(programId, async (tx) =>
    tx.insert(plays).values({
      programId,
      gameId,
      playOrder,
      down: down || null,
      distance: distance || null,
      distanceBucket: distBucket,
      hash: 'Middle', // TODO: from analysis
      yardLine: boundary.yardLine || null,
      quarter: boundary.quarter || 1,
      formation: analysis?.formation ?? boundary.formation,
      personnel: analysis?.personnel?.slice(0, 10) ?? null,
      motion: analysis?.motion ?? null,
      playType: analysis?.playType ?? boundary.playType,
      playDirection: analysis?.playDirection ?? boundary.direction,
      gainLoss: Math.round(dist),
      result: analysis?.result ?? boundary.result,
      clipStartSeconds: boundary.startSeconds,
      clipEndSeconds: boundary.endSeconds,
      clipBlobKey: clipBlobUrl,
      status: 'ready',
      coachOverride: analysis ? {
        aiCoverage: analysis.coverageShell,
        aiDefensiveFront: analysis.defensiveFront,
        aiPressure: analysis.pressureType,
        aiRouteConcept: analysis.routeConcept ?? 'N/A',
        aiRunGap: analysis.runGap ?? 'N/A',
        aiBlockingScheme: analysis.blockingScheme ?? 'N/A',
        aiPreSnapRead: analysis.preSnapCoverageRead,
        aiConfidence: String(analysis.confidence),
        aiReasoning: analysis.reasoning,
        aiObservations: analysis.keyObservations.join(' | '),
        tracks: tracks.length > 0 ? JSON.stringify(tracks) : undefined,
        analytics: analytics ? JSON.stringify(analytics) : undefined,
      } : {
        aiConfidence: String(boundary.confidence),
        geminiOnly: 'true',
        tracks: tracks.length > 0 ? JSON.stringify(tracks) : undefined,
        analytics: analytics ? JSON.stringify(analytics) : undefined,
      },
    }).returning({ id: plays.id }),
  );

  return insertedPlay?.id ?? '';
}

// ─── Main workflow (durable) ────────────────────────────────

/**
 * The durable workflow that breaks down a full game.
 *
 * Uses 'use workflow' directive — Vercel Workflow handles
 * persistence, retries, and resumption.
 */
export async function gameBreakdownWorkflow(job: GameBreakdownJob): Promise<{
  totalPlaysDetected: number;
  playsSaved: number;
}> {
  'use workflow';

  // Stage 1: Gemini scans for play boundaries
  const boundaries = await geminiScanPlayBoundaries(job.videoBlobUrl);

  if (boundaries.length === 0) {
    return { totalPlaysDetected: 0, playsSaved: 0 };
  }

  // Stage 2: Extract each play's clip
  const clips = await extractPlayClips(job.videoBlobUrl, boundaries);

  // Stage 3 + 4: Claude analyzes + Roboflow tracks each clip, then saves to DB
  let saved = 0;
  for (let i = 0; i < clips.length; i++) {
    const { blobUrl, durationSeconds, boundary } = clips[i]!;

    // Claude analysis first so its output (formation, playType, coverage)
    // feeds role inference downstream. Each call is its own durable step
    // (retryable independently).
    const analysis = await claudeAnalyzeOnePlay(
      blobUrl,
      durationSeconds,
      boundary.down,
      boundary.distance,
    );

    const trackingResult = await trackPlayersForOnePlay(
      blobUrl,
      durationSeconds,
      {
        playType: analysis?.playType ?? boundary.playType ?? undefined,
        formation: analysis?.formation ?? boundary.formation ?? undefined,
        coverage: analysis?.coverageShell ?? undefined,
      },
    );

    await savePlayToDb(
      job.programId,
      job.gameId,
      i + 1,
      boundary,
      blobUrl,
      analysis,
      trackingResult.tracks,
      trackingResult.analytics,
    );

    saved++;
  }

  return {
    totalPlaysDetected: boundaries.length,
    playsSaved: saved,
  };
}
