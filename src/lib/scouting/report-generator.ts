/**
 * Scouting Report Generator — AI-written, football-specific analysis.
 *
 * Reads from the tendency engine, formats data for the LLM, and
 * produces a structured document that reads like a D1 quality
 * control report. Every claim links to play IDs for film evidence.
 *
 * The LLM writes the analysis. The tendency data comes from SQL.
 * The LLM never invents statistics — it interprets real numbers.
 */

import { generateText, Output, gateway } from 'ai';
import { z } from 'zod';
import {
  getFormationFrequency,
  getPlayTypeDistribution,
  getPlayDirectionTendency,
  getPersonnelFrequency,
  getSuccessRateByPlayType,
  getSituationBreakdown,
  type TendencyBreakdown,
} from '@/lib/tendencies/queries';
import { log } from '@/lib/observability/log';

const REPORT_MODEL = 'anthropic/claude-sonnet-4.6';

// ─── Report schema ──────────────────────────────────────────────

const reportSectionSchema = z.object({
  title: z.string(),
  content: z.string().min(20),
  keyStats: z.array(z.object({
    stat: z.string(),
    value: z.string(),
    playIds: z.array(z.string()).optional(),
  })).optional(),
});

const scoutingReportSchema = z.object({
  summary: z.string().min(50).max(500),
  offensiveIdentity: reportSectionSchema,
  runGame: reportSectionSchema,
  passGame: reportSectionSchema,
  situational: reportSectionSchema,
  redZone: reportSectionSchema,
  keyTakeaways: z.array(z.string().min(10).max(200)).min(3).max(8),
  suggestedGamePlanFocus: z.array(z.string().min(10).max(200)).min(2).max(5),
});

export type ScoutingReport = z.infer<typeof scoutingReportSchema>;
export type ReportSection = z.infer<typeof reportSectionSchema>;

// ─── Generate report ────────────────────────────────────────────

export async function generateScoutingReport(
  programId: string,
  opponentId: string,
  opponentName: string,
): Promise<ScoutingReport> {
  // 1. Gather all tendency data in parallel
  const filter = { opponentId };

  const [formation, playType, direction, personnel, success, situations] = await Promise.all([
    getFormationFrequency(programId, filter),
    getPlayTypeDistribution(programId, filter),
    getPlayDirectionTendency(programId, filter),
    getPersonnelFrequency(programId, filter),
    getSuccessRateByPlayType(programId, filter),
    getSituationBreakdown(programId, opponentId),
  ]);

  const totalPlays = formation.sampleSize;
  if (totalPlays === 0) {
    throw new Error('No film data available for this opponent');
  }

  // 2. Format tendency data for the LLM
  const tendencyContext = formatTendencyData({
    formation,
    playType,
    direction,
    personnel,
    success,
    situations,
  });

  // 3. Generate the report
  const { output } = await generateText({
    model: gateway(REPORT_MODEL),
    output: Output.object({ schema: scoutingReportSchema }),
    system: SYSTEM_PROMPT,
    prompt: `Generate a scouting report for ${opponentName}.\n\nTotal plays analyzed: ${totalPlays}\nConfidence: ${formation.confidence}\n\n${tendencyContext}`,
  });

  if (!output) {
    throw new Error('Report generation produced no output');
  }

  log.info('scouting_report_generated', {
    opponentId,
    opponentName,
    totalPlays,
    sections: Object.keys(output).length,
  });

  return output;
}

// ─── Formatting ─────────────────────────────────────────────────

function formatTendencyData(data: {
  formation: TendencyBreakdown;
  playType: TendencyBreakdown;
  direction: TendencyBreakdown;
  personnel: TendencyBreakdown;
  success: TendencyBreakdown;
  situations: TendencyBreakdown[];
}): string {
  const sections: string[] = [];

  sections.push(formatBreakdown('FORMATION FREQUENCY', data.formation));
  sections.push(formatBreakdown('PLAY TYPE DISTRIBUTION', data.playType));
  sections.push(formatBreakdown('PLAY DIRECTION', data.direction));
  sections.push(formatBreakdown('PERSONNEL GROUPINGS', data.personnel));
  sections.push(formatBreakdown('SUCCESS RATE BY PLAY TYPE', data.success));

  if (data.situations.length > 0) {
    sections.push('=== SITUATION BREAKDOWN ===');
    for (const sit of data.situations) {
      sections.push(formatBreakdown(sit.situation, sit));
    }
  }

  return sections.join('\n\n');
}

function formatBreakdown(title: string, breakdown: TendencyBreakdown): string {
  const lines = [`--- ${title} (${breakdown.sampleSize} plays, ${breakdown.confidence} confidence) ---`];

  for (const t of breakdown.tendencies.slice(0, 10)) {
    const pct = Math.round(t.rate * 100);
    lines.push(`  ${t.label}: ${pct}% (${t.count}/${t.total}) [${t.playIds.length} clips]`);
  }

  return lines.join('\n');
}

// ─── System prompt ──────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a football quality control analyst writing a scouting report.

RULES:
1. Write like a D1 quality control coordinator. Direct, specific, actionable.
2. Every claim must be backed by the data provided. Never invent statistics.
3. Use football terminology: formations, personnel packages, concepts, not generic language.
4. Focus on TENDENCIES — what they do most often in each situation, and what they avoid.
5. Highlight predictability. If they run 75%+ of the time in a situation, that's exploitable.
6. Note personnel tips — formation/personnel combos that telegraph run vs pass.
7. Keep each section 3-5 paragraphs. Concise but complete.
8. The "Key Takeaways" should be the 3-5 most important things a coach needs to know before game day.
9. "Suggested Game Plan Focus" should be specific, actionable adjustments.

Write in second person: "They run inside zone 62% of the time from 21 personnel."
Never use: "based on the data", "analysis shows", or academic hedging language.
Sound like a coach talking to coaches.`;
