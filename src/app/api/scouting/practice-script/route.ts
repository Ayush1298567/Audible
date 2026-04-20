/**
 * POST /api/scouting/practice-script
 *
 * Given a completed walkthrough (insights + call sheet), generate a
 * Mon-Thu practice script Claude writes from the football decisions
 * already locked in by the walkthrough. No new tendency analysis here
 * — this is purely "given these calls, how do we rehearse them?"
 *
 * Stateless: caller passes the full walkthrough payload, server hands
 * back a structured PracticeScript. Persistence (e.g. caching the
 * script on the opponent row) is left to a follow-up.
 */

import { gateway, generateText, Output } from 'ai';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { withProgramContext } from '@/lib/db/client';
import { walkthroughs } from '@/lib/db/schema';
import { beginSpan, log } from '@/lib/observability/log';
import {
  buildPromptContext,
  nextPracticeMonday,
  practiceScriptResponseSchema,
  type PracticeScript,
} from '@/lib/scouting/practice-script';
import { AuthError, requireCoachForProgram } from '@/lib/auth/guards';
import { getModel } from '@/lib/ai/model-policy';

export const maxDuration = 90;
const PRACTICE_SCRIPT_MODEL = getModel('practiceScript');

const requestSchema = z.object({
  /**
   * Tenancy + persistence keys. When `walkthroughId` is supplied (the
   * walkthrough route now returns one), the generated script is
   * persisted onto that walkthrough row so it survives reloads.
   */
  programId: z.string().uuid(),
  walkthroughId: z.string().uuid().optional(),
  walkthrough: z.object({
    opponentId: z.string().uuid(),
    opponentName: z.string().min(1),
    playsAnalyzed: z.number().int().nonnegative(),
    summary: z.string(),
    generatedAt: z.string(),
    insights: z
      .array(
        z.object({
          id: z.string(),
          rank: z.number().int().positive(),
          headline: z.string(),
          narrative: z.string(),
          evidenceCount: z.number().int().nonnegative(),
          recommendations: z
            .array(
              z.object({
                situation: z.string(),
                call: z.string(),
                rationale: z.string(),
              }),
            )
            .min(1),
          examples: z.array(z.unknown()).optional(),
        }),
      )
      .min(1),
    callSheet: z
      .object({
        buckets: z.array(
          z.object({
            bucket: z.string(),
            recommendations: z.array(
              z.object({
                insightHeadline: z.string(),
                insightId: z.string(),
                call: z.string(),
                rationale: z.string(),
              }),
            ),
          }),
        ),
      })
      .optional(),
  }),
});

