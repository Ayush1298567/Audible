/**
 * Active prompt IDs for versioned CV + LLM prompts (PLAN.md §5.4).
 *
 * Prompts are global (not per-program). Each task name has at most one row
 * with is_active = true. Callers resolve IDs once per request/worker.
 */

import { and, eq } from 'drizzle-orm';
import { withGlobalContext } from '@/lib/db/client';
import { prompts } from '@/lib/db/schema';
import { getModel } from '@/lib/ai/model-policy';
import {
  COVERAGE_SHELL_SYSTEM_PROMPT_V1,
  COVERAGE_SHELL_PROMPT_NAME,
  PRESSURE_SYSTEM_PROMPT_V1,
  PRESSURE_PROMPT_NAME,
  BLOCKING_SCHEME_SYSTEM_PROMPT_V1,
  BLOCKING_SCHEME_PROMPT_NAME,
  ROUTE_CONCEPT_SYSTEM_PROMPT_V1,
  ROUTE_CONCEPT_PROMPT_NAME,
  RUN_GAP_SYSTEM_PROMPT_V1,
  RUN_GAP_PROMPT_NAME,
  PLAYER_POSITIONS_SYSTEM_PROMPT_V1,
  PLAYER_POSITIONS_PROMPT_NAME,
  COVERAGE_DISGUISE_SYSTEM_PROMPT_V1,
  COVERAGE_DISGUISE_PROMPT_NAME,
  ALIGNMENT_DEPTH_SYSTEM_PROMPT_V1,
  ALIGNMENT_DEPTH_PROMPT_NAME,
} from '@/lib/ai/schemas';

export type PromptTaskName =
  | 'coverage_shell'
  | 'pressure'
  | 'blocking_scheme'
  | 'route_concept'
  | 'run_gap'
  | 'player_positions'
  | 'coverage_disguise'
  | 'alignment_depth';

let cached: { map: Map<PromptTaskName, string>; loadedAt: number } | null = null;
const CACHE_MS = 60_000;

let seedPromise: Promise<void> | null = null;

const DEFAULT_USER_TEMPLATE = '{{frames}}';

const SEED_ROWS: Array<{
  name: PromptTaskName;
  version: number;
  systemPrompt: string;
}> = [
  { name: COVERAGE_SHELL_PROMPT_NAME, version: 1, systemPrompt: COVERAGE_SHELL_SYSTEM_PROMPT_V1 },
  { name: PRESSURE_PROMPT_NAME, version: 1, systemPrompt: PRESSURE_SYSTEM_PROMPT_V1 },
  { name: BLOCKING_SCHEME_PROMPT_NAME, version: 1, systemPrompt: BLOCKING_SCHEME_SYSTEM_PROMPT_V1 },
  { name: ROUTE_CONCEPT_PROMPT_NAME, version: 1, systemPrompt: ROUTE_CONCEPT_SYSTEM_PROMPT_V1 },
  { name: RUN_GAP_PROMPT_NAME, version: 1, systemPrompt: RUN_GAP_SYSTEM_PROMPT_V1 },
  { name: PLAYER_POSITIONS_PROMPT_NAME, version: 1, systemPrompt: PLAYER_POSITIONS_SYSTEM_PROMPT_V1 },
  { name: COVERAGE_DISGUISE_PROMPT_NAME, version: 1, systemPrompt: COVERAGE_DISGUISE_SYSTEM_PROMPT_V1 },
  { name: ALIGNMENT_DEPTH_PROMPT_NAME, version: 1, systemPrompt: ALIGNMENT_DEPTH_SYSTEM_PROMPT_V1 },
];

/**
 * Inserts default active prompt rows when none exist (first deploy / empty DB).
 */
export async function ensureCvPromptsSeeded(): Promise<void> {
  const modelId = getModel('cvAnthropic');

  await withGlobalContext(async (tx) => {
    for (const row of SEED_ROWS) {
      const existing = await tx
        .select({ id: prompts.id })
        .from(prompts)
        .where(and(eq(prompts.name, row.name), eq(prompts.isActive, true)))
        .limit(1);
      if (existing[0]) continue;

      await tx.insert(prompts).values({
        name: row.name,
        version: row.version,
        isActive: true,
        systemPrompt: row.systemPrompt,
        userPromptTemplate: DEFAULT_USER_TEMPLATE,
        modelId,
      });
    }
  });
}

async function ensureCvPromptsSeededOnce(): Promise<void> {
  if (!seedPromise) {
    seedPromise = ensureCvPromptsSeeded().finally(() => {
      seedPromise = null;
    });
  }
  await seedPromise;
}

export async function getActivePromptId(taskName: PromptTaskName): Promise<string | null> {
  await ensureCvPromptsSeededOnce();

  const now = Date.now();
  if (cached && now - cached.loadedAt < CACHE_MS) {
    return cached.map.get(taskName) ?? null;
  }

  const rows = await withGlobalContext(async (tx) =>
    tx
      .select({ id: prompts.id, name: prompts.name })
      .from(prompts)
      .where(eq(prompts.isActive, true)),
  );

  const map = new Map<PromptTaskName, string>();
  for (const row of rows) {
    map.set(row.name as PromptTaskName, row.id);
  }

  cached = { map, loadedAt: now };
  return map.get(taskName) ?? null;
}

export async function getActivePromptIds(
  names: readonly PromptTaskName[],
): Promise<Partial<Record<PromptTaskName, string>>> {
  const out: Partial<Record<PromptTaskName, string>> = {};
  for (const name of names) {
    const id = await getActivePromptId(name);
    if (id) out[name] = id;
  }
  return out;
}

export function invalidatePromptCache(): void {
  cached = null;
}
