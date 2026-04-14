/**
 * Jersey number OCR.
 *
 * Given a clip + its player tracks, pick one "best moment" per track
 * (highest confidence × largest bbox = player closest to camera), crop
 * the upper-torso jersey region from a high-res frame, and send the
 * whole batch to Claude vision in one call.
 *
 * Claude returns jersey numbers (or "unclear") per crop. We write them
 * back onto the tracks. Tracks where the jersey is unreadable stay
 * jersey-less — the tracker dot still renders, it just won't have
 * a number inside it.
 *
 * Cost: ~1 Claude call per clip, ~5-15 image crops per call.
 */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { gateway, generateText, Output } from 'ai';
import { z } from 'zod';
import { type PlayerTrack, TRACK_TRUST_THRESHOLD } from './player-tracker';

const execFileAsync = promisify(execFile);

const OCR_MODEL = 'anthropic/claude-sonnet-4.6';

function getFfmpegPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const installer = require('@ffmpeg-installer/ffmpeg');
    return installer.path;
  } catch {
    return 'ffmpeg';
  }
}

// ─── Pick the best moment per track ─────────────────────────

interface BestMoment {
  trackId: string;
  /** Timestamp (seconds from clip start) to extract the frame from. */
  t: number;
  /** Normalized bbox center x. */
  nx: number;
  /** Normalized bbox center y. */
  ny: number;
  /** Normalized bbox width. */
  nw: number;
  /** Normalized bbox height. */
  nh: number;
}

/**
 * For each track, pick the timestamp where the player is biggest + most
 * confidently detected. This gives us the clearest jersey crop possible.
 */
function pickBestMomentPerTrack(tracks: PlayerTrack[]): BestMoment[] {
  const moments: BestMoment[] = [];
  for (const trk of tracks) {
    // Skip noisy tracks — Claude will hallucinate a number for any crop we
    // hand it, even if the underlying track was a 5-frame ghost detection.
    if ((trk.trackQuality ?? 0) < TRACK_TRUST_THRESHOLD) continue;

    const [first] = trk.points;
    if (!first) continue;
    let best = first;
    let bestScore = best.confidence * best.w * best.h;
    for (const p of trk.points) {
      const score = p.confidence * p.w * p.h;
      if (score > bestScore) {
        best = p;
        bestScore = score;
      }
    }
    // Best detection itself must be high-quality — a track with one good
    // frame and four blurry ones isn't reliable for OCR either.
    if (best.confidence < 0.55) continue;

    moments.push({
      trackId: trk.trackId,
      t: best.t,
      nx: best.x,
      ny: best.y,
      nw: best.w,
      nh: best.h,
    });
  }
  return moments;
}

// ─── Crop jersey region from a frame ────────────────────────

/**
 * Extract a jersey crop. The bbox is for the whole person; the jersey
 * is roughly in the upper-third of the bbox (head is top ~15%, torso
 * 15-50%, legs 50-100%). Crop a little wider than the torso to give
 * Claude some context.
 */
async function cropJerseyRegion(
  clipPath: string,
  moment: BestMoment,
  frameWidth: number,
  frameHeight: number,
): Promise<string | null> {
  // Convert normalized to pixel
  const cx = moment.nx * frameWidth;
  const cy = moment.ny * frameHeight;
  const pw = moment.nw * frameWidth;
  const ph = moment.nh * frameHeight;

  // Jersey region: roughly torso (top 15-50% of bbox), horizontally centered
  const jerseyCenterY = cy - ph * 0.5 + ph * 0.325; // middle of the torso band
  const jerseyW = pw * 0.8;
  const jerseyH = ph * 0.35;

  const cropX = Math.max(0, Math.round(cx - jerseyW / 2));
  const cropY = Math.max(0, Math.round(jerseyCenterY - jerseyH / 2));
  const cropW = Math.min(Math.round(jerseyW), frameWidth - cropX);
  const cropH = Math.min(Math.round(jerseyH), frameHeight - cropY);

  // If the crop is tiny the player is too far away to read a number.
  if (cropW < 24 || cropH < 24) return null;

  const outPath = join(tmpdir(), `jsy-${randomUUID()}.jpg`);
  try {
    await execFileAsync(
      getFfmpegPath(),
      [
        '-y',
        '-ss',
        String(moment.t),
        '-i',
        clipPath,
        '-frames:v',
        '1',
        '-q:v',
        '2',
        // Re-extract at 1280-wide so the jersey crop has decent resolution.
        // crop=W:H:X:Y then scale the crop to a fixed height of 160px so
        // all crops are normalized for Claude.
        '-vf',
        `scale=1280:-1,crop=${cropW}:${cropH}:${cropX}:${cropY},scale=-1:160`,
        '-update',
        '1',
        outPath,
      ],
      { timeout: 15000 },
    );

    const buf = await readFile(outPath);
    if (buf.length < 500) return null; // likely a corrupt/empty frame
    return buf.toString('base64');
  } catch {
    return null;
  } finally {
    await unlink(outPath).catch(() => {});
  }
}

// ─── Batch OCR via Claude vision ────────────────────────────

