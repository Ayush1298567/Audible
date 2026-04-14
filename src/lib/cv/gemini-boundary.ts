/**
 * Gemini play boundary detection using the File API.
 *
 * For videos of any size:
 *   1. Upload the video to Gemini's File API (up to 20GB)
 *   2. Wait for processing
 *   3. Reference the file URI in the generation request
 *   4. Gemini watches the video natively and returns play boundaries
 *
 * This handles full-game videos reliably without request size limits.
 */

import { GoogleGenAI, type File as GeminiFile } from '@google/genai';
import { z } from 'zod';
import { log } from '@/lib/observability/log';

// Schema for what Gemini returns per play
export const detectedPlaySchema = z.object({
  startSeconds: z.number(),
  endSeconds: z.number(),
  down: z.number().int().min(0).max(4),
  distance: z.number().int().min(0).max(99),
  yardLine: z.number().int().min(0).max(99),
  quarter: z.number().int().min(0).max(4),
  formation: z.string(),
  offenseTeam: z.string(),
  playType: z.enum(['Run', 'Pass', 'RPO', 'Screen', 'Play Action', 'Kneel', 'Spike', 'Punt', 'FG', 'Kickoff', 'Unknown']),
  direction: z.enum(['Left', 'Right', 'Middle', 'N/A']),
  yardsGained: z.number(),
  result: z.string(),
  confidence: z.number().min(0).max(1),
});

export type DetectedPlay = z.infer<typeof detectedPlaySchema>;

const responseSchema = {
  type: 'object',
  properties: {
    plays: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          startSeconds: { type: 'number' },
          endSeconds: { type: 'number' },
          down: { type: 'integer', minimum: 0, maximum: 4 },
          distance: { type: 'integer', minimum: 0, maximum: 99 },
          yardLine: { type: 'integer', minimum: 0, maximum: 99 },
          quarter: { type: 'integer', minimum: 0, maximum: 4 },
          formation: { type: 'string' },
          offenseTeam: { type: 'string' },
          playType: {
            type: 'string',
            enum: ['Run', 'Pass', 'RPO', 'Screen', 'Play Action', 'Kneel', 'Spike', 'Punt', 'FG', 'Kickoff', 'Unknown'],
          },
          direction: { type: 'string', enum: ['Left', 'Right', 'Middle', 'N/A'] },
          yardsGained: { type: 'number' },
          result: { type: 'string' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: [
          'startSeconds', 'endSeconds', 'down', 'distance', 'yardLine',
          'quarter', 'formation', 'offenseTeam', 'playType', 'direction',
          'yardsGained', 'result', 'confidence',
        ],
        propertyOrdering: [
          'startSeconds', 'endSeconds', 'down', 'distance', 'yardLine',
          'quarter', 'formation', 'offenseTeam', 'playType', 'direction',
          'yardsGained', 'result', 'confidence',
        ],
      },
    },
    notes: { type: 'string' },
  },
  required: ['plays', 'notes'],
  propertyOrdering: ['plays', 'notes'],
};

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
- formation: offensive formation
- playType: Run, Pass, RPO, Screen, Play Action, Punt, FG, Kickoff, Kneel, Spike, Unknown
- direction: Left, Right, Middle, N/A
- yardsGained: actual yards gained/lost
- result: plain English result

Be precise with timestamps — start_seconds should be within 1 second of when the pre-snap
alignment becomes clear. Report honest confidence levels.`;

export interface BoundaryDetectionOptions {
  videoBlobUrl: string;
}

export interface BoundaryDetectionResult {
  plays: DetectedPlay[];
  notes: string;
}

/**
 * Upload a video to Gemini's File API and analyze it for play boundaries.
 */
export async function detectPlayBoundaries(
  options: BoundaryDetectionOptions,
): Promise<BoundaryDetectionResult> {
  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY or GEMINI_API_KEY env var required for video analysis');
  }

  const ai = new GoogleGenAI({ apiKey });

  // Step 1: Fetch the video from Blob
  const videoResponse = await fetch(options.videoBlobUrl);
  if (!videoResponse.ok) {
    throw new Error(`Failed to fetch video: ${videoResponse.status}`);
  }
  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

  // Step 2: Upload to Gemini File API (not blocked by request size limits)
  log.info('gemini_file_upload_start', { sizeBytes: videoBuffer.length });
  const uploadStart = Date.now();

  const uploadedFile = await ai.files.upload({
    file: new Blob([videoBuffer], { type: 'video/mp4' }),
    config: {
      mimeType: 'video/mp4',
      displayName: 'game-film',
    },
  });

  log.info('gemini_file_uploaded', {
    fileUri: uploadedFile.uri,
    uploadMs: Date.now() - uploadStart,
  });

  // Step 3: Wait for file to be processed (state: PROCESSING → ACTIVE)
  let file: GeminiFile = uploadedFile;
  while (file.state === 'PROCESSING') {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    if (!file.name) break;
    file = await ai.files.get({ name: file.name });
  }

  if (file.state !== 'ACTIVE') {
    throw new Error(`Gemini file processing failed: state=${file.state}`);
  }

  if (!file.uri) {
    throw new Error('Uploaded file has no URI');
  }

  log.info('gemini_file_ready', { fileUri: file.uri });

  // Step 4: Generate content using the file URI
  const genStart = Date.now();
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            fileData: {
              mimeType: 'video/mp4',
              fileUri: file.uri,
            },
          },
          {
            text: 'Analyze this game film. Identify every live football play with precise timestamps.',
          },
        ],
      },
    ],
    config: {
      systemInstruction: SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseSchema,
    },
  });

  log.info('gemini_generation_done', { durationMs: Date.now() - genStart });

  const text = response.text;
  if (!text) {
    throw new Error('Gemini returned no text');
  }

  const parsed = JSON.parse(text);
  const plays = z.array(detectedPlaySchema).parse(parsed.plays);

  // Clean up the uploaded file (optional — they expire in 48h anyway)
  if (file.name) {
    await ai.files.delete({ name: file.name }).catch(() => {});
  }

  return {
    plays,
    notes: parsed.notes ?? '',
  };
}