const SYSTEM_PROMPT = `You are an expert football quality control coach building a
Mon-Thu practice script for this week's game. The opponent has already been scouted
— you are given the most exploitable tendencies + the Friday call sheet. Your job
is to schedule the WEEK so the team rehearses the right calls in the right order.

Standard high-school / small-college week structure:
  - MONDAY (Install): introduce new game-plan calls in walk-through tempo. Heavy
    install, light reps. Periods: Individual, Walk-through, Inside-Run install,
    7-on-7 install. The point is mental — players see the new concepts.
  - TUESDAY (Heavy): full-pads, hardest day. Periods: Individual, 1-on-1s
    (WR/CB, OL/DL), Inside Run, Pass Skel, Team. Reps the new install at game
    speed. This is where the new calls become muscle memory.
  - WEDNESDAY (Situational): full pads, situational focus. Periods: Individual,
    Red Zone, 3rd Down, 2-Minute, Special Teams, Team. Tie every situational
    period to a call-sheet bucket.
  - THURSDAY (Walk-through): helmets only, mental rehearsal. Periods: Individual
    (light), Walk-through, Mock Game (script the first 15). The point is to
    confirm everyone knows their assignment, not to pound bodies before Friday.

Rules for the script:

1. EVERY drill MUST tie back to a specific scouting insight or call-sheet bucket.
   Use insightId to link drills to the insight they exploit. Drills with no
   football reason are a waste of practice time.
2. Use INSIGHT IDs as given. Don't invent new IDs. Don't reference an insight
   that isn't in the input.
3. Map situational periods (Red Zone, 3rd Down, 2-Minute) on Wednesday to the
   corresponding call-sheet buckets. If the call sheet has no "red zone"
   bucket, don't schedule a red-zone period — substitute the most-loaded
   bucket instead.
4. CALLS in scoutLook must reflect the OPPONENT'S tendency, not ours. If
   their CB rotates Cover 3 on 3rd & long, the scoutLook is "Cover 3 with FS
   widening late," and the drill rep is OUR call against that look.
5. Periods must add up to a realistic practice length:
   - Mon: 60-90 min total (helmets/shells)
   - Tue: 110-130 min (full pads)
   - Wed: 100-120 min (full pads, situational-heavy)
   - Thu: 50-70 min (helmets, walk-through)
6. Rep counts: scale to drill complexity. New install = 4-6 reps. Reinforcing
   reps Wed = 8-10. Walk-through Thu = 2-4 (mental, not physical).
7. Each day MUST have between 3 and 6 periods. Don't pad.
8. weekTheme is one paragraph the head coach reads to the staff Monday morning
   — what we're attacking, where the leverage is, what the players need to
   internalize this week.

Be ruthless. A great week of practice fits the team's actual time budget. If
the walkthrough has only 3 insights, schedule fewer drills, not made-up ones.`;

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan(
    { route: '/api/scouting/practice-script', method: 'POST' },
    req,
  );

  try {
    const body = await req.json();
    const input = requestSchema.parse(body);
    await requireCoachForProgram(input.programId);

    const validInsightIds = new Set(input.walkthrough.insights.map((i) => i.id));
    const promptContext = buildPromptContext({
      ...input.walkthrough,
      // The prompt-context builder wants the full Insight shape, but we
      // only need the fields it actually reads. Cast through unknown.
      insights: input.walkthrough.insights.map((i) => ({
        ...i,
        examples: [],
      })),
    } as Parameters<typeof buildPromptContext>[0]);

    const { output } = await generateText({
      model: gateway(PRACTICE_SCRIPT_MODEL),
      system: SYSTEM_PROMPT,
      prompt: `Build the Mon-Thu practice script for this opponent. Tie every drill back to an insight ID where possible.\n\n${promptContext}`,
      output: Output.object({ schema: practiceScriptResponseSchema }),
    });

    if (!output) {
      throw new Error('Claude returned no practice script');
    }

    // Defensive: drop any drill that references a fabricated insight ID.
    // Claude is told not to do this but we enforce it.
    let droppedDrills = 0;
    const cleanedDays = output.days.map((day) => ({
      ...day,
      periods: day.periods.map((period) => ({
        ...period,
        drills: period.drills.filter((d) => {
          if (d.insightId && !validInsightIds.has(d.insightId)) {
            droppedDrills++;
            return false;
          }
          return true;
        }),
      })),
    }));
    if (droppedDrills > 0) {
      log.warn('practice_script_dropped_fake_insights', {
        opponentId: input.walkthrough.opponentId,
        droppedDrills,
      });
    }

    const script: PracticeScript = {
      opponentId: input.walkthrough.opponentId,
      opponentName: input.walkthrough.opponentName,
      weekOfMonday: nextPracticeMonday(),
      weekTheme: output.weekTheme,
      days: cleanedDays,
      generatedAt: new Date().toISOString(),
    };

    // Persist onto the walkthrough row when we know which one this came
    // from. Same-week reopens then skip the Claude call entirely.
    let persisted = false;
    if (input.walkthroughId) {
      const walkthroughId = input.walkthroughId;
      const updated = await withProgramContext(input.programId, async (tx) =>
        tx
          .update(walkthroughs)
          .set({ practiceScript: script, updatedAt: new Date() })
          .where(eq(walkthroughs.id, walkthroughId))
          .returning({ id: walkthroughs.id }),
      );
      persisted = updated.length > 0;
    }

    span.done({
      opponentId: script.opponentId,
      walkthroughId: input.walkthroughId,
      persisted,
      drills: cleanedDays.reduce(
        (n, d) => n + d.periods.reduce((m, p) => m + p.drills.length, 0),
        0,
      ),
      droppedDrills,
      model: PRACTICE_SCRIPT_MODEL,
    });

    return Response.json({ script });
  } catch (error) {
    span.fail(error);
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    const message =
      error instanceof Error ? error.message : 'Failed to build practice script';
    return Response.json({ error: message }, { status: 500 });
  }
}
