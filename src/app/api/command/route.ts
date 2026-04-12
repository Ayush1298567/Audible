/**
 * POST /api/command — command bar endpoint.
 *
 * Accepts: { query: string, programId: string }
 * Passes the query to an LLM with the command bar tools, lets it
 * decide which tool to call, executes the tool, and returns the
 * result. The LLM never sees raw data — it only sees tool schemas
 * and decides which one to call based on the natural language query.
 *
 * Uses AI SDK v6: generateText with tools, routed through AI Gateway.
 */

import { generateText, gateway, stepCountIs } from 'ai';
import { beginSpan } from '@/lib/observability/log';
import { buildCommandBarTools } from '@/lib/command-bar/tools';
import { z } from 'zod';

export const maxDuration = 30;

// Use Haiku for command bar parsing — fast and cheap (PLAN.md §6)
const COMMAND_BAR_MODEL = 'anthropic/claude-haiku-4.5';

const requestSchema = z.object({
  query: z.string().min(1).max(500),
  programId: z.string().uuid(),
});

const SYSTEM_PROMPT = `You are Audible's command bar assistant for football coaches. You help coaches find plays, compute tendencies, look up player alignments, and get stats from their film data.

When a coach types a query, decide which tool to call based on what they're asking for:

- "Show me" / "Find" / "What plays" → use searchPlays
- "How often" / "What percentage" / "What rate" / tendency questions → use computeTendency
- "What's their corner doing" / cushion / depth / alignment questions → use getPlayerAlignments
- "What's our completion rate" / stats questions → use getStats

Football terminology you understand:
- Coverages: Cover 0, Cover 1, Cover 2, Cover 3, Cover 4, Quarters, Man Free, Man Under
- Fronts: 4-3, 3-4, Nickel, Dime, Bear, Okie
- Personnel: 11 (1RB 1TE), 12 (1RB 2TE), 21 (2RB 1TE), 22 (2RB 2TE), 10 (1RB 0TE)
- Concepts: Zone, Power, Counter, Trap, Draw, Mesh, Levels, Flood, Smash, Four Verts
- Situations: "3rd and short" = 3rd down, 1-3 yards. "Red zone" = inside the 20.
- Positions: QB, RB, WR, TE, OL, DL, LB, CB, S, FS, SS, NB

Always call a tool. Never answer from memory. The data is in the database.`;

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/command' }, req);

  try {
    const body = await req.json();
    const { query, programId } = requestSchema.parse(body);

    const tools = buildCommandBarTools(programId);

    const result = await generateText({
      model: gateway(COMMAND_BAR_MODEL),
      system: SYSTEM_PROMPT,
      prompt: query,
      tools,
      stopWhen: stepCountIs(3),
    });

    // Extract tool results from the response
    const toolResults = result.steps
      .flatMap((step) => step.toolResults)
      .filter(Boolean);

    const toolCalls = result.steps
      .flatMap((step) => step.toolCalls)
      .filter(Boolean);

    span.done({
      query,
      toolCallCount: toolCalls.length,
      model: COMMAND_BAR_MODEL,
    });

    return Response.json({
      text: result.text,
      toolResults,
      toolCalls: toolCalls.map((tc) => ({
        name: tc.toolName,
        input: tc.input,
      })),
    });
  } catch (error) {
    span.fail(error);

    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Invalid request', details: error.issues }, { status: 400 });
    }

    return Response.json({ error: 'Command failed' }, { status: 500 });
  }
}
