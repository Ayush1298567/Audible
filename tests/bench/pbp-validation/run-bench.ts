/**
 * Tier 2 accuracy bench: validate the play-call aggregators on real
 * NFL play-by-play data.
 *
 * Usage: bun run bench:pbp NFL_TEAM_CODE
 *        (default KC — 2023 Chiefs)
 *
 * What this validates:
 *   - computeSituationalTendencies (down × distance pass/run mix)
 *   - aggregateQuarterTendencies  (Q1-Q4 play-calling progression)
 *   - aggregateByPlayType         (basic play-type counts/yards)
 *
 * What this does NOT validate (nflverse PBP doesn't carry these fields):
 *   - Coverage / preSnap rotation / pressure — no defensive-charting columns
 *   - Motion — not labeled in PBP
 *   - Personnel — NGS has it but not in PBP
 *   - Route concept — ditto
 * For those we'd need Big Data Bowl tracking data or PFF charting.
 *
 * The point: when this bench runs on the 2023 Chiefs, the output should
 * reproduce scouting truth about their offense — Andy Reid's Friday-call
 * habits. If it doesn't, the aggregators are buggy or miscalibrated.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  aggregateByPlayType,
  aggregateQuarterTendencies,
  computePlayAnalytics,
  computeSituationalTendencies,
} from '@/lib/cv/track-analytics';

const TEAM = process.argv[2] ?? 'KC';
const CSV_PATH = join(dirname(fileURLToPath(import.meta.url)), 'pbp_2023.csv');

interface PbpRow {
  play_id: string;
  game_id: string;
  week: string;
  posteam: string;
  defteam: string;
  qtr: string;
  down: string;
  ydstogo: string;
  play_type: string;
  yards_gained: string;
  shotgun: string;
  no_huddle: string;
  qb_dropback: string;
  qb_scramble: string;
  qb_kneel: string;
  qb_spike: string;
  run_location: string;
  pass_location: string;
  run_gap: string;
}

// ─── Load + filter ──────────────────────────────────────────

console.log(`\nLoading NFL 2023 PBP data…`);
const raw = readFileSync(CSV_PATH);
const rows = parse(raw, {
  columns: true,
  skip_empty_lines: true,
  relax_column_count: true,
  cast: false,
}) as PbpRow[];

console.log(`  ${rows.length} total plays in season`);

// Filter to TEAM's offense, regular season only, actual plays (skip kicks/punts/etc)
const RELEVANT_PLAY_TYPES = new Set(['run', 'pass']);
const offensePlays = rows.filter(
  (r) =>
    r.posteam === TEAM &&
    RELEVANT_PLAY_TYPES.has(r.play_type) &&
    r.down &&
    r.ydstogo,
);
console.log(`  ${offensePlays.length} ${TEAM} offense plays (run + pass, with down/distance)`);

if (offensePlays.length === 0) {
  console.error(`\n  No plays found for team code ${TEAM}. Valid codes: e.g. KC, SF, PHI, BAL, BUF…`);
  process.exit(1);
}

// ─── Transform to aggregator input ──────────────────────────

const toNum = (s: string): number => Number(s) || 0;

const situationalInput = offensePlays.map((r) => ({
  down: toNum(r.down),
  distance: toNum(r.ydstogo),
  // Map PBP play_type to our vocabulary. nflverse uses lowercase "pass"/"run"
  // with qb_scramble as a modifier; our aggregator's regex accepts "Pass"/"Run".
  playType:
    r.qb_scramble === '1' ? 'QB Run'
    : r.play_type === 'pass' ? 'Pass'
    : r.play_type === 'run' ? 'Run'
    : r.play_type,
  gainLoss: toNum(r.yards_gained),
}));

const quarterInput = offensePlays.map((r) => ({
  quarter: toNum(r.qtr),
  playType: situationalInput.find((_, i) => i === offensePlays.indexOf(r))?.playType ?? r.play_type,
  gainLoss: toNum(r.yards_gained),
}));

// Synthetic PlayAnalytics wrapper for the by-play-type aggregator
const perPlayAnalytics = offensePlays.map((r) => ({
  playType:
    r.qb_scramble === '1' ? 'QB Run'
    : r.play_type === 'pass' ? 'Pass'
    : 'Run',
  analytics: computePlayAnalytics([]) as ReturnType<typeof computePlayAnalytics> | null,
}));

// ─── Run aggregators ────────────────────────────────────────

const situations = computeSituationalTendencies(situationalInput);
const quarters = aggregateQuarterTendencies(quarterInput);
const byType = aggregateByPlayType(perPlayAnalytics);

// ─── Print scouting report ──────────────────────────────────

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  Pipeline output: scouting report for ${TEAM} OFFENSE (2023)`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

console.log(`\nBY PLAY TYPE:`);
for (const t of byType.byPlayType) {
  const pct = Math.round((t.count / byType.totalTrackedPlays) * 100);
  console.log(`  ${t.playType.padEnd(10)} ${t.count} plays (${pct}%)`);
}

console.log(`\nBY QUARTER:`);
for (const q of quarters) {
  console.log(
    `  Q${q.quarter} (n=${q.count}): ${q.passPct}% pass / ${q.runPct}% run, ` +
      `avg ${q.avgYardsGained}yd, explosive ${q.explosivePct}%`,
  );
}

console.log(`\nBY SITUATION:`);
for (const s of situations) {
  console.log(
    `  ${s.situation.padEnd(18)} (n=${String(s.count).padStart(3)}): ` +
      `${String(s.passPct).padStart(3)}% pass / ${String(s.runPct).padStart(3)}% run, ` +
      `avg ${s.avgYardsGained.toFixed(1).padStart(5)}yd`,
  );
}

// ─── Sanity checks against known 2023 scouting truth ────────
console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`  Sanity checks (scouting-truth comparisons)`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

const thirdLong = situations.find((s) => s.situation === '3rd & long');
const thirdShort = situations.find((s) => s.situation === '3rd & short');
// computeSituationalTendencies emits "1st & long" for the 7-10yd bucket.
// (The "1st & 10 / base" label comes from the CALL SHEET bucketizer in
// src/lib/scouting/call-sheet.ts, which is a downstream aggregation
// applied to the narrative situation strings Claude emits — not to the
// aggregator outputs directly.)
const firstBase = situations.find((s) => s.situation === '1st & long');
const issues: string[] = [];
const ticks: string[] = [];

// 1. 3rd & long should be pass-heavy across the whole league (≥70%)
if (thirdLong) {
  if (thirdLong.passPct >= 70) {
    ticks.push(`✓ 3rd & long is ${thirdLong.passPct}% pass (scouting truth: ≥70% for every NFL team)`);
  } else {
    issues.push(
      `✗ 3rd & long only ${thirdLong.passPct}% pass — unusually balanced. Worth sanity-checking.`,
    );
  }
} else {
  issues.push(`✗ No 3rd & long bucket — aggregator filtered too aggressively?`);
}

// 2. 3rd & short should be run-heavy (≥50% run for most teams)
if (thirdShort) {
  if (thirdShort.runPct >= 40) {
    ticks.push(`✓ 3rd & short is ${thirdShort.runPct}% run (expected ≥40% on run-balanced teams)`);
  } else {
    issues.push(`✗ 3rd & short only ${thirdShort.runPct}% run — unusually pass-heavy.`);
  }
}

// 3. 1st & 10 should be between 40-60% run/pass across the league
if (firstBase) {
  if (firstBase.passPct >= 35 && firstBase.passPct <= 70) {
    ticks.push(`✓ 1st & 10 has a balanced ${firstBase.passPct}% pass / ${firstBase.runPct}% run split`);
  } else {
    issues.push(`⚠ 1st & 10 tilt ${firstBase.passPct}%/${firstBase.runPct}% is at a league extreme.`);
  }
}

// 4. Late-game pass tilt — Q4 should have more passing than Q1 (trailing / 2-min drills)
const q1 = quarters.find((q) => q.quarter === 1);
const q4 = quarters.find((q) => q.quarter === 4);
if (q1 && q4) {
  if (q4.passPct > q1.passPct) {
    ticks.push(
      `✓ Q4 pass rate (${q4.passPct}%) > Q1 (${q1.passPct}%) — scouting truth: teams pass more late`,
    );
  } else if (q4.passPct < q1.passPct - 10) {
    issues.push(
      `⚠ Q4 pass rate LOWER than Q1 by >10% — unusual for NFL (sometimes true for dominant running teams sitting on a lead)`,
    );
  } else {
    ticks.push(`○ Q1 (${q1.passPct}%) ≈ Q4 (${q4.passPct}%) pass rate — team likely balanced throughout`);
  }
}

// 5. Plays per week sanity — NFL teams average ~65 plays/game × ~17 games = ~1100
const gamesTeamAppearsIn = new Set(offensePlays.map((r) => r.game_id)).size;
const avgPerGame = offensePlays.length / Math.max(1, gamesTeamAppearsIn);
if (avgPerGame >= 40 && avgPerGame <= 80) {
  ticks.push(`✓ ${avgPerGame.toFixed(1)} offensive plays/game (scouting truth: NFL teams 40-75/game)`);
} else {
  issues.push(`✗ ${avgPerGame.toFixed(1)} plays/game is outside the normal NFL range (40-80)`);
}

for (const t of ticks) console.log(t);
for (const i of issues) console.log(i);

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(
  `  Score: ${ticks.filter((t) => t.startsWith('✓')).length}/${ticks.length + issues.length} invariants passed`,
);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
