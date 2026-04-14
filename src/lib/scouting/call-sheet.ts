/**
 * Derive the Friday call sheet from a walkthrough's structured
 * recommendations. Pure, side-effect-free — lives here so tests can
 * import it without dragging in the DB client.
 */

import type { CallSheet, Walkthrough } from './insights';

/**
 * Render the call sheet as plain text the coach can paste into a doc,
 * text message, or printable page. Intentionally terse — sideline
 * cards are scanned, not read.
 */
export function renderCallSheetAsText(
  walkthrough: { opponentName: string; callSheet?: CallSheet },
): string {
  const sheet = walkthrough.callSheet;
  if (!sheet || sheet.buckets.length === 0) {
    return `CALL SHEET — ${walkthrough.opponentName}\n\n(no recommendations)`;
  }
  const lines: string[] = [
    `CALL SHEET — ${walkthrough.opponentName}`,
    '',
  ];
  for (const bucket of sheet.buckets) {
    lines.push(`── ${bucket.bucket.toUpperCase()} ──`);
    for (const rec of bucket.recommendations) {
      lines.push(`  • ${rec.call}`);
      lines.push(`    ${rec.rationale}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

/**
 * Normalize a free-form situation string into a coarse bucket label so
 * "3rd & long vs Cover 3" and "3rd & 8" land in the same "3rd & long"
 * group. Falls back to the raw situation when no pattern matches.
 */
export function bucketizeSituation(raw: string): string {
  const s = raw.toLowerCase();
  // Down & distance matchers
  if (/\b3rd\b.*\b(long|xl|\d{2,})\b/.test(s) || /3rd\s*&\s*(7|8|9|10|11|12|13|14|15)/.test(s))
    return '3rd & long';
  if (/\b3rd\b.*\b(short)\b/.test(s) || /3rd\s*&\s*[1-3]\b/.test(s)) return '3rd & short';
  if (/\b3rd\b.*\b(medium|med)\b/.test(s) || /3rd\s*&\s*[4-6]\b/.test(s)) return '3rd & medium';
  if (/\b4th\b/.test(s)) return '4th down';
  if (/\bred zone\b|\b\d{1,2}[-\s]*yard line\b|\bgoal line\b/.test(s)) return 'red zone';
  if (/\b2.minute\b|\btwo.minute\b/.test(s)) return '2-minute drill';
  if (/\bmotion\b/.test(s)) return 'after motion';
  if (/\b1st\b.*\b10\b|\b1st & 10\b|\bbase down\b|\bnormal down\b/.test(s)) return '1st & 10 / base';
  if (/\b2nd\b/.test(s)) return '2nd down';
  if (/\b1st\b/.test(s)) return '1st down';
  // Fall back to capitalized raw situation (trimmed to reasonable length)
  return raw.length > 40 ? `${raw.slice(0, 37)}...` : raw;
}

/**
 * Bucket every structured recommendation across insights into a single
 * cheat-card view. Bucket key is derived from the recommendation's
 * `situation` field — we normalize common situations (3rd & long,
 * red zone, base down, after motion, etc.) so multiple insights that
 * attack the same situation merge into one section.
 */
export function buildCallSheet(insights: Walkthrough['insights']): CallSheet {
  type Recs = CallSheet['buckets'][number]['recommendations'];
  const byBucket = new Map<string, Recs>();

  for (const insight of insights) {
    for (const rec of insight.recommendations) {
      const bucket = bucketizeSituation(rec.situation);
      const existing = byBucket.get(bucket) ?? [];
      existing.push({
        insightHeadline: insight.headline,
        insightId: insight.id,
        call: rec.call,
        rationale: rec.rationale,
      });
      byBucket.set(bucket, existing);
    }
  }

  // Sort buckets by priority — money downs first, then red zone, then base.
  const priority = (name: string): number => {
    if (/3rd|4th/i.test(name)) return 0;
    if (/red zone|goal line/i.test(name)) return 1;
    if (/2-minute|2 minute|two.minute/i.test(name)) return 2;
    if (/motion/i.test(name)) return 3;
    if (/1st|2nd|base/i.test(name)) return 4;
    return 5;
  };
  const buckets = [...byBucket.entries()]
    .map(([bucket, recommendations]) => ({ bucket, recommendations }))
    .sort((a, b) => priority(a.bucket) - priority(b.bucket) || a.bucket.localeCompare(b.bucket));

  return { buckets };
}
