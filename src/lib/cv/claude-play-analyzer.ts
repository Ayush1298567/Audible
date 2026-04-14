/**
 * Claude Sonnet per-play deep analyzer.
 *
 * Given a play clip (short MP4 of a single play), extract 7 frames
 * across the play and send them to Claude Sonnet as a sequential
 * bundle so Claude sees the motion — not just a snapshot.
 *
 * Claude identifies:
 *   - Pre-snap: exact formation, personnel, motion
 *   - Snap: coverage shell, pressure, front
 *   - Post-snap: route concept, run gap, blocking scheme, coverage rotation
 *   - Result: yards gained, how the play finished
 *
 * This is football IQ over time. What Gemini can't do reliably at
 * the whole-video level, Claude does on isolated plays with context.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { generateText, Output, gateway } from 'ai';
import { z } from 'zod';

const execFileAsync = promisify(execFile);

const ANALYZER_MODEL = 'anthropic/claude-sonnet-4.6';

// ─── Schema: what Claude returns for a single play ───────────

export const playAnalysisSchema = z.object({
  // PRE-SNAP — visible before ball moves
  formation: z.string().describe('Offensive formation (Shotgun Spread, Trips Rt, Pistol, I-Form, Singleback, Empty, Wildcat, etc)'),
  personnel: z.string().describe('Personnel grouping as XY (10, 11, 12, 13, 20, 21, 22, 23)'),
  motion: z.string().describe('Pre-snap motion if any (e.g. "WR motions across", "jet motion right"), or "None"'),
  preSnapCoverageRead: z.string().describe('What the safeties show pre-snap (single_high, two_high, cover_0_look, disguised, unknown)'),

  // AT/POST-SNAP — determined from motion across frames
  coverageShell: z.string().describe('Actual coverage played (cover_0, cover_1, cover_2, cover_3, cover_4, quarters, man_free, man_under, unknown)'),
  defensiveFront: z.string().describe('Front structure (4-3 Over, 4-3 Under, 3-4, Nickel 4-2-5, Dime 3-3-5, etc)'),
  pressureType: z.string().describe('Pressure type (base_4, base_5, lb_blitz, db_blitz, zero_blitz, dl_stunt, lb_stunt, no_pressure, unknown)'),

  // PLAY EXECUTION
  playType: z.string().describe('Play type (Run, Pass, RPO, Screen, Play Action, QB Run, Kneel, Spike, Punt, FG, Kickoff, Unknown)'),
  playDirection: z.string().describe('Direction (Left, Right, Middle, N/A)'),
  // Only relevant for runs
  runGap: z.string().optional().describe('Run gap (A_left, A_right, B_left, B_right, C_left, C_right, D_left, D_right, N/A)'),
  blockingScheme: z.string().optional().describe('Blocking scheme (inside_zone, outside_zone, power, counter, trap, draw, pass_pro, screen, unknown, N/A)'),
  // Only relevant for passes
  routeConcept: z.string().optional().describe('Route concept (mesh, levels, flood, stick, slant_flat, four_verts, curl_flat, spacing, screen, rpo_glance, scramble, unknown, N/A)'),

  // RESULT
  yardsGained: z.number(),
  result: z.string().describe('Plain-English result ("12 yd gain", "TD", "incomplete", "sack -5", "INT", "penalty, declined")'),

  // CONFIDENCE + REASONING
  confidence: z.number().min(0).max(1),
  keyObservations: z.array(z.string().max(300)).min(1).max(5).describe('2-4 things a coach should notice on this play'),
  reasoning: z.string().min(20).max(1500),
});

export type PlayAnalysis = z.infer<typeof playAnalysisSchema>;

// ─── Frame extraction from a play clip ──────────────────────

function getFfmpegPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const installer = require('@ffmpeg-installer/ffmpeg');
    return installer.path;
  } catch {
    return 'ffmpeg';
  }
}

interface SequentialFrame {
  label: 'pre_snap' | 'snap' | 't_plus_1' | 't_plus_2' | 't_plus_3' | 't_plus_4' | 'end';
  relativeSeconds: number;
  base64: string;
}

async function extractSequentialFrames(
  clipPath: string,
  clipDurationSeconds: number,
): Promise<SequentialFrame[]> {
  // Extract frames at 7 key moments across the play
  const targets: Array<{ label: SequentialFrame['label']; t: number }> = [
    { label: 'pre_snap', t: Math.max(0, clipDurationSeconds * 0.08) },
    { label: 'snap', t: Math.max(0, clipDurationSeconds * 0.2) },
    { label: 't_plus_1', t: Math.max(0, clipDurationSeconds * 0.35) },
    { label: 't_plus_2', t: Math.max(0, clipDurationSeconds * 0.5) },
    { label: 't_plus_3', t: Math.max(0, clipDurationSeconds * 0.65) },
    { label: 't_plus_4', t: Math.max(0, clipDurationSeconds * 0.8) },
    { label: 'end', t: Math.max(0, clipDurationSeconds * 0.95) },
  ];

  const frames: SequentialFrame[] = [];

  for (const { label, t } of targets) {
    const outPath = join(tmpdir(), `seq-${randomUUID()}.jpg`);
    try {
      await execFileAsync(getFfmpegPath(), [
        '-y',
        '-ss', String(t),
        '-i', clipPath,
        '-frames:v', '1',
        '-q:v', '3',
        '-vf', 'scale=640:-1',
        '-update', '1',
        outPath,
      ], { timeout: 15000 });

      const buf = await readFile(outPath);
      frames.push({
        label,
        relativeSeconds: t,
        base64: buf.toString('base64'),
      });
    } catch {
      // skip bad frames
    } finally {
      await unlink(outPath).catch(() => {});
    }
  }

  return frames;
}

// ─── Public API ──────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert football film analyst. You will see 7 sequential frames from
a single football play. The frames are labeled:
  pre_snap  → offense lined up, about to snap
  snap      → ball just snapped, all 22 start moving
  t_plus_1  → 1s into the play
  t_plus_2  → 2s into the play
  t_plus_3  → 3s into the play
  t_plus_4  → 4s into the play
  end       → play is ending (whistle/tackle)

Watch the MOTION across the frames. A single frame is a snapshot; the sequence shows:
- Safety rotation (one high → late Cover 2, or stays single high → Cover 1/3)
- Route stems and breaks (inside vs outside, hitches vs go routes)
- Who pulled on the OL, who combo-blocked
- Rush paths vs drops (pressure vs coverage)
- Ball location and where the play actually goes

Output STRICT JSON matching the schema. Be honest about confidence — if you can't tell
the route concept because the angle hides the receivers, say "unknown" and lower confidence.

Key definitions:
- Cover 1: single high safety, man under
- Cover 2: two high safeties splitting field, zone or man under
- Cover 3: single high safety, zone (corners in deep third)
- Cover 4: four deep (two safeties + two corners), pattern match
- Personnel: "11" = 1 RB + 1 TE + 3 WR, "12" = 1 RB + 2 TE + 2 WR, etc
- Run gaps: A (between center/guard), B (guard/tackle), C (tackle/TE), D (outside TE)
- Route concepts: Mesh (two crossing shallows), Levels (hitch + dig), Flood (3 routes to same side),
  Stick (hitch + corner + flat), Slant-Flat, Four Verts, Curl-Flat, Spacing, Screen`;

export interface PlayAnalysisInput {
  clipPath: string;
  clipDurationSeconds: number;
  downAndDistance?: { down: number; distance: number };
  context?: string;
}

export async function analyzePlayClip(input: PlayAnalysisInput): Promise<PlayAnalysis | null> {
  const frames = await extractSequentialFrames(input.clipPath, input.clipDurationSeconds);
  if (frames.length < 3) {
    // Need at least 3 frames to see motion across time. Shorter clips
    // (keyframe-cut glitches, <3s plays) aren't worth sending to Claude.
    console.warn('claude_skipped_insufficient_frames', { frameCount: frames.length });
    return null;
  }

  // Build the multi-frame message
  const imageContent = frames.map((f) => ({
    type: 'image' as const,
    image: `data:image/jpeg;base64,${f.base64}`,
  }));

  const frameLabels = frames.map((f) => f.label).join(', ');
  const ctx = input.context ? `Context: ${input.context}\n` : '';
  const dd = input.downAndDistance
    ? `Down & Distance: ${input.downAndDistance.down} & ${input.downAndDistance.distance}\n`
    : '';

  const textContent = {
    type: 'text' as const,
    text: `${ctx}${dd}The ${frames.length} frames below are in chronological order (${frameLabels}) from a single football play. Analyze the full motion across them and output your scouting tags.`,
  };

  // One retry on transient failures (rate limits, schema hiccups)
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { output } = await generateText({
        model: gateway(ANALYZER_MODEL),
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [...imageContent, textContent],
        }],
        output: Output.object({ schema: playAnalysisSchema }),
      });

      if (output) return output;
    } catch (err) {
      lastError = err;
      // Backoff briefly before retry
      if (attempt === 0) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  }

  if (lastError) {
    console.error('claude_analysis_failed_after_retry', {
      message: lastError instanceof Error ? lastError.message.slice(0, 300) : String(lastError),
    });
  }

  return null;
}

/**
 * Download a play clip from a Blob URL and analyze it.
 */
export async function analyzePlayFromBlob(
  blobUrl: string,
  durationSeconds: number,
  downAndDistance?: { down: number; distance: number },
): Promise<PlayAnalysis | null> {
  const res = await fetch(blobUrl);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());

  const clipPath = join(tmpdir(), `play-${randomUUID()}.mp4`);
  await writeFile(clipPath, buf);

  try {
    return await analyzePlayClip({
      clipPath,
      clipDurationSeconds: durationSeconds,
      downAndDistance,
    });
  } finally {
    await unlink(clipPath).catch(() => {});
  }
}
