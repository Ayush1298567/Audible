/**
 * Ingestion module — Hudl export parsing and reconciliation.
 *
 * Exposes a single entry point for the ingestion workflow. Callers
 * (the /api/ingest route handler and the queued workers) import from
 * here, not from the individual files.
 */

export {
  hudlBreakdownRowSchema,
  hudlBreakdownCsvSchema,
  sportscodeInstanceSchema,
  sportscodeXmlSchema,
  HudlReconciliationError,
} from './hudl-schemas';

export type {
  HudlBreakdownRow,
  SportscodeInstance,
  ReconciledIngest,
} from './hudl-schemas';

export { reconcileHudlExport, computeIdempotencyKey } from './reconcile';

export type { ReconcileInput } from './reconcile';

export { parseHudlBreakdownCsv, HudlCsvParseError } from './parse-csv';
export type { ParseCsvResult } from './parse-csv';

export { parseSportscodeXml, HudlXmlParseError } from './parse-xml';
export type { ParseXmlResult } from './parse-xml';

export {
  probeVideoDuration,
  extractClip,
  splitAndUploadClips,
} from './split-clips';
export type { ClipSplitInput, ClipSplitResult } from './split-clips';
