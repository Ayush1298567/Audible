import { withProgramContext } from '@/lib/db/client';
import { gamePlans } from '@/lib/db/schema';
import { gamePlanPlays, gamePlanAssignments, suggestionDismissals } from '@/lib/db/schema-gameplan';
import { beginSpan } from '@/lib/observability/log';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { suggestPlays } from '@/lib/game-plan/suggester';
import {
  AuthError,
  requireCoachForProgram,
  requireCoachRoleForProgram,
  requireHeadCoach,
} from '@/lib/auth/guards';

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
        await requireCoachRoleForProgram('coordinator', input.programId);
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
        await requireCoachRoleForProgram('coordinator', input.programId);
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
        await requireCoachForProgram(input.programId);
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
        await requireCoachRoleForProgram('coordinator', dismissInput.programId);

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

      case 'pushInstallToPlayers': {
        const input = z
          .object({
            programId: z.string().uuid(),
            gamePlanId: z.string().uuid(),
            positionGroup: z.string().min(1).max(10),
            situation: z.string().min(1).max(30).default('player_install'),
            assignmentText: z.string().min(1).max(2000),
          })
          .parse(body);
        await requireCoachRoleForProgram('coordinator', input.programId);

        const cardRows = await withProgramContext(input.programId, async (tx) =>
          tx
            .select({ id: gamePlanPlays.id })
            .from(gamePlanPlays)
            .where(
              and(
                eq(gamePlanPlays.programId, input.programId),
                eq(gamePlanPlays.gamePlanId, input.gamePlanId),
              ),
            ),
        );

        const cardIds = cardRows.map((r) => r.id);
        if (cardIds.length === 0) {
          return Response.json(
            { error: 'No plays on the board yet — add cards before pushing to players.' },
            { status: 400 },
          );
        }

        await withProgramContext(input.programId, async (tx) => {
          await tx
            .delete(gamePlanAssignments)
            .where(
              and(
                eq(gamePlanAssignments.programId, input.programId),
                eq(gamePlanAssignments.gamePlanId, input.gamePlanId),
                eq(gamePlanAssignments.positionGroup, input.positionGroup),
                eq(gamePlanAssignments.situation, input.situation),
              ),
            );

          await tx.insert(gamePlanAssignments).values({
            programId: input.programId,
            gamePlanId: input.gamePlanId,
            positionGroup: input.positionGroup,
            situation: input.situation,
            assignmentText: input.assignmentText,
            relatedPlayIds: cardIds,
          });
        });

        span.done({
          action: 'pushInstallToPlayers',
          gamePlanId: input.gamePlanId,
          positionGroup: input.positionGroup,
          cardCount: cardIds.length,
        });
        return Response.json({ linkedCardCount: cardIds.length, positionGroup: input.positionGroup });
      }

      case 'publish': {
        const { programId, gamePlanId } = z.object({
          programId: z.string().uuid(),
          gamePlanId: z.string().uuid(),
        }).parse(body);
        const headCoach = await requireHeadCoach();
        if (headCoach.programId !== programId) {
          return Response.json({ error: 'Forbidden: program mismatch' }, { status: 403 });
        }

        await withProgramContext(programId, async (tx) =>
          tx
            .update(gamePlans)
            .set({
              publishStatus: 'published',
              publishedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(and(eq(gamePlans.id, gamePlanId), eq(gamePlans.programId, programId))),
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
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
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
    await requireCoachForProgram(programId);

    if (gamePlanId) {
      // Get a specific game plan with its plays
      const [plan] = await withProgramContext(programId, async (tx) =>
        tx
          .select()
          .from(gamePlans)
          .where(and(eq(gamePlans.id, gamePlanId), eq(gamePlans.programId, programId))),
      );
      if (!plan) {
        return Response.json({ error: 'Game plan not found' }, { status: 404 });
      }
      const plays = await withProgramContext(programId, async (tx) =>
        tx.select().from(gamePlanPlays)
          .where(eq(gamePlanPlays.gamePlanId, gamePlanId))
          .orderBy(gamePlanPlays.situation, gamePlanPlays.sortOrder),
      );
      const assignments = await withProgramContext(programId, async (tx) =>
        tx
          .select()
          .from(gamePlanAssignments)
          .where(eq(gamePlanAssignments.gamePlanId, gamePlanId)),
      );
      span.done({ gamePlanId, playCount: plays.length, assignmentCount: assignments.length });
      return Response.json({ gamePlan: plan, plays, assignments });
    }

    // List all game plans
    const plans = await withProgramContext(programId, async (tx) =>
      tx.select().from(gamePlans).where(eq(gamePlans.programId, programId)),
    );
    span.done({ count: plans.length });
    return Response.json({ gamePlans: plans });
  } catch (error) {
    span.fail(error);
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Failed to fetch game plans' }, { status: 500 });
  }
}
