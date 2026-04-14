/**
 * Run detection + tracking on a single clip (by Blob URL).
 *
 * Fetches the clip, extracts frames at configurable fps,
 * runs Roboflow detection on each, associates into tracks.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { detectPeopleInFrames } from './player-detector';
import { trackDetections, type PlayerTrack } from './player-tracker';
import { ocrJerseysForTracks, applyJerseysToTracks } from './jersey-ocr';
import { calibrateFieldFromClip, applyHomography } from './field-homography';

const execFileAsync = promisify(execFile);

function getFfmpegPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const installer = require('@ffmpeg-installer/ffmpeg');
    return installer.path;
  } catch {
    return 'ffmpeg';
  }
}

export interface TrackClipOptions {
  /** How many frames per second to sample. Default 2 (every 0.5s). */
  fps?: number;
  /** Roboflow confidence threshold. Default 30. */
  confidence?: number;
  /** Roboflow API key override. */
  apiKey?: string;
  /** Run jersey number OCR on tracks after tracking. Default true. */
  readJerseys?: boolean;
  /** Run field homography + project tracks into yard coords. Default true. */
  registerField?: boolean;
}

export interface TrackClipResult {
  tracks: PlayerTrack[];
  imageWidth: number;
  imageHeight: number;
  frameCount: number;
  /** Seconds taken to detect + track. */
  durationMs: number;
  /** How many jerseys were successfully identified (if OCR ran). */
  jerseysRead?: number;
  /** If field calibration succeeded, the reprojection error in yards. */
  fieldCalibrationError?: number;
  /** Whether the clip is in field-space (true) or pixel-space only (false). */
  fieldRegistered?: boolean;
}

/**
 * Download a clip, extract frames, detect + track people.
 */
export async function trackPlayersInClip(
  clipBlobUrl: string,
  clipDurationSeconds: number,
  opts: TrackClipOptions = {},
): Promise<TrackClipResult> {
  const startTime = Date.now();
  const fps = opts.fps ?? 2;

  // Step 1: download clip
  const res = await fetch(clipBlobUrl);
  if (!res.ok) throw new Error(`fetch clip failed: ${res.status}`);
  const clipBuffer = Buffer.from(await res.arrayBuffer());
  const clipPath = join(tmpdir(), `trk-${randomUUID()}.mp4`);
  await writeFile(clipPath, clipBuffer);

  // Step 2: build list of timestamps to sample
  const timestamps: number[] = [];
  const step = 1 / fps;
  for (let t = 0.2; t < clipDurationSeconds - 0.1; t += step) {
    timestamps.push(Number(t.toFixed(2)));
  }

  // Step 3: extract each frame with ffmpeg
  const ffmpeg = getFfmpegPath();
  const frames: Array<{ timestamp: number; base64: string }> = [];

  for (const t of timestamps) {
    const framePath = join(tmpdir(), `trk-${randomUUID()}.jpg`);
    try {
      await execFileAsync(ffmpeg, [
        '-y',
        '-ss', String(t),
        '-i', clipPath,
        '-frames:v', '1',
        '-q:v', '3',
        '-vf', 'scale=640:-1',
        '-update', '1',
        framePath,
      ], { timeout: 15000 });
      const buf = await readFile(framePath);
      frames.push({ timestamp: t, base64: buf.toString('base64') });
      await unlink(framePath).catch(() => {});
    } catch {
      // skip bad frames
    }
  }

  // Step 4: run detection in parallel
  const detections = await detectPeopleInFrames(frames, {
    confidence: opts.confidence,
    apiKey: opts.apiKey,
    concurrency: 5,
  });

  // Step 5: track
  let tracks = trackDetections(detections);

  const imageWidth = detections[0]?.imageWidth ?? 640;
  const imageHeight = detections[0]?.imageHeight ?? 360;

  // Step 6: jersey OCR (optional but on by default)
  let jerseysRead = 0;
  if (opts.readJerseys !== false && tracks.length > 0) {
    try {
      const ocr = await ocrJerseysForTracks({
        clipPath,
        tracks,
        frameWidth: imageWidth,
        frameHeight: imageHeight,
      });
      tracks = applyJerseysToTracks(tracks, ocr.jerseys);
      jerseysRead = ocr.jerseysRead;
    } catch (err) {
      // Jersey OCR is best-effort — a failure here should NOT kill tracking.
      console.warn('jersey_ocr_failed', {
        err: err instanceof Error ? err.message.slice(0, 200) : String(err),
      });
    }
  }

  // Step 7: field registration (homography → yard coords)
  let fieldRegistered = false;
  let fieldCalibrationError: number | undefined;
  if (opts.registerField !== false && tracks.length > 0) {
    try {
      const calibration = await calibrateFieldFromClip(clipPath, clipDurationSeconds);
      if (calibration) {
        fieldRegistered = true;
        fieldCalibrationError = calibration.reprojectionError;
        // Project every track point into field coords
        tracks = tracks.map((trk) => ({
          ...trk,
          homography: calibration.homography,
          points: trk.points.map((p) => {
            const field = applyHomography({ px: p.x, py: p.y }, calibration.homography);
            return field ? { ...p, fx: field.fx, fy: field.fy } : p;
          }),
        }));
      }
    } catch (err) {
      console.warn('field_calibration_failed', {
        err: err instanceof Error ? err.message.slice(0, 200) : String(err),
      });
    }
  }

  // Cleanup
  await unlink(clipPath).catch(() => {});

  return {
    tracks,
    imageWidth,
    imageHeight,
    frameCount: frames.length,
    durationMs: Date.now() - startTime,
    jerseysRead,
    fieldCalibrationError,
    fieldRegistered,
  };
}
