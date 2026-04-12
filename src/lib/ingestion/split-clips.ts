/**
 * ffmpeg clip splitter — extracts individual play clips from the
 * concatenated MP4 using the timestamps from the SportsCode XML.
 *
 * Each play gets its own MP4 clip uploaded to Vercel Blob. We use
 * `-c copy` (no re-encoding) for speed — the output codec matches
 * the input, and the split completes in milliseconds per clip.
 *
 * This runs inside Vercel Functions (Fluid Compute). Per PLAN.md §5.3,
 * each clip split is a separate queued job. For Phase 2 MVP we run
 * them sequentially inside a single function invocation since we
 * don't have Vercel Queues wired up yet. Phase 4.5 will migrate
 * to the queued architecture.
 *
 * Reference: PLAN.md §4a steps 8-9.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { put } from '@vercel/blob';
import { log } from '@/lib/observability/log';

const execFileAsync = promisify(execFile);

export interface ClipSplitInput {
  /** The Vercel Blob URL of the uploaded concatenated MP4 */
  mp4BlobUrl: string;
  /** Program ID for blob path namespacing */
  programId: string;
  /** Game ID for blob path namespacing */
  gameId: string;
  /** Play-level split instructions */
  plays: Array<{
    playId: string;
    playOrder: number;
    startSeconds: number;
    endSeconds: number;
  }>;
}

export interface ClipSplitResult {
  playId: string;
  clipBlobUrl: string;
  clipDurationSeconds: number;
}

/**
 * Probe MP4 duration using ffprobe. Returns duration in seconds.
 */
export async function probeVideoDuration(mp4Path: string): Promise<number> {
  const ffprobePath = getFfprobePath();

  const { stdout } = await execFileAsync(ffprobePath, [
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    mp4Path,
  ]);

  const parsed = JSON.parse(stdout) as { format?: { duration?: string } };
  const duration = Number(parsed.format?.duration);

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`ffprobe returned invalid duration: ${parsed.format?.duration}`);
  }

  return duration;
}

/**
 * Split a single clip from the MP4 at the given timestamps.
 * Returns the clip as a Buffer (for upload to Blob).
 *
 * Uses `-c copy` for zero re-encoding — fast and lossless.
 */
export async function extractClip(
  mp4Path: string,
  startSeconds: number,
  endSeconds: number,
): Promise<{ buffer: Buffer; durationSeconds: number }> {
  const ffmpegPath = getFfmpegPath();
  const outputPath = join(tmpdir(), `clip-${randomUUID()}.mp4`);

  try {
    await execFileAsync(ffmpegPath, [
      '-y',
      '-ss', String(startSeconds),
      '-to', String(endSeconds),
      '-i', mp4Path,
      '-c', 'copy',
      '-movflags', '+faststart',
      outputPath,
    ]);

    const buffer = await readFile(outputPath);
    const durationSeconds = endSeconds - startSeconds;

    return { buffer, durationSeconds };
  } finally {
    // Clean up temp file
    await unlink(outputPath).catch(() => {});
  }
}

/**
 * Download the MP4 from Blob, split all clips, upload each clip
 * back to Blob. Returns the results for DB update.
 *
 * Phase 2 MVP: runs sequentially. Phase 4.5 will queue per-play.
 */
export async function splitAndUploadClips(
  input: ClipSplitInput,
): Promise<ClipSplitResult[]> {
  // Download the full MP4 to a temp file
  const mp4TempPath = join(tmpdir(), `full-${randomUUID()}.mp4`);

  log.info('downloading_mp4_for_split', {
    mp4BlobUrl: input.mp4BlobUrl,
    playCount: input.plays.length,
    programId: input.programId,
  });

  const mp4Response = await fetch(input.mp4BlobUrl);
  if (!mp4Response.ok) {
    throw new Error(`Failed to download MP4 from Blob: ${mp4Response.status}`);
  }
  const mp4Buffer = Buffer.from(await mp4Response.arrayBuffer());
  await writeFile(mp4TempPath, mp4Buffer);

  const results: ClipSplitResult[] = [];

  try {
    for (const play of input.plays) {
      const { buffer, durationSeconds } = await extractClip(
        mp4TempPath,
        play.startSeconds,
        play.endSeconds,
      );

      // Upload clip to Vercel Blob
      const blobPath = `programs/${input.programId}/games/${input.gameId}/clips/play-${play.playOrder}.mp4`;

      const blob = await put(blobPath, buffer, {
        access: 'public', // signed URLs handled at the app layer
        contentType: 'video/mp4',
        addRandomSuffix: false,
      });

      results.push({
        playId: play.playId,
        clipBlobUrl: blob.url,
        clipDurationSeconds: durationSeconds,
      });

      log.info('clip_split_complete', {
        playId: play.playId,
        playOrder: play.playOrder,
        durationSeconds,
        programId: input.programId,
      });
    }
  } finally {
    // Clean up the full MP4 temp file
    await unlink(mp4TempPath).catch(() => {});
  }

  return results;
}

/**
 * Resolve ffmpeg/ffprobe binary paths. In production (Vercel Functions),
 * these come from @ffmpeg-installer/ffmpeg. Locally, they may be in PATH.
 */
function getFfmpegPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const installer = require('@ffmpeg-installer/ffmpeg');
    return installer.path;
  } catch {
    return 'ffmpeg'; // fall back to PATH
  }
}

function getFfprobePath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const installer = require('@ffprobe-installer/ffprobe');
    return installer.path;
  } catch {
    return 'ffprobe'; // fall back to PATH
  }
}
