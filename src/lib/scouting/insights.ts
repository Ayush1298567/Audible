/**
 * Interactive scouting walkthrough — data model.
 *
 * After the AI pipeline tags every play, a "surfacing" step asks
 * Claude to pick the 3-5 most exploitable tendencies for this
 * opponent. Each insight comes with example clips and visual
 * overlay instructions so the walkthrough can show-not-tell.
 */

// ─── Visual overlays on a clip ────────────────────────────────

export type OverlayType = 'circle' | 'arrow' | 'label' | 'zone';

export interface ClipOverlay {
  /** When to show the overlay (seconds from clip start). */
  timestamp: number;
  /** How long to keep it on screen (seconds). Default 2. */
  duration?: number;
  type: OverlayType;
  /** Normalized 0-1 coords (relative to video frame). */
  x: number;
  y: number;
  /** Arrow endpoint (arrow type only). */
  toX?: number;
  toY?: number;
  /** Circle radius (0-1 normalized). Default 0.06. */
  radius?: number;
  /** Optional label text drawn near the shape. */
  label?: string;
  /** Hex color. Defaults: red for defense, cyan for offense. */
  color?: string;
}

// ─── A single example clip that illustrates an insight ──────

export interface InsightExample {
  playId: string;
  /** Short label shown under the video, e.g. "3rd & 12 vs Jefferson, Q2". */
  label: string;
  /** Video URL (Vercel Blob or YouTube embed). */
  clipUrl: string;
  /** Claude's one-sentence description of what's happening here. */
  description: string;
  /** Overlays synced to this clip's timeline. */
  overlays: ClipOverlay[];
  /** Optional player tracks rendered as moving dots on the clip. */
  tracks?: Array<{
    trackId: string;
    points: Array<{
      t: number;
      x: number;
      y: number;
      w: number;
      h: number;
      confidence: number;
      fx?: number;
      fy?: number;
    }>;
    jersey?: string;
    role?: string;
  }>;
  /** Track IDs Claude wants highlighted for this insight. */
  highlightTrackIds?: string[];
  /** CV-derived measurements for this play, for visible badges in the UI. */
  measurements?: {
    peakSpeedYps?: number;
    peakSpeedPlayer?: { jersey?: string; role?: string };
    maxDepthYards?: number;
    playDurationSec?: number;
    fieldRegistered?: boolean;
  };
}

// ─── A single actionable tendency ────────────────────────────

/**
 * A single structured play-call recommendation. Split so the walkthrough UI
 * can render it as a situation → call → rationale card and so future
 * features (call-sheet generation, practice script) can index on situation.
 */
export interface Recommendation {
  /** When to use it ("3rd & long vs Cover 3 rotation"). */
  situation: string;
  /** The concrete play-call ("Mesh vs Trips Rt"). */
  call: string;
  /** Why it works, ideally citing a measurement. */
  rationale: string;
}

export interface Insight {
  /** Stable id — usually a slug of the headline. */
  id: string;
  /** Display order (1 = most important). */
  rank: number;
  /** Short headline in CAPS. Max ~6 words. */
  headline: string;
  /** 2-3 sentence explanation of what to look for. */
  narrative: string;
  /** Minimum 1, typically 2-3 example clips. */
  examples: InsightExample[];
  /** Concrete plays/calls the coach should use against this tendency. */
  recommendations: Recommendation[];
  /** Number of supporting plays (sample size). */
  evidenceCount: number;
}

// ─── Walkthrough shape ───────────────────────────────────────

export interface Walkthrough {
  opponentId: string;
  opponentName: string;
  /** Total plays analyzed. */
  playsAnalyzed: number;
  /** 3-5 actionable insights, ranked. */
  insights: Insight[];
  /** Overall one-liner generated from all insights. */
  summary: string;
  /** ISO timestamp. */
  generatedAt: string;
}
