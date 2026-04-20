/**
 * Cross-play jersey ↔ role consistency check.
 *
 * Same opponent jersey is always the same player. #88 doesn't flip
 * between WR and CB play-to-play (barring two-way players, which are
 * rare and known to the coach anyway). When the pipeline assigns
 * different roles to the same jersey across plays, at least one is
 * wrong — either the jersey OCR mis-read, the role inference mis-fired,
 * or two different players both got OCR'd as the same number.
 *
 * Rather than fight over which failure mode caused it, this pass applies
 * simple majority voting:
 *   1. Collect every (jersey, role) occurrence across matchups.
 *   2. For each jersey, find the role it shows up in most often.
 *   3. If the majority is clearly dominant (≥60% of occurrences), treat
 *      minority-role matchups as unreliable by zeroing their confidence.
 *      The aggregator's confidence filter then drops them automatically.
 *
 * Conservative: a jersey with a 50/50 split between two roles gets
 * NO dominant role, so both instances stay. Could be a genuine two-way
 * player.
 */

import type { PlayAnalytics } from './track-analytics';

export interface JerseyRoleInconsistency {
  jersey: string;
  dominantRole: string;
  dominantShare: number;
  /** How many matchup instances had a minority role (got their confidence zeroed). */
  instancesReconciled: number;
}

/**
 * For each play's analytics, reconcile any keyMatchup whose
 * offense.jersey or defense.jersey appears with a minority role
 * relative to the global majority. Returns a shallow copy with
 * reconciled matchups, plus a report for telemetry.
 */
export function reconcileMatchupJerseyRoles(
  analyticsPerPlay: Array<PlayAnalytics | null>,
): { analytics: Array<PlayAnalytics | null>; inconsistencies: JerseyRoleInconsistency[] } {
  // 1. Count (jersey, role) co-occurrences across all matchups, weighted
  //    by the matchup's confidence so shaky reads don't dominate the vote.
  const counts = new Map<string, Map<string, number>>();
  for (const a of analyticsPerPlay) {
    if (!a?.keyMatchups) continue;
    for (const m of a.keyMatchups) {
      for (const side of [m.offense, m.defense]) {
        if (!side.jersey) continue;
        const roleMap = counts.get(side.jersey) ?? new Map<string, number>();
        roleMap.set(side.role, (roleMap.get(side.role) ?? 0) + m.confidence);
        counts.set(side.jersey, roleMap);
      }
    }
  }

  // 2. Determine dominant role per jersey (only if dominant ≥60%).
  const dominant = new Map<string, string>();
  const DOMINANCE_THRESHOLD = 0.6;
  for (const [jersey, roleMap] of counts) {
    if (roleMap.size < 2) continue; // no conflict, single role seen

    const total = [...roleMap.values()].reduce((s, v) => s + v, 0);
    let topRole = '';
    let topWeight = 0;
    for (const [role, weight] of roleMap) {
      if (weight > topWeight) {
        topWeight = weight;
        topRole = role;
      }
    }
    if (total > 0 && topWeight / total >= DOMINANCE_THRESHOLD) {
      dominant.set(jersey, topRole);
    }
  }

  if (dominant.size === 0) {
    return { analytics: analyticsPerPlay, inconsistencies: [] };
  }

  // 3. Build the reconciliation report + the cleaned analytics.
  const reconCounts = new Map<string, number>();
  const cleaned = analyticsPerPlay.map((a) => {
    if (!a?.keyMatchups) return a;
    return {
      ...a,
      keyMatchups: a.keyMatchups.map((m) => {
        const offJ = m.offense.jersey;
        const defJ = m.defense.jersey;
        const offBadRole = offJ && dominant.has(offJ) && dominant.get(offJ) !== m.offense.role;
        const defBadRole = defJ && dominant.has(defJ) && dominant.get(defJ) !== m.defense.role;
        if (!offBadRole && !defBadRole) return m;

        // Track which jerseys got reconciled for the report.
        if (offBadRole && offJ) reconCounts.set(offJ, (reconCounts.get(offJ) ?? 0) + 1);
        if (defBadRole && defJ) reconCounts.set(defJ, (reconCounts.get(defJ) ?? 0) + 1);

        // Zero the confidence — aggregator's ≥0.4 filter drops it.
        return { ...m, confidence: 0 };
      }),
    };
  });

  const inconsistencies: JerseyRoleInconsistency[] = [];
  for (const [jersey, role] of dominant) {
    if ((reconCounts.get(jersey) ?? 0) === 0) continue;
    const roleMap = counts.get(jersey);
    if (!roleMap) continue;
    const total = [...roleMap.values()].reduce((s, v) => s + v, 0);
    inconsistencies.push({
      jersey,
      dominantRole: role,
      dominantShare: Number(((roleMap.get(role) ?? 0) / total).toFixed(2)),
      instancesReconciled: reconCounts.get(jersey) ?? 0,
    });
  }

  return { analytics: cleaned, inconsistencies };
}
