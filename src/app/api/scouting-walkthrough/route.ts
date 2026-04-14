import { beginSpan } from '@/lib/observability/log';
import { withProgramContext } from '@/lib/db/client';
import { plays, games, opponents } from '@/lib/db/schema';
import { generateText, Output, gateway } from 'ai';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import type { Walkthrough, InsightExample } from '@/lib/scouting/insights';

export const maxDuration = 180;

/**
 * POST /api/scouting-walkthrough
 *
 * Given all the analyzed plays for an opponent, ask Claude to surface
 * the 3-5 most exploitable tendencies + pick example clips + craft
 * the narrative that will guide the coach through the walkthrough.
 */

const requestSchema = z.object({
  programId: z.string().uuid(),
  opponentId: z.string().uuid(),
});

// The schema Claude returns. We'll map to the front-end Walkthrough type.
const curatedInsightSchema = z.object({
  headline: z.string().max(60).describe('Short headline in CAPS, max 6 words'),
  narrative: z.string().min(40).max(400).describe('2-3 sentences explaining the tendency'),
  evidence_play_ids: z.array(z.string()).min(1).max(5).describe('Play IDs that best demonstrate this. 1-5 clips.'),
  recommendations: z.array(z.string().min(5).max(120)).min(1).max(4).describe('Concrete plays the coach should call'),
  overlays_per_play: z.record(z.string(), z.array(z.object({
    timestamp: z.number().describe('Seconds from clip start'),
    duration: z.number().optional(),
    type: z.enum(['circle', 'arrow', 'label', 'zone']),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    toX: z.number().min(0).max(1).optional(),
    toY: z.number().min(0).max(1).optional(),
    radius: z.number().min(0).max(1).optional(),
    label: z.string().max(30).optional(),
    color: z.string().optional(),
  }))).describe('Per-play overlays, keyed by play ID'),
});

const responseSchema = z.object({
  summary: z.string().min(40).max(400),
  insights: z.array(curatedInsightSchema).min(1).max(5),
});

