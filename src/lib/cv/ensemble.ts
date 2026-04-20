/**
 * Vision ensemble — sends frames to two LLMs and votes on the result.
 *
 * Core mechanism (PLAN.md §5.3):
 *   1. Send frame(s) + prompt to Claude Sonnet 4.6 via AI Gateway
 *   2. Send same frame(s) + prompt to GPT-5 via AI Gateway
 *   3. If both agree AND both ≥ confidence threshold → accept
 *   4. If disagree or low confidence → discard, log to eval_bench
 *
 * Uses AI SDK v6 patterns: generateText + Output.object (not generateObject).
 * Routes through Vercel AI Gateway for auth, failover, and cost tracking.
 */

import { generateText, Output, gateway } from 'ai';
import { createHash } from 'node:crypto';
import type { ZodType } from 'zod';
import { log } from '@/lib/observability/log';
import { getCvThreshold, requiresDualModelAgreement } from './thresholds';
import { getCached, setCached } from '@/lib/ai/runtime-cache';
import { getModel } from '@/lib/ai/model-policy';

// Model IDs via AI Gateway (provider/model format)
const ANTHROPIC_MODEL = getModel('cvAnthropic');
const OPENAI_MODEL = getModel('cvOpenAI');
const ENSEMBLE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export interface EnsembleInput {
  taskName: string;
  systemPrompt: string;
  frames: Array<{
    type: string;
    base64: string;
  }>;
  schema: ZodType;
  context?: string;
}

export interface EnsembleResult<T> {
  agreed: boolean;
  accepted: boolean;
  value: T | null;
  anthropicValue: T | null;
  openaiValue: T | null;
  anthropicConfidence: number;
  openaiConfidence: number;
  ensembleConfidence: number;
  reason: 'accepted' | 'disagreement' | 'below_threshold' | 'single_model_blocked' | 'error';
}

/**
 * Run the ensemble voting pipeline on a set of frames.
 *
 * Calls both models in parallel via AI Gateway, compares results,
 * and returns the consensus value (or null if they disagree).
 */
