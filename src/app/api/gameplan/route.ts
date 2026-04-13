import { withProgramContext } from '@/lib/db/client';
import { gamePlans } from '@/lib/db/schema';
import { gamePlanPlays, suggestionDismissals } from '@/lib/db/schema-gameplan';
import { beginSpan } from '@/lib/observability/log';
import { eq, } from 'drizzle-orm';
import { z } from 'zod';
import { suggestPlays } from '@/lib/game-plan/suggester';

const createSchema = z.object({
  programId: z.string().uuid(),
  opponentId: z.string().uuid(),
  weekLabel: z.string().min(1).max(50),
});

const addPlaySchema = z.object({
  programId: z.string().uuid(),
  gamePlanId: z.string().uuid(),
  situation: z.string().min(1).max(30),
  playName: z.string().min(1),
  formation: z.string().optional(),
  playType: z.string().optional(),
  playbookPlayId: z.string().uuid().optional(),
  sortOrder: z.number().int().default(0),
});

const suggestSchema = z.object({
  programId: z.string().uuid(),
  opponentId: z.string().uuid(),
  situation: z.string().min(1),
  down: z.number().int().min(1).max(4).optional(),
  distanceBucket: z.enum(['short', 'medium', 'long']).optional(),
});

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/gameplan', method: 'POST' }, req);

  try {
    const body = await req.json();
    const action = body.action as string;

    switch (action) {
      case 'create': {
        const input = createSchema.parse(body);
        const [plan] = await withProgramContext(input.programId, async (tx) =>
          tx.insert(gamePlans).values({
            programId: input.programId,
            opponentId: input.opponentId,
            weekLabel: input.weekLabel,
          }).returning(),
        );
        span.done({ gamePlanId: plan?.id });
        return Response.json({ gamePlan: plan }, { status: 201 });
      }

      case 'addPlay': {
        const input = addPlaySchema.parse(body);
        const [play] = await withProgramContext(input.programId, async (tx) =>
          tx.insert(gamePlanPlays).values({
            programId: input.programId,
            gamePlanId: input.gamePlanId,
            situation: input.situation,
            playName: input.playName,
            formation: input.formation ?? null,
            playType: input.playType ?? null,
            playbookPlayId: input.playbookPlayId ?? null,
            sortOrder: input.sortOrder,
          }).returning(),
        );
        span.done({ gamePlanPlayId: play?.id });
        return Response.json({ play }, { status: 201 });
      }

      case 'suggest': {
        const input = suggestSchema.parse(body);
        const suggestions = await suggestPlays({
          programId: input.programId,
          opponentId: input.opponentId,
          situation: input.situation,
          down: input.down,
          distanceBucket: input.distanceBucket,
        });
        span.done({ suggestionCount: suggestions.length });
        return Response.json({ suggestions });
      }

      case 'dismiss': {
        const dismissInput = z.object({
          programId: z.string().uuid(),
          opponentId: z.string().uuid(),
          situation: z.string().min(1),
          playName: z.string().min(1),
          formation: z.string().optional(),
        }).parse(body);

        await withProgramContext(dismissInput.programId, async (tx) =>
          tx.insert(suggestionDismissals).values({
            programId: dismissInput.programId,
            opponentId: dismissInput.opponentId,
            situation: dismissInput.situation,
            playName: dismissInput.playName,
            formation: dismissInput.formation ?? null,
          }),
        );

        span.done({ action: 'dismiss', playName: dismissInput.playName });
        return Response.json({ dismissed: true });
      }

      case 'publish': {
        const { programId, gamePlanId } = z.object({
          programId: z.string().uuid(),
          gamePlanId: z.string().uuid(),
        }).parse(body);

        await withProgramContext(programId, async (tx) =>
          tx.update(gamePlans).set({
            publishStatus: 'published',
            publishedAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(gamePlans.id, gamePlanId)),
        );

        span.done({ gamePlanId, published: true });
        return Response.json({ published: true });
      }

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    span.fail(error);
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    return Response.json({ error: 'Game plan operation failed' }, { status: 500 });
  }
}

export async function GET(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/gameplan', method: 'GET' }, req);

  try {
    const url = new URL(req.url);
    const programId = url.searchParams.get('programId');
    const gamePlanId = url.searchParams.get('gamePlanId');

    if (!programId) {
      return Response.json({ error: 'programId required' }, { status: 400 });
    }

    if (gamePlanId) {
      // Get a specific game plan with its plays
      const [plan] = await withProgramContext(programId, async (tx) =>
        tx.select().from(gamePlans).where(eq(gamePlans.id, gamePlanId)),
      );
      const plays = await withProgramContext(programId, async (tx) =>
        tx.select().from(gamePlanPlays)
          .where(eq(gamePlanPlays.gamePlanId, gamePlanId))
          .orderBy(gamePlanPlays.situation, gamePlanPlays.sortOrder),
      );
      span.done({ gamePlanId, playCount: plays.length });
      return Response.json({ gamePlan: plan, plays });
    }

    // List all game plans
    const plans = await withProgramContext(programId, async (tx) =>
      tx.select().from(gamePlans).where(eq(gamePlans.programId, programId)),
    );
    span.done({ count: plans.length });
    return Response.json({ gamePlans: plans });
  } catch (error) {
    span.fail(error);
    return Response.json({ error: 'Failed to fetch game plans' }, { status: 500 });
  }
}
