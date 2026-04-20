/**
 * Central model policy for cost/quality trade-offs.
 *
 * High-frequency parsing paths stay on cheaper models; high-stakes football
 * reasoning (walkthroughs) stays on stronger models.
 */

export const AI_MODELS = {
  commandBar: 'anthropic/claude-haiku-4.5',
  scoutingWalkthrough: 'anthropic/claude-sonnet-4.6',
  practiceScript: 'anthropic/claude-sonnet-4.6',
  cvAnthropic: 'anthropic/claude-sonnet-4.6',
  cvOpenAI: 'openai/gpt-5',
} as const;

export type ModelPolicyKey = keyof typeof AI_MODELS;

export function getModel(key: ModelPolicyKey): string {
  return AI_MODELS[key];
}
