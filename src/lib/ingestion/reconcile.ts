/**
 * Hudl ingestion reconciliation.
 *
 * Implements PLAN.md §4a. This is the single most critical correctness
 * checkpoint in the product. Partial ingestion is forbidden — any mismatch
 * rejects the upload with a clear user-facing error.
 *
 *   1. parse csv                → N_csv play rows
 *   2. parse xml                → N_xml code instances
 *   3. ffprobe mp4              → D_total duration in seconds
 *   4. ASSERT N_csv == N_xml
 *   5. ASSERT max(xml.t_end) <= D_total + 2.0   (encoder drift tolerance)
 *   6. ASSERT all segments have positive duration
 *   7. Align csv[i] ↔ xml[i] BY INDEX (positional)
 *   8. Return the reconciled play list, ready for clip-splitting
 */

import {
  hudlBreakdownCsvSchema,
  HudlReconciliationError,
  type ReconciledIngest,
  sportscodeXmlSchema,
} from './hudl-schemas';
import type { HudlBreakdownRow, SportscodeInstance } from './hudl-schemas';

const MP4_DRIFT_TOLERANCE_SECONDS = 2.0;

export interface ReconcileInput {
  csvRaw: unknown[];
  xmlRaw: unknown[];
  mp4DurationSeconds: number;
}

export function reconcileHudlExport(input: ReconcileInput): ReconciledIngest {
  // Step 1: validate CSV
  const csvResult = hudlBreakdownCsvSchema.safeParse(input.csvRaw);
  if (!csvResult.success) {
    const firstIssue = csvResult.error.issues[0];
    throw new HudlReconciliationError(
      `Hudl breakdown CSV is invalid at row ${(firstIssue?.path[0] as number) + 1}: ${firstIssue?.message}`,
      { issues: csvResult.error.issues },
    );
  }
  const csv = csvResult.data;

  // Step 2: validate XML
  const xmlResult = sportscodeXmlSchema.safeParse(input.xmlRaw);
  if (!xmlResult.success) {
    const firstIssue = xmlResult.error.issues[0];
    throw new HudlReconciliationError(
      `SportsCode XML is invalid at segment ${(firstIssue?.path[0] as number) + 1}: ${firstIssue?.message}`,
      { issues: xmlResult.error.issues },
    );
  }
  const xml = xmlResult.data;

  // Step 3: mp4 duration already provided by caller (ffprobe in the ingestion worker)
  const { mp4DurationSeconds } = input;

  // Step 4: row count must match segment count exactly
  if (csv.length !== xml.length) {
    throw new HudlReconciliationError(
      `Hudl export mismatch: CSV has ${csv.length} plays but XML has ${xml.length} segments. Re-export from Hudl and try again.`,
      { csvRowCount: csv.length, xmlSegmentCount: xml.length },
    );
  }

  // Step 5: XML segments must fit inside the MP4 duration (with tolerance)
  const maxEnd = Math.max(...xml.map((s) => s.end));
  if (maxEnd > mp4DurationSeconds + MP4_DRIFT_TOLERANCE_SECONDS) {
    throw new HudlReconciliationError(
      `XML timestamps extend ${(maxEnd - mp4DurationSeconds).toFixed(2)}s beyond video duration (${mp4DurationSeconds.toFixed(2)}s). Re-export and try again.`,
      { maxXmlEnd: maxEnd, mp4Duration: mp4DurationSeconds },
    );
  }

  // Step 6: every segment must have positive duration (already checked by Zod, belt-and-suspenders)
  const zeroDurationIndexes: number[] = [];
  xml.forEach((s, i) => {
    if (s.end <= s.start) zeroDurationIndexes.push(i + 1);
  });
  if (zeroDurationIndexes.length > 0) {
    throw new HudlReconciliationError(
      `XML contains zero-duration segments at rows: ${zeroDurationIndexes.join(', ')}`,
      { zeroDurationIndexes },
    );
  }

  // Step 7: align positionally. Hudl always exports in order; we validate this
  // assumption in the eval fixture and real-Hudl test.
  const playRows = csv.map((row, i) => {
    const segment = xml[i];
    if (!segment) {
      // Unreachable given step 4, but TypeScript doesn't know that.
      throw new HudlReconciliationError(
        `Internal: missing XML segment at position ${i}`,
        { position: i },
      );
    }
    return {
      playOrder: i + 1,
      row: row as HudlBreakdownRow,
      segment: segment as SportscodeInstance,
    };
  });

  // Step 8: collect any non-fatal warnings (unknown CSV columns, large drift, etc.)
  const warnings: string[] = [];
  if (maxEnd < mp4DurationSeconds - MP4_DRIFT_TOLERANCE_SECONDS) {
    warnings.push(
      `XML segments end ${(mp4DurationSeconds - maxEnd).toFixed(2)}s before video ends — trailing footage will not be indexed`,
    );
  }

  return {
    playRows,
    mp4DurationSeconds,
    warnings,
  };
}

/**
 * Compute the idempotency key for an upload.
 * Hash is the sha256 of the MP4 file, namespaced by program and game.
 */
export function computeIdempotencyKey(args: {
  mp4Sha256: string;
  programId: string;
  gameId: string;
}): string {
  return `${args.programId}:${args.gameId}:${args.mp4Sha256}`;
}
