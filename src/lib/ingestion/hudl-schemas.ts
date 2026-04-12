/**
 * Hudl export parsing — Zod schemas for the breakdown CSV and SportsCode XML.
 *
 * Hudl's breakdown CSV format varies per program (custom columns, user-added
 * fields). We validate the subset of columns we actually need; unknown columns
 * are tolerated and logged, missing required columns fail the upload with an
 * explicit error naming the row and column.
 *
 * See PLAN.md §4a (reconciliation algorithm) and §5.7 (CSV validation).
 */

import { z } from 'zod';

// ─── Helpers ────────────────────────────────────────────────────

/**
 * Hudl exports numbers as strings. Coerce + bounds-check.
 */
const intString = (min: number, max: number) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .pipe(z.number().int().min(min).max(max));

const optionalIntString = (min: number, max: number) =>
  z
    .union([z.string(), z.number(), z.undefined(), z.null(), z.literal('')])
    .transform((v) => (v === '' || v == null ? null : Number(v)))
    .pipe(z.number().int().min(min).max(max).nullable());

// ─── Breakdown CSV row ──────────────────────────────────────────

export const hudlBreakdownRowSchema = z.object({
  // Play order — required, used for alignment with XML segments
  'Play #': intString(1, 10_000),

  // Down / distance
  DN: optionalIntString(1, 4),
  DIST: optionalIntString(0, 99),

  // Field position
  'YARD LN': optionalIntString(-50, 50).nullable().optional(),
  HASH: z
    .union([
      z.literal('L'),
      z.literal('M'),
      z.literal('R'),
      z.literal(''),
      z.undefined(),
    ])
    .transform((v) => {
      if (v === '' || v == null) return null;
      return { L: 'left', M: 'middle', R: 'right' }[v] ?? null;
    })
    .nullable(),

  // Game situation
  QTR: optionalIntString(1, 5),
  'OUR SCORE': optionalIntString(0, 999).optional(),
  'OPP SCORE': optionalIntString(0, 999).optional(),

  // Formation & personnel
  'OFF FORM': z.string().optional().nullable(),
  'OFF PLAY': z.string().optional().nullable(),
  PERS: z.string().optional().nullable(),
  'OFF STR': z.string().optional().nullable(),
  BACKFIELD: z.string().optional().nullable(),
  MOTION: z.string().optional().nullable(),

  // Play classification
  'PLAY TYPE': z.string().optional().nullable(),
  'PLAY DIR': z.string().optional().nullable(),

  // Outcome
  'GN/LS': optionalIntString(-99, 99).optional(),
  RESULT: z.string().optional().nullable(),

  // ODK
  ODK: z
    .union([z.literal('O'), z.literal('D'), z.literal('K'), z.literal('')])
    .transform((v) => (v === '' || v == null ? null : { O: 'offense', D: 'defense', K: 'kick' }[v]))
    .nullable(),
})
  // Hudl custom columns are passed through unchanged into the rawCsvRow
  // JSONB column. We don't fail validation when we see them.
  .passthrough();

export type HudlBreakdownRow = z.infer<typeof hudlBreakdownRowSchema>;

/**
 * Full breakdown CSV: array of rows with non-empty length assertion.
 */
export const hudlBreakdownCsvSchema = z
  .array(hudlBreakdownRowSchema)
  .min(1, 'Breakdown CSV contains zero rows')
  .max(2000, 'Breakdown CSV exceeds 2000 rows — likely not a single-game export');

// ─── SportsCode XML code instance ───────────────────────────────

/**
 * SportsCode XML exports a flat list of <instance> nodes. Each has a
 * numeric code (matches the Hudl play index), a start time, an end time,
 * and optional label metadata we currently ignore.
 */
export const sportscodeInstanceSchema = z.object({
  code: z.string().min(1),
  start: z.number().nonnegative(),
  end: z.number().positive(),
})
  .refine((i) => i.end > i.start, {
    message: 'Zero-duration segment (end must be strictly greater than start)',
  })
  .refine((i) => i.end - i.start < 300, {
    message: 'Segment longer than 5 minutes — likely a parsing bug',
  });

export type SportscodeInstance = z.infer<typeof sportscodeInstanceSchema>;

export const sportscodeXmlSchema = z
  .array(sportscodeInstanceSchema)
  .min(1, 'XML contains zero segments');

// ─── Reconciliation result ──────────────────────────────────────

/**
 * The shape we pass into the ingestion workflow after CSV and XML parse
 * but before we split the MP4. If reconciliation fails, we throw with
 * a user-facing error string instead of producing this shape.
 */
export interface ReconciledIngest {
  playRows: Array<{
    playOrder: number;
    row: HudlBreakdownRow;
    segment: SportscodeInstance;
  }>;
  mp4DurationSeconds: number;
  warnings: string[];
}

export class HudlReconciliationError extends Error {
  constructor(
    public readonly userFacingMessage: string,
    public readonly details: Record<string, unknown>,
  ) {
    super(userFacingMessage);
    this.name = 'HudlReconciliationError';
  }
}