const SYSTEM_PROMPT = `You are an expert football quality control coach. Given analyzed
plays from an opponent, identify the 3-5 most EXPLOITABLE tendencies a coach should
attack in this week's game plan.

Rules:
1. Every tendency must be SPECIFIC enough to call a play against. NOT "they run Cover 2" —
   instead "they run Cover 2 on 3rd & long with the free safety widening post-snap".
2. Every tendency needs evidence: at least 3 plays showing the pattern.
3. Recommendations must be concrete play calls the coach would recognize
   ("Run 4 Verts from Trips Right", "Call Mesh with a post over the top").
4. Rank by exploitability — #1 should be the biggest edge.
5. For each evidence play, provide 1-4 visual overlays that highlight the key
   moment(s). Normalized 0-1 coords:
   - Circle around a key player (WR, safety, LB) at a specific timestamp
   - Arrow showing motion or route direction
   - Label callout like "Safety widens" at t=1.2s
   - Zone rectangle over an open area

Be ruthless. Don't pad the list. 3 great insights beat 5 mediocre ones.`;

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/scouting-walkthrough', method: 'POST' }, req);

  try {
    const body = await req.json();
    const input = requestSchema.parse(body);

    // Load opponent info
    const [opp] = await withProgramContext(input.programId, async (tx) =>
      tx.select({ id: opponents.id, name: opponents.name })
        .from(opponents)
        .where(and(eq(opponents.id, input.opponentId), eq(opponents.programId, input.programId))),
    );

    if (!opp) {
      return Response.json({ error: 'Opponent not found' }, { status: 404 });
    }

    // Load all analyzed plays for this opponent
    const allPlays = await withProgramContext(input.programId, async (tx) =>
      tx.select({
        id: plays.id,
        down: plays.down,
        distance: plays.distance,
        quarter: plays.quarter,
        formation: plays.formation,
        playType: plays.playType,
        playDirection: plays.playDirection,
        gainLoss: plays.gainLoss,
        result: plays.result,
        clipBlobKey: plays.clipBlobKey,
        coachOverride: plays.coachOverride,
      })
        .from(plays)
        .innerJoin(games, eq(plays.gameId, games.id))
        .where(and(
          eq(plays.programId, input.programId),
          eq(games.opponentId, input.opponentId),
          eq(plays.status, 'ready'),
        )),
    );

    if (allPlays.length === 0) {
      return Response.json({ error: 'No plays analyzed for this opponent yet' }, { status: 400 });
    }

    // Serialize plays for Claude
    const playsForPrompt = allPlays.map((p) => ({
      id: p.id,
      down: p.down,
      distance: p.distance,
      quarter: p.quarter,
      formation: p.formation,
      playType: p.playType,
      direction: p.playDirection,
      yards: p.gainLoss,
      result: p.result,
      coverage: (p.coachOverride as { aiCoverage?: string })?.aiCoverage,
      front: (p.coachOverride as { aiDefensiveFront?: string })?.aiDefensiveFront,
      pressure: (p.coachOverride as { aiPressure?: string })?.aiPressure,
      route: (p.coachOverride as { aiRouteConcept?: string })?.aiRouteConcept,
      gap: (p.coachOverride as { aiRunGap?: string })?.aiRunGap,
      observations: (p.coachOverride as { aiObservations?: string })?.aiObservations,
    }));

    // Ask Claude to curate the walkthrough
    const { output } = await generateText({
      model: gateway('anthropic/claude-sonnet-4.6'),
      system: SYSTEM_PROMPT,
      prompt: `Opponent: ${opp.name}\nTotal plays analyzed: ${allPlays.length}\n\nPlay data (JSON):\n${JSON.stringify(playsForPrompt, null, 2)}\n\nIdentify the 3-5 most exploitable tendencies. For each, pick 2-3 evidence play IDs and provide visual overlays.`,
      output: Output.object({ schema: responseSchema }),
    });

    if (!output) {
      throw new Error('Claude returned no output');
    }

    // Build the walkthrough shape the front end expects
    const playMap = new Map(allPlays.map((p) => [p.id, p]));

    const walkthrough: Walkthrough = {
      opponentId: opp.id,
      opponentName: opp.name,
      playsAnalyzed: allPlays.length,
      summary: output.summary,
      generatedAt: new Date().toISOString(),
      insights: output.insights.map((ins, i) => ({
        id: slugify(ins.headline),
        rank: i + 1,
        headline: ins.headline,
        narrative: ins.narrative,
        evidenceCount: ins.evidence_play_ids.length,
        recommendations: ins.recommendations,
        examples: ins.evidence_play_ids
          .map((pid) => {
            const p = playMap.get(pid);
            if (!p || !p.clipBlobKey) return null;
            // Extract tracks from coachOverride JSON if present
            let tracks: InsightExample['tracks'] = undefined;
            const rawTracks = (p.coachOverride as { tracks?: string | unknown })?.tracks;
            if (typeof rawTracks === 'string') {
              try {
                tracks = JSON.parse(rawTracks);
              } catch {
                tracks = undefined;
              }
            } else if (Array.isArray(rawTracks)) {
              tracks = rawTracks as InsightExample['tracks'];
            }
            return {
              playId: pid,
              label: `${p.down ?? '?'}&${p.distance ?? '?'} · Q${p.quarter ?? '?'} · ${p.formation ?? ''}`.trim(),
              clipUrl: p.clipBlobKey,
              description: `${p.playType ?? 'Play'} ${p.playDirection ?? ''} — ${p.result ?? `${p.gainLoss ?? 0} yd`}`.trim(),
              overlays: ins.overlays_per_play[pid] ?? [],
              tracks,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null),
      })),
    };

    span.done({ opponentId: opp.id, insights: walkthrough.insights.length });

    return Response.json(walkthrough);
  } catch (error) {
    span.fail(error);
    const msg = error instanceof Error ? error.message : 'Failed';
    return Response.json({ error: msg }, { status: 500 });
  }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
}
