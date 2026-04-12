/**
 * Hudl breakdown CSV parser.
 *
 * Wraps `csv-parse` with Hudl-specific config:
 *   - Headers on the first row, used as keys
 *   - Empty strings preserved (Hudl uses empty strings for null)
 *   - Trim whitespace on both keys and values
 *   - Tolerate custom columns (passthrough into the row object)
 *
 * The output of this function is the raw input to `reconcileHudlExport`,
 * which runs it through Zod validation and reconciliation.
 */

import { parse } from 'csv-parse/sync';

export interface ParseCsvResult {
  rows: Record<string, unknown>[];
  columnCount: number;
  rowCount: number;
}

export class HudlCsvParseError extends Error {
  constructor(
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'HudlCsvParseError';
  }
}

/**
 * Parse a Hudl breakdown CSV string into an array of row objects.
 *
 * Accepts either a string or a Buffer. Returns rows keyed by the
 * exact column names from the CSV header — Hudl's column names are
 * not stable across program configs, so the Zod schema handles the
 * subset we actually care about.
 *
 * Throws HudlCsvParseError on any parse failure.
 */
export function parseHudlBreakdownCsv(input: string | Buffer): ParseCsvResult {
  let rows: Record<string, string>[];

  try {
    rows = parse(input, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
      // Hudl exports occasionally have a stray trailing comma
      relax_column_count_less: true,
      // BOM-tolerant
      bom: true,
    });
  } catch (err) {
    throw new HudlCsvParseError(
      `Could not parse Hudl breakdown CSV: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  if (rows.length === 0) {
    throw new HudlCsvParseError('Hudl breakdown CSV is empty');
  }

  const firstRow = rows[0];
  if (!firstRow) {
    throw new HudlCsvParseError('Hudl breakdown CSV has no rows after parsing');
  }

  const columnCount = Object.keys(firstRow).length;
  if (columnCount === 0) {
    throw new HudlCsvParseError('Hudl breakdown CSV has no columns');
  }

  return {
    rows,
    columnCount,
    rowCount: rows.length,
  };
}
