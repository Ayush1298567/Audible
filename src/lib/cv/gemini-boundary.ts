/**
 * Gemini play boundary detection.
 *
 * Given a video URL (in Vercel Blob), Gemini watches the video
 * and returns every play's start/end timestamp + basic tags.
 *
 * For videos > 100MB, we upload to Gemini's File API first.
 * For smaller clips we pass bytes inline.
 *
 * Gemini sees motion natively — detects play snaps, dead balls,
 * and reads scoreboards across time. No frame sampling.
 */

import { generateText, Output, gateway } from 'ai';
import { z } from 'zod';

const BOUNDARY_MODEL = 'google/gemini-2.0-flash';

// Schema for what Gemini returns per play
export const detectedPlaySchema = z.object({
  /** Play start in seconds from video beginning (when pre-snap alignment is visible). */
  startSeconds: z.number(),
  /** Play end in seconds (whistle or ball carrier tackled). */
  endSeconds: z.number(),
  /** Down from scoreboard, or 0 if not visible. */
  down: z.number().int().min(0).max(4),
  /** Distance to go in yards, or 0 if not visible. */
  distance: z.number().int().min(0).max(99),
  /** Yard line at snap, or 0 if not determinable. */
  yardLine: z.number().int().min(0).max(99),
  /** Quarter (1-4) or 0 if not visible. */
  quarter: z.number().int().min(0).max(4),
  /** Offensive formation */
  formation: z.string(),
  /** Who has the ball (team name or 'offense'/'defense' perspective). */
  offenseTeam: z.string(),
  /** Basic play type */
  playType: z.enum(['Run', 'Pass', 'RPO', 'Screen', 'Play Action', 'Kneel', 'Spike', 'Punt', 'FG', 'Kickoff', 'Unknown']),
  /** Play direction */
  direction: z.enum(['Left', 'Right', 'Middle', 'N/A']),
  /** Yards gained (negative for loss). */
  yardsGained: z.number(),
  /** Outcome */
  result: z.string(),
  /** Gemini's confidence (0-1). */
  confidence: z.number().min(0).max(1),
});

export type DetectedPlay = z.infer<typeof detectedPlaySchema>;

const boundaryResponseSchema = z.object({
  plays: z.array(detectedPlaySchema),
  segmentStart: z.number().describe('Start of the segment analyzed in seconds'),
  segmentEnd: z.number().describe('End of the segment analyzed in seconds'),
  notes: z.string().describe('Overall observations about this segment'),
});

const SYSTEM_PROMPT = `You are an expert football film analyst watching HS or college game footage.
Your job is to identify every LIVE football play in the video and return precise boundaries + tags.

A "play" starts when the offense is lined up in formation (pre-snap alignment visible) and ends
when the whistle blows or the ball carrier is tackled/out of bounds.

DO include: standard plays, punts, field goals, kickoffs, kneel downs, spikes
DO NOT include: timeouts, commercials, replays, halftime, penalties being discussed,
  sideline shots, huddles, dead-ball moments between plays.

For each play extract:
- startSeconds: precise timestamp when the play begins (pre-snap alignment)
- endSeconds: precise timestamp when the play ends (tackle / whistle)
- down/distance/yardLine/quarter: read from the scoreboard if visible
- formation: offensive formation (Shotgun, Pistol, I-Form, Singleback, Under Center, Empty, Trips, etc)
- playType: Run, Pass, RPO, Screen, Play Action, Punt, FG, Kickoff, Kneel, Spike, Unknown
- direction: Left, Right, Middle, N/A
- yardsGained: actual yards gained/lost on the play
- result: plain English ("3 yd gain", "touchdown", "incomplete", "sack", "penalty", etc)

Be precise with timestamps — start_seconds should be within 1 second of when the pre-snap
alignment becomes clear. If you're uncertain about a field (down, formation, etc), still
report your best guess but lower the confidence.`;

export interface BoundaryDetectionOptions {
  videoBlobUrl: string;
  /** For long videos, restrict to a segment (seconds). */
  segmentStartSeconds?: number;
  segmentEndSeconds?: number;
}

export interface BoundaryDetectionResult {
  plays: DetectedPlay[];
  notes: string;
  segmentStart: number;
  segmentEnd: number;
}

/**
 * Send a video to Gemini for play boundary detection.
 *
 * The video is fetched from the Blob URL and sent as inline data.
 * For videos > 100MB, use chunked analysis (segmentStart/End).
 */
export async function detectPlayBoundaries(
  options: BoundaryDetectionOptions,
): Promise<BoundaryDetectionResult> {
  // Fetch the video bytes from Blob
  const videoResponse = await fetch(options.videoBlobUrl);
  if (!videoResponse.ok) {
    throw new Error(`Failed to fetch video: ${videoResponse.status}`);
  }
  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());
  const base64Video = videoBuffer.toString('base64');

  const prompt = options.segmentStartSeconds !== undefined && options.segmentEndSeconds !== undefined
    ? `Analyze the segment from ${options.segmentStartSeconds}s to ${options.segmentEndSeconds}s of this game film. Timestamps in your output should be relative to the video start (not the segment). Identify every live football play.`
    : 'Analyze this game film. Identify every live football play with precise timestamps.';

  const { output } = await generateText({
    model: gateway(BOUNDARY_MODEL),
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        { type: 'file', data: base64Video, mediaType: 'video/mp4' },
        { type: 'text', text: prompt },
      ],
    }],
    output: Output.object({ schema: boundaryResponseSchema }),
  });

  if (!output) {
    throw new Error('Gemini returned no output');
  }

  return {
    plays: output.plays,
    notes: output.notes,
    segmentStart: output.segmentStart,
    segmentEnd: output.segmentEnd,
  };
}