export async function runEnsemble<T extends { confidence: number }>(
  input: EnsembleInput,
): Promise<EnsembleResult<T>> {
  const threshold = getCvThreshold(input.taskName);
  const cacheKey = buildEnsembleCacheKey(input);
  const cached = getCached<EnsembleResult<T>>(cacheKey);

  if (cached) {
    log.info('ensemble_cache_hit', {
      taskName: input.taskName,
      threshold,
      frameCount: input.frames.length,
    });
    return cached;
  }

  const imageContent = input.frames.map((frame) => ({
    type: 'image' as const,
    image: `data:image/png;base64,${frame.base64}`,
  }));

  const textContent = {
    type: 'text' as const,
    text: input.context
      ? `Analyze these ${input.frames.length} frame(s). ${input.context}`
      : `Analyze these ${input.frames.length} frame(s) from a football play.`,
  };

  const messages = [
    {
      role: 'user' as const,
      content: [...imageContent, textContent],
    },
  ];

  log.info('ensemble_inference_start', {
    taskName: input.taskName,
    threshold,
    frameCount: input.frames.length,
    dualModelRequired: requiresDualModelAgreement(input.taskName),
    anthropicModel: ANTHROPIC_MODEL,
    openaiModel: OPENAI_MODEL,
  });

  // Run both models in parallel via AI Gateway
  const [anthropicResult, openaiResult] = await Promise.allSettled([
    generateText({
      model: gateway(ANTHROPIC_MODEL),
      system: input.systemPrompt,
      messages,
      output: Output.object({ schema: input.schema }),
    }),
    generateText({
      model: gateway(OPENAI_MODEL),
      system: input.systemPrompt,
      messages,
      output: Output.object({ schema: input.schema }),
    }),
  ]);

  // Extract values from the output field (AI SDK v6 pattern)
  const anthropicValue = anthropicResult.status === 'fulfilled'
    ? (anthropicResult.value.output as T | null)
    : null;
  const openaiValue = openaiResult.status === 'fulfilled'
    ? (openaiResult.value.output as T | null)
    : null;

  if (anthropicResult.status === 'rejected') {
    log.warn('ensemble_anthropic_failed', {
      taskName: input.taskName,
      error: String(anthropicResult.reason),
    });
  }
  if (openaiResult.status === 'rejected') {
    log.warn('ensemble_openai_failed', {
      taskName: input.taskName,
      error: String(openaiResult.reason),
    });
  }

  // Both failed
  if (!anthropicValue && !openaiValue) {
    const result: EnsembleResult<T> = {
      agreed: false,
      accepted: false,
      value: null,
      anthropicValue: null,
      openaiValue: null,
      anthropicConfidence: 0,
      openaiConfidence: 0,
      ensembleConfidence: 0,
      reason: 'error',
    };
    setCached(cacheKey, result, ENSEMBLE_CACHE_TTL_MS);
    return result;
  }

  const anthropicConf = anthropicValue?.confidence ?? 0;
  const openaiConf = openaiValue?.confidence ?? 0;
  const avgConfidence = (anthropicConf + openaiConf) / 2;

  // Single model responded — use it but penalize confidence
  if (!anthropicValue || !openaiValue) {
    const singleValue = anthropicValue ?? openaiValue;
    const singleConf = anthropicConf || openaiConf;
    const singleBlocked = requiresDualModelAgreement(input.taskName);
    const accepted = !singleBlocked && singleConf >= threshold;

    const result: EnsembleResult<T> = {
      agreed: false,
      accepted,
      value: accepted ? singleValue : null,
      anthropicValue,
      openaiValue,
      anthropicConfidence: anthropicConf,
      openaiConfidence: openaiConf,
      ensembleConfidence: singleConf * 0.8,
      reason: accepted ? 'accepted' : singleBlocked ? 'single_model_blocked' : 'below_threshold',
    };
    setCached(cacheKey, result, ENSEMBLE_CACHE_TTL_MS);
    return result;
  }

  // Both responded — check agreement
  const agreed = checkAgreement(input.taskName, anthropicValue, openaiValue);
  const accepted = agreed && avgConfidence >= threshold;

  const result: EnsembleResult<T> = {
    agreed,
    accepted,
    value: accepted ? anthropicValue : null,
    anthropicValue,
    openaiValue,
    anthropicConfidence: anthropicConf,
    openaiConfidence: openaiConf,
    ensembleConfidence: agreed ? avgConfidence : avgConfidence * 0.5,
    reason: accepted ? 'accepted' : agreed ? 'below_threshold' : 'disagreement',
  };
  setCached(cacheKey, result, ENSEMBLE_CACHE_TTL_MS);
  return result;
}

/**
 * Check if two model outputs agree on the key classification field.
 */
export function checkAgreement<T>(taskName: string, a: T, b: T): boolean {
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;

  switch (taskName) {
    case 'coverage_shell':
      return aObj.coverage === bObj.coverage;
    case 'pressure':
      return aObj.type === bObj.type;
    case 'blocking_scheme':
      return aObj.scheme === bObj.scheme;
    case 'route_concept':
      return aObj.concept === bObj.concept;
    case 'run_gap':
      return aObj.gap === bObj.gap;
    case 'player_positions':
      return Math.abs(
        (aObj.playerCount as number) - (bObj.playerCount as number),
      ) <= 3;
    case 'coverage_disguise':
      return aObj.disguised === bObj.disguised;
    case 'alignment_depth': {
      const cbA = aObj.cbCushionYards as number;
      const cbB = bObj.cbCushionYards as number;
      const sA = aObj.safetyDepthYards as number;
      const sB = bObj.safetyDepthYards as number;
      return Math.abs(cbA - cbB) <= 1.5 && Math.abs(sA - sB) <= 2.5;
    }
    default:
      for (const key of Object.keys(aObj)) {
        if (key === 'confidence' || key === 'reasoning') continue;
        return aObj[key] === bObj[key];
      }
      return false;
  }
}

function buildEnsembleCacheKey(input: EnsembleInput): string {
  const hash = createHash('sha1');
  hash.update(input.taskName);
  hash.update(input.context ?? '');
  hash.update(input.systemPrompt);
  for (const frame of input.frames) {
    hash.update(frame.type);
    hash.update(frame.base64);
  }
  return `ensemble:${hash.digest('hex')}`;
}
