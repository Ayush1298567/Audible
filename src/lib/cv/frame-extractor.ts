/**
 * Frame extractor — pulls specific frames from a play clip for CV analysis.
 *
 * Extracts 2-3 frames per play:
 *   - pre_snap: ~0.5s before the end of the pre-snap period
 *   - snap: the moment of the snap (clip start + small offset)
 *   - post_snap: ~1s after the snap
 *
 * Outputs PNG images as Buffers for sending to vision LLMs.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const execFileAsync = promisify(execFile);

export interface ExtractedFrame {
  type: 'pre_snap' | 'snap' | 'post_snap';
  buffer: Buffer;
  timestampSeconds: number;
}

/**
 * Extract key frames from a play clip for vision analysis.
 *
 * @param clipPath - path to the clip MP4 on disk
 * @param clipDuration - duration of the clip in seconds
 * @returns array of extracted frames as PNG buffers
 */
export async function extractFrames(
  clipPath: string,
  clipDuration: number,
): Promise<ExtractedFrame[]> {
  const frames: ExtractedFrame[] = [];
  const ffmpegPath = getFfmpegPath();

  // Calculate frame timestamps relative to clip start.
  // Typical Hudl clip: ~3s pre-snap + ~5s play = ~8s total.
  // We want: pre-snap (early), snap (roughly 30-40% in), post-snap (60-70% in).
  const preSnapTime = Math.min(clipDuration * 0.2, 1.5);
  const snapTime = Math.min(clipDuration * 0.4, 3.0);
  const postSnapTime = Math.min(clipDuration * 0.65, 5.0);

  const timestamps = [
    { type: 'pre_snap' as const, time: preSnapTime },
    { type: 'snap' as const, time: snapTime },
    { type: 'post_snap' as const, time: postSnapTime },
  ];

  for (const { type, time } of timestamps) {
    const outputPath = join(tmpdir(), `frame-${randomUUID()}.png`);

    try {
      await execFileAsync(ffmpegPath, [
        '-y',
        '-ss', String(time),
        '-i', clipPath,
        '-vframes', '1',
        '-f', 'image2',
        '-q:v', '2',
        outputPath,
      ]);

      const buffer = await readFile(outputPath);
      frames.push({ type, buffer, timestampSeconds: time });
    } catch {
      // If a specific frame fails (e.g., timestamp past clip end), skip it
    } finally {
      await unlink(outputPath).catch(() => {});
    }
  }

  return frames;
}

/**
 * Download a clip from Blob URL to a temp file.
 * Returns the temp file path (caller must clean up).
 */
export async function downloadClipToTemp(clipUrl: string): Promise<string> {
  const response = await fetch(clipUrl);
  if (!response.ok) {
    throw new Error(`Failed to download clip: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const tempPath = join(tmpdir(), `clip-${randomUUID()}.mp4`);
  await writeFile(tempPath, buffer);
  return tempPath;
}

function getFfmpegPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const installer = require('@ffmpeg-installer/ffmpeg');
    return installer.path;
  } catch {
    return 'ffmpeg';
  }
}
