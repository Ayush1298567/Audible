/**
 * Play Suggester — AI-powered play recommendations for each situation.
 *
 * Given a situation (e.g., "3rd & medium") and opponent tendency data,
 * the suggester:
 *   1. Queries the tendency engine for the opponent's defensive patterns
 *   2. Queries the coach's playbook for available plays in that situation
 *   3. Sends both to the LLM with a reasoning prompt
 *   4. Returns ranked play recommendations with plain-English rationale
 *
 * The LLM's job is to match the coach's plays against the opponent's
 * tendencies and explain WHY each play is good for that situation.
 * The actual tendency data is computed by SQL (Phase 4), not the LLM.
 *
 * See PLAN.md §6.8 (The Board — Play Suggester).
 */

import { generateText, Output, gateway } from 'ai';
import { z } from 'zod';
import { withProgramContext } from '@/lib/db/client';
import { playbookPlays } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  getPlayTypeDistribution,
  getFormationFrequency,
} from '@/lib/tendencies/queries';
import { log } from '@/lib/observability/log';

const SUGGESTER_MODEL = 'anthropic/claude-sonnet-4.6';

const suggestionSchema = z.object({
  suggestions: z.array(z.object({
    playName: z.string(),
    formation: z.string(),
    confidence: z.enum(['high', 'medium', 'low']),
    reasoning: z.string().min(20).max(300),
    attacksTendency: z.string().max(200),
  })).min(1).max(5),
});

export type PlaySuggestion = z.infer<typeof suggestionSchema>['suggestions'][number];

export interface SuggesterInput {
  programId: string;
  opponentId: string;
  situation: string;
  down?: number;
  distanceBucket?: string;
}

export async function suggestPlays(input: SuggesterInput): Promise<PlaySuggestion[]> {
  // 1. Get opponent tendencies for this situation
  const filter = {
    opponentId: input.opponentId,
    down: input.down,
    distanceBucket: input.distanceBucket,
  };

  const [playTypeTendency, formationTendency] = await Promise.all([
    getPlayTypeDistribution(input.programId, filter),
    getFormationFrequency(input.programId, filter),
  ]);

  // 2. Get the coach's playbook
  const playbook = await withProgramContext(input.programId, async (tx) =>
    tx.select().from(playbookPlays).where(eq(playbookPlays.programId, input.programId)),
  );

  if (playbook.length === 0) {
    log.info('suggester_no_playbook', { programId: input.programId });
    return [];
  }

  // 3. Build the prompt with real tendency data
  const tendencyContext = [
    `Situation: ${input.situation}`,
    `Sample size: ${playTypeTendency.sampleSize} plays (${playTypeTendency.confidence} confidence)`,
    '',
    'Opponent play type tendencies:',
    ...playTypeTendency.tendencies.map((t) =>
      `  ${t.label}: ${Math.round(t.rate * 100)}% (${t.count} plays)`,
    ),
    '',
    'Opponent formation tendencies:',
    ...formationTendency.tendencies.slice(0, 5).map((t) =>
      `  ${t.label}: ${Math.round(t.rate * 100)}% (${t.count} plays)`,
    ),
  ].join('\n');

  const playbookContext = playbook
    .map((p) => `- ${p.name} (${p.formation}, ${p.playType})`)
    .join('\n');

  // 4. Ask the LLM to recommend plays
  const { output } = await generateText({
    model: gateway(SUGGESTER_MODEL),
    system: `You are a football offensive coordinator assistant. Given opponent defensive tendencies and the coach's playbook, recommend the best plays for the given situation.

For each recommendation, explain WHY this play attacks the opponent's specific tendencies. Reference the actual numbers from the tendency data. Be specific about what defensive behavior the play exploits.

Only suggest plays from the coach's playbook — never invent plays they don't have.`,
    prompt: `${tendencyContext}\n\nCoach's playbook:\n${playbookContext}\n\nRecommend the top 3-5 plays from this playbook for this situation against these tendencies.`,
    output: Output.object({ schema: suggestionSchema }),
  });

  return output?.suggestions ?? [];
}
