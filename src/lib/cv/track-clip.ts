/**
 * Run detection + tracking on a single clip (by Blob URL).
 *
 * Fetches the clip, extracts frames at configurable fps,
 * runs Roboflow detection on each, associates into tracks.
 */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  applyHomography,
  type CalibrationResult,
  calibrateFieldFromClip,
  computeHomographyDLT,
} from './field-homography';
import { applyJerseysToTracks, ocrJerseysForTracks } from './jersey-ocr';
import { detectPeopleInFrames } from './player-detector';
import { type PlayerTrack, trackDetections } from './player-tracker';
import { applyRolesToTracks, inferTrackRoles } from './role-inference';
import { computePlayAnalytics, type PlayAnalytics } from './track-analytics';

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
  /**
   * Pre-computed landmarks (e.g., from Claude's play analyzer, which already
   * looked at the pre-snap frame). When provided, skips the separate
   * calibration Claude call. Each landmark: pixel coords (0-1 normalized)
   * plus field coords in yards.
   */
  preComputedLandmarks?: Array<{
    px: number;
    py: number;
    fx: number;
    fy: number;
    confidence: number;
    description?: string;
  }>;
  /** Infer football roles for each track. Default true (requires field registration). */
  inferRoles?: boolean;
  /** Context passed to role inference to help Claude break ties. */
  playContext?: {
    playType?: string;
    formation?: string;
    coverage?: string;
  };
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
  /** Per-play analytics computed from the tracks. */
  analytics?: PlayAnalytics;
  /** How many tracks received a role label (QB/RB/WR/LB/CB/etc). */
  rolesAssigned?: number;
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
      await execFileAsync(
        ffmpeg,
        [
          '-y',
          '-ss',
          String(t),
          '-i',
          clipPath,
          '-frames:v',
          '1',
          '-q:v',
          '3',
          '-vf',
          'scale=640:-1',
          '-update',
          '1',
          framePath,
        ],
        { timeout: 15000 },
      );
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
      let calibration: CalibrationResult | null = null;

      // Prefer pre-computed landmarks (saves a Claude call); fall back to
      // dedicated calibration call if none supplied.
      if (opts.preComputedLandmarks && opts.preComputedLandmarks.length >= 4) {
        const good = opts.preComputedLandmarks.filter((l) => l.confidence >= 0.6);
        const landmarks = good.length >= 4 ? good : opts.preComputedLandmarks;
        const correspondences = landmarks.map((l) => ({
          pixel: { px: l.px, py: l.py },
          field: { fx: l.fx, fy: l.fy },
        }));
        const H = computeHomographyDLT(correspondences);
        if (H) {
          // Reprojection error check — reject bad calibrations
          let sum = 0;
          for (const c of correspondences) {
            const proj = applyHomography(c.pixel, H);
            if (!proj) continue;
            const dx = proj.fx - c.field.fx;
            const dy = proj.fy - c.field.fy;
            sum += Math.sqrt(dx * dx + dy * dy);
          }
          const err = sum / correspondences.length;
          if (err <= 8) {
            calibration = {
              homography: H,
              landmarks: landmarks.map((l) => ({
                pixel: { px: l.px, py: l.py },
                field: { fx: l.fx, fy: l.fy },
                description: l.description ?? '',
              })),
              reprojectionError: err,
            };
          }
        }
      }

      if (!calibration) {
        calibration = await calibrateFieldFromClip(clipPath, clipDurationSeconds);
      }

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

  // Step 8: infer roles (QB/RB/WR/LB/CB/S/…) per track, if field-registered
  let rolesAssigned = 0;
  if (opts.inferRoles !== false && fieldRegistered && tracks.length > 0) {
    try {
      // LOS heuristic: median fx of all first-point positions — OL/DL cluster there
      const startXs = tracks
        .map((t) => t.points[0]?.fx)
        .filter((v): v is number => v !== undefined)
        .sort((a, b) => a - b);
      const los = startXs.length > 0 ? startXs[Math.floor(startXs.length / 2)] : undefined;

      const roleResult = await inferTrackRoles({
        tracks,
        los,
        playType: opts.playContext?.playType,
        formation: opts.playContext?.formation,
        coverage: opts.playContext?.coverage,
      });
      tracks = applyRolesToTracks(tracks, roleResult.roles);
      rolesAssigned = roleResult.assigned;
    } catch (err) {
      console.warn('role_inference_failed', {
        err: err instanceof Error ? err.message.slice(0, 200) : String(err),
      });
    }
  }

  // Step 9: compute per-play analytics in field space (or pixel if calibration failed)
  const analytics = computePlayAnalytics(tracks);

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
    analytics,
    rolesAssigned,
  };
}
