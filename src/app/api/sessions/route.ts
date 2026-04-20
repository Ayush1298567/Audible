import { withProgramContext } from '@/lib/db/client';
import { sessions, sessionPlays, playerSessionResults, plays, games } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';
import { generateText, Output, gateway } from 'ai';
import { AuthError, requireCoachForProgram, requireCoachRoleForProgram } from '@/lib/auth/guards';

const createSchema = z.object({
  programId: z.string().uuid(),
  name: z.string().min(1).max(200),
  sessionType: z.enum(['film_review', 'recognition_challenge', 'decision_drill', 'walkthrough', 'quiz']),
  positionGroup: z.string().min(1).max(10),
  scheduledFor: z.string().datetime().optional(),
  estimatedMinutes: z.number().int().min(1).max(60).default(10),
  playIds: z.array(z.string().uuid()).min(1).max(30),
});

const submitResultSchema = z.object({
  programId: z.string().uuid(),
  sessionId: z.string().uuid(),
  playerId: z.string().uuid(),
  totalQuestions: z.number().int().min(0),
  correctAnswers: z.number().int().min(0),
  averageDecisionTimeMs: z.number().int().min(0).optional(),
  questionResults: z.array(z.object({
    playId: z.string(),
    correct: z.boolean(),
    answer: z.string(),
    correctAnswer: z.string(),
    decisionTimeMs: z.number().int(),
  })).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/sessions', method: 'POST' }, req);

  try {
    const body = await req.json();
    const action = body.action as string;

    switch (action) {
      case 'create': {
        const input = createSchema.parse(body);
        await requireCoachRoleForProgram('coordinator', input.programId);

        const [session] = await withProgramContext(input.programId, async (tx) =>
          tx.insert(sessions).values({
            programId: input.programId,
            name: input.name,
            sessionType: input.sessionType,
            positionGroup: input.positionGroup,
            scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null,
            estimatedMinutes: input.estimatedMinutes,
          }).returning(),
        );

        if (!session) throw new Error('Session insert failed');

        // Add plays to the session
        const playInserts = input.playIds.map((playId, i) => ({
          programId: input.programId,
          sessionId: session.id,
          playId,
          sortOrder: i,
        }));

        await withProgramContext(input.programId, async (tx) =>
          tx.insert(sessionPlays).values(playInserts),
        );

        span.done({ sessionId: session.id, playCount: input.playIds.length });
        return Response.json({ session, playCount: input.playIds.length }, { status: 201 });
      }

      case 'publish': {
        const { programId, sessionId } = z.object({
          programId: z.string().uuid(),
          sessionId: z.string().uuid(),
        }).parse(body);
        await requireCoachRoleForProgram('coordinator', programId);

        await withProgramContext(programId, async (tx) =>
          tx
            .update(sessions)
            .set({ isPublished: true })
            .where(and(eq(sessions.id, sessionId), eq(sessions.programId, programId))),
        );

        span.done({ sessionId, published: true });
        return Response.json({ published: true });
      }

      case 'autoPlan': {
        const autoPlanInput = z.object({
          programId: z.string().uuid(),
          opponentId: z.string().uuid(),
          positionGroup: z.string().min(1).max(10),
          focus: z.string().min(1).max(200),
          sessionType: z.enum(['film_review', 'recognition_challenge', 'decision_drill', 'walkthrough', 'quiz']),
        }).parse(body);
        await requireCoachRoleForProgram('coordinator', autoPlanInput.programId);

        // Fetch plays for this opponent
        const opponentPlays = await withProgramContext(autoPlanInput.programId, async (tx) =>
          tx
            .select({
              id: plays.id,
              down: plays.down,
              distance: plays.distance,
              formation: plays.formation,
              playType: plays.playType,
              result: plays.result,
            })
            .from(plays)
            .innerJoin(games, eq(plays.gameId, games.id))
            .where(and(
              eq(plays.programId, autoPlanInput.programId),
              eq(games.opponentId, autoPlanInput.opponentId),
              eq(plays.status, 'ready'),
            ))
            .orderBy(desc(plays.createdAt))
            .limit(100),
        );

        if (opponentPlays.length === 0) {
          return Response.json({ error: 'No plays available for this opponent' }, { status: 400 });
        }

        // Ask AI to select the best plays for this session
        const playList = opponentPlays.map((p, i) =>
          `${i}: D${p.down ?? '?'}&${p.distance ?? '?'} ${p.formation ?? '?'} ${p.playType ?? '?'} → ${p.result ?? '?'}`,
        ).join('\n');

        const selectionSchema = z.object({
          sessionName: z.string(),
          selectedIndices: z.array(z.number().int().min(0)).min(3).max(15),
          estimatedMinutes: z.number().int().min(5).max(30),
        });

        const { output: aiSelection } = await generateText({
          model: gateway('anthropic/claude-sonnet-4.6'),
          output: Output.object({ schema: selectionSchema }),
          prompt: `You are building a ${autoPlanInput.sessionType.replace(/_/g, ' ')} practice session for the ${autoPlanInput.positionGroup} position group.

Coach's focus: "${autoPlanInput.focus}"

Available plays (index: situation formation playType → result):
${playList}

Select 8-12 plays that best match the coach's focus. Return the play indices, a good session name, and estimated minutes.`,
        });

        if (!aiSelection) {
          return Response.json({ error: 'AI planning failed' }, { status: 500 });
        }

        // Create the session with selected plays
        const selectedPlayIds = aiSelection.selectedIndices
          .filter((i) => i < opponentPlays.length)
          .map((i) => opponentPlays[i]?.id)
          .filter((id): id is string => !!id);

        if (selectedPlayIds.length === 0) {
          return Response.json({ error: 'No valid plays selected' }, { status: 400 });
        }

        const [autoSession] = await withProgramContext(autoPlanInput.programId, async (tx) =>
          tx.insert(sessions).values({
            programId: autoPlanInput.programId,
            name: aiSelection.sessionName,
            sessionType: autoPlanInput.sessionType,
            positionGroup: autoPlanInput.positionGroup,
            estimatedMinutes: aiSelection.estimatedMinutes,
          }).returning(),
        );

        if (!autoSession) throw new Error('Session insert failed');

        const autoPlayInserts = selectedPlayIds.map((playId, i) => ({
          programId: autoPlanInput.programId,
          sessionId: autoSession.id,
          playId,
          sortOrder: i,
        }));

        await withProgramContext(autoPlanInput.programId, async (tx) =>
          tx.insert(sessionPlays).values(autoPlayInserts),
        );

        span.done({ sessionId: autoSession.id, playCount: selectedPlayIds.length, auto: true });
        return Response.json({
          session: autoSession,
          playCount: selectedPlayIds.length,
          sessionName: aiSelection.sessionName,
        }, { status: 201 });
      }

      case 'submitResult': {
        const input = submitResultSchema.parse(body);
        const accuracy = input.totalQuestions > 0
          ? input.correctAnswers / input.totalQuestions
          : 0;

        const [result] = await withProgramContext(input.programId, async (tx) =>
          tx.insert(playerSessionResults).values({
            programId: input.programId,
            sessionId: input.sessionId,
            playerId: input.playerId,
            completed: true,
            completedAt: new Date(),
            totalQuestions: input.totalQuestions,
            correctAnswers: input.correctAnswers,
            accuracy,
            averageDecisionTimeMs: input.averageDecisionTimeMs ?? null,
            questionResults: input.questionResults ?? null,
          }).returning(),
        );

        span.done({ resultId: result?.id, accuracy });
        return Response.json({ result, accuracy }, { status: 201 });
      }

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    span.fail(error);
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Session operation failed' }, { status: 500 });
  }
}

export async function GET(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/sessions', method: 'GET' }, req);

  try {
    const url = new URL(req.url);
    const programId = url.searchParams.get('programId');
    if (!programId) {
      return Response.json({ error: 'programId required' }, { status: 400 });
    }
    await requireCoachForProgram(programId);

    const result = await withProgramContext(programId, async (tx) =>
      tx.select().from(sessions)
        .where(eq(sessions.programId, programId))
        .orderBy(sessions.createdAt),
    );

    span.done({ count: result.length });
    return Response.json({ sessions: result });
  } catch (error) {
    span.fail(error);
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}
