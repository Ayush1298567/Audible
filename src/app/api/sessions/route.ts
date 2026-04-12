import { withProgramContext } from '@/lib/db/client';
import { sessions, sessionPlays, playerSessionResults, } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import { eq, } from 'drizzle-orm';
import { z } from 'zod';

const createSchema = z.object({
  programId: z.string().uuid(),
  name: z.string().min(1).max(200),
  sessionType: z.enum(['film_review', 'recognition_challenge']),
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

        await withProgramContext(programId, async (tx) =>
          tx.update(sessions).set({ isPublished: true }).where(eq(sessions.id, sessionId)),
        );

        span.done({ sessionId, published: true });
        return Response.json({ published: true });
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

    const result = await withProgramContext(programId, async (tx) =>
      tx.select().from(sessions)
        .where(eq(sessions.programId, programId))
        .orderBy(sessions.createdAt),
    );

    span.done({ count: result.length });
    return Response.json({ sessions: result });
  } catch (error) {
    span.fail(error);
    return Response.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}
