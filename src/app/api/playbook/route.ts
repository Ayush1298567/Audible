/**
 * /api/playbook — CRUD for a program's playbook plays.
 *
 * The playbook is what the board's AI suggester draws from. Without
 * plays here, it has nothing to recommend. Plays have a name,
 * formation, personnel package, play type, and optional situation tags
 * so the suggester can narrow by situation.
 */

import { withProgramContext } from '@/lib/db/client';
import { playbookPlays } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  AuthError,
  requireCoachForProgram,
  requireCoachRoleForProgram,
} from '@/lib/auth/guards';

const createSchema = z.object({
  programId: z.string().uuid(),
  name: z.string().min(1).max(100),
  formation: z.string().min(1).max(60),
  playType: z.enum(['run', 'pass', 'screen', 'rpo', 'trick', 'special']),
  personnel: z.string().max(10).optional(),
  situationTags: z.array(z.string().max(30)).max(10).optional(),
});

const updateSchema = z.object({
  programId: z.string().uuid(),
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  formation: z.string().min(1).max(60).optional(),
  playType: z.enum(['run', 'pass', 'screen', 'rpo', 'trick', 'special']).optional(),
  personnel: z.string().max(10).optional(),
  situationTags: z.array(z.string().max(30)).max(10).optional(),
});

const deleteSchema = z.object({
  programId: z.string().uuid(),
  id: z.string().uuid(),
});

export async function GET(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/playbook', method: 'GET' }, req);
  try {
    const url = new URL(req.url);
    const programId = url.searchParams.get('programId');
    if (!programId) {
      return Response.json({ error: 'programId required' }, { status: 400 });
    }
    await requireCoachForProgram(programId);

    const plays = await withProgramContext(programId, async (tx) =>
      tx
        .select()
        .from(playbookPlays)
        .where(eq(playbookPlays.programId, programId))
        .orderBy(playbookPlays.formation, playbookPlays.name),
    );

    span.done({ count: plays.length });
    return Response.json({ plays });
  } catch (error) {
    span.fail(error);
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Failed to fetch playbook' }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/playbook', method: 'POST' }, req);
  try {
    const body = await req.json();
    const action = body.action as string | undefined;

    if (action === 'update') {
      const input = updateSchema.parse(body);
      await requireCoachRoleForProgram('coordinator', input.programId);

      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.formation !== undefined) updates.formation = input.formation;
      if (input.playType !== undefined) updates.playType = input.playType;
      if (input.personnel !== undefined) updates.personnel = input.personnel;
      if (input.situationTags !== undefined) updates.situationTags = input.situationTags;

      const [updated] = await withProgramContext(input.programId, async (tx) =>
        tx
          .update(playbookPlays)
          .set(updates)
          .where(
            and(eq(playbookPlays.id, input.id), eq(playbookPlays.programId, input.programId)),
          )
          .returning(),
      );

      if (!updated) {
        return Response.json({ error: 'Play not found' }, { status: 404 });
      }
      span.done({ updated: input.id });
      return Response.json({ play: updated });
    }

    if (action === 'delete') {
      const input = deleteSchema.parse(body);
      await requireCoachRoleForProgram('coordinator', input.programId);

      await withProgramContext(input.programId, async (tx) =>
        tx
          .delete(playbookPlays)
          .where(
            and(eq(playbookPlays.id, input.id), eq(playbookPlays.programId, input.programId)),
          ),
      );

      span.done({ deleted: input.id });
      return Response.json({ deleted: true });
    }

    // Default: create
    const input = createSchema.parse(body);
    await requireCoachRoleForProgram('coordinator', input.programId);

    const [play] = await withProgramContext(input.programId, async (tx) =>
      tx
        .insert(playbookPlays)
        .values({
          programId: input.programId,
          name: input.name,
          formation: input.formation,
          playType: input.playType,
          personnel: input.personnel ?? null,
          situationTags: input.situationTags ?? [],
        })
        .returning(),
    );

    span.done({ playId: play?.id });
    return Response.json({ play }, { status: 201 });
  } catch (error) {
    span.fail(error);
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Playbook operation failed' }, { status: 500 });
  }
}
