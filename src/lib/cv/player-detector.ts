/**
 * Player detection via Roboflow Hosted Inference API.
 *
 * Uses the public people-detection-o4rdr/1 model (COCO-trained, generic
 * person detection). On HS football film it picks up ~18-20 people per
 * frame (22 on-field players + refs + sideline, with some misses).
 *
 * For full Tier C we'll want an American-football-specific fine-tune.
 * That's a later upgrade — the tracker and homography logic don't care
 * what model produced the detections.
 */

const API_BASE = 'https://detect.roboflow.com';
const MODEL = 'people-detection-o4rdr/1';
const DEFAULT_CONFIDENCE = 30;

export interface Detection {
  /** Center x in pixel coords. */
  x: number;
  /** Center y in pixel coords. */
  y: number;
  width: number;
  height: number;
  confidence: number;
  class: string;
}

export interface FrameDetections {
  /** Frame timestamp in seconds, relative to clip start. */
  timestamp: number;
  /** Image dimensions — needed to normalize coords. */
  imageWidth: number;
  imageHeight: number;
  detections: Detection[];
}

interface RoboflowPrediction {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  class: string;
  class_id: number;
  detection_id: string;
}

interface RoboflowResponse {
  inference_id: string;
  time: number;
  image: { width: number; height: number };
  predictions: RoboflowPrediction[];
}

/**
 * Run person detection on a single frame (base64-encoded JPEG).
 */
export async function detectPeopleInFrame(
  frameBase64: string,
  opts: { confidence?: number; apiKey?: string } = {},
): Promise<{ detections: Detection[]; imageWidth: number; imageHeight: number }> {
  const apiKey = opts.apiKey ?? process.env.ROBOFLOW_API_KEY;
  if (!apiKey) {
    throw new Error('ROBOFLOW_API_KEY env var required');
  }

  const url = `${API_BASE}/${MODEL}?api_key=${apiKey}&confidence=${opts.confidence ?? DEFAULT_CONFIDENCE}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: frameBase64,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Roboflow error ${res.status}: ${txt.slice(0, 200)}`);
  }

  const json = (await res.json()) as RoboflowResponse;
  return {
    imageWidth: json.image.width,
    imageHeight: json.image.height,
    detections: (json.predictions ?? []).map((p) => ({
      x: p.x,
      y: p.y,
      width: p.width,
      height: p.height,
      confidence: p.confidence,
      class: p.class,
    })),
  };
}

/**
 * Run detection in parallel over a set of frames.
 * Roboflow's hosted API handles concurrent requests well.
 */
export async function detectPeopleInFrames(
  frames: Array<{ timestamp: number; base64: string }>,
  opts: { confidence?: number; concurrency?: number; apiKey?: string } = {},
): Promise<FrameDetections[]> {
  const concurrency = opts.concurrency ?? 5;
  const results: FrameDetections[] = [];

  // Process in batches of N to avoid overwhelming the API
  for (let i = 0; i < frames.length; i += concurrency) {
    const batch = frames.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (f) => {
        try {
          const { detections, imageWidth, imageHeight } = await detectPeopleInFrame(
            f.base64,
            { confidence: opts.confidence, apiKey: opts.apiKey },
          );
          return { timestamp: f.timestamp, imageWidth, imageHeight, detections };
        } catch (err) {
          console.warn('detect_frame_failed', { t: f.timestamp, err: String(err).slice(0, 100) });
          return { timestamp: f.timestamp, imageWidth: 0, imageHeight: 0, detections: [] };
        }
      }),
    );
    results.push(...batchResults);
  }

  return results;
}