const jerseyResultSchema = z.object({
  results: z.array(
    z.object({
      index: z.number().int().min(0).describe('Zero-based index matching the crop order'),
      jersey: z
        .string()
        .describe('Jersey number as a string (e.g. "12", "07"), or "unclear" if unreadable'),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

const OCR_SYSTEM = `You are a jersey-number reader. You will see a series of cropped football player
jersey images, numbered 0..N-1. For each crop, identify the jersey number if one is visible and readable.

Rules:
- Return ONLY digits as a string ("12", "7", "07"). Do NOT include letters.
- If the image shows something that isn't a jersey (ref, sideline, blur), return "unclear".
- If the number is partially obscured but you're confident (e.g. you see "1?" but the shape of the second
  digit strongly suggests 2), still guess — but lower confidence appropriately.
- If truly illegible, return "unclear" with low confidence.
- Be honest about confidence. A clear single digit: 0.9+. A back-facing number you had to read sideways: 0.5.

Output JSON matching the schema, one result per input crop, in the same order.`;

export interface JerseyOcrResult {
  /** trackId -> jersey number (e.g., "12"), only set for confident matches. */
  jerseys: Record<string, string>;
  /** trackId -> Claude's confidence in that jersey (0-1). Same keys as jerseys. */
  jerseyConfidences: Record<string, number>;
  /** Number of crops attempted. */
  cropsAttempted: number;
  /** Number of jerseys successfully read. */
  jerseysRead: number;
}

/**
 * Run jersey OCR for every track in this clip. Mutates nothing; returns
 * a map of trackId → jersey number. Only confident reads (confidence >=
 * MIN_CONFIDENCE) are included.
 */
export async function ocrJerseysForTracks(args: {
  clipPath: string;
  tracks: PlayerTrack[];
  frameWidth: number;
  frameHeight: number;
}): Promise<JerseyOcrResult> {
  // Bumped from 0.55 → 0.7. The aggregator rolls up by jersey+role; one
  // mis-read jersey at 0.6 confidence pollutes the "CB #24" bucket with
  // plays from a different player, producing fake separation tendencies.
  // Better to leave a track jersey-less than to assert a wrong jersey.
  const MIN_CONFIDENCE = 0.7;

  if (args.tracks.length === 0) {
    return { jerseys: {}, jerseyConfidences: {}, cropsAttempted: 0, jerseysRead: 0 };
  }

  // 1. Pick the best moment per track (filters out untrustable tracks)
  const moments = pickBestMomentPerTrack(args.tracks);

  // 2. Crop all jerseys (sequential — ffmpeg is CPU-bound anyway)
  const crops: Array<{ trackId: string; base64: string }> = [];
  for (const m of moments) {
    const b64 = await cropJerseyRegion(args.clipPath, m, args.frameWidth, args.frameHeight);
    if (b64) crops.push({ trackId: m.trackId, base64: b64 });
  }

  if (crops.length === 0) {
    return {
      jerseys: {},
      jerseyConfidences: {},
      cropsAttempted: moments.length,
      jerseysRead: 0,
    };
  }

  // 3. Send all crops to Claude in one call
  const imageContent = crops.map((c) => ({
    type: 'image' as const,
    image: `data:image/jpeg;base64,${c.base64}`,
  }));

  const textContent = {
    type: 'text' as const,
    text: `Read the jersey number on each of the ${crops.length} crops above (index 0..${crops.length - 1}). Return one result per crop.`,
  };

  let parsed: z.infer<typeof jerseyResultSchema> | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { output } = await generateText({
        model: gateway(OCR_MODEL),
        system: OCR_SYSTEM,
        messages: [
          {
            role: 'user',
            content: [...imageContent, textContent],
          },
        ],
        output: Output.object({ schema: jerseyResultSchema }),
      });
      if (output) {
        parsed = output;
        break;
      }
    } catch (err) {
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      console.error('jersey_ocr_failed', {
        err: err instanceof Error ? err.message.slice(0, 200) : String(err),
      });
    }
  }

  if (!parsed) {
    return {
      jerseys: {},
      jerseyConfidences: {},
      cropsAttempted: crops.length,
      jerseysRead: 0,
    };
  }

  // 4. Map back to trackIds, filtering by confidence + "unclear" sentinel
  const jerseys: Record<string, string> = {};
  const jerseyConfidences: Record<string, number> = {};
  for (const r of parsed.results) {
    const crop = crops[r.index];
    if (!crop) continue;
    if (r.jersey === 'unclear') continue;
    if (r.confidence < MIN_CONFIDENCE) continue;
    // Must be digits only (Claude is instructed, but sanity check)
    if (!/^\d{1,2}$/.test(r.jersey)) continue;
    jerseys[crop.trackId] = r.jersey;
    jerseyConfidences[crop.trackId] = r.confidence;
  }

  return {
    jerseys,
    jerseyConfidences,
    cropsAttempted: crops.length,
    jerseysRead: Object.keys(jerseys).length,
  };
}

/**
 * Apply jersey OCR results back onto a track list. Returns a new list;
 * does not mutate the input.
 */
export function applyJerseysToTracks(
  tracks: PlayerTrack[],
  jerseys: Record<string, string>,
  confidences: Record<string, number> = {},
): PlayerTrack[] {
  return tracks.map((t) => {
    const j = jerseys[t.trackId];
    if (!j) return t;
    return {
      ...t,
      jersey: j,
      jerseyConfidence: confidences[t.trackId],
    };
  });
}
