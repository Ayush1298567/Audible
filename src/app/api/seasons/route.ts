/**
 * /api/seasons — CRUD for seasons within a program.
 *
 * Seasons group games by year (e.g. "2026 Fall"). Games have an
 * optional `seasonId` FK so they can be scoped to a specific season.
 */

import { withProgramContext } from '@/lib/db/client';
import { seasons } from '@/lib/db/schema';
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
  year: z.number().int().min(2020).max(2040),
});

const deleteSchema = z.object({
  programId: z.string().uuid(),
  id: z.string().uuid(),
});

export async function GET(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/seasons', method: 'GET' }, req);
  try {
    const url = new URL(req.url);
    const programId = url.searchParams.get('programId');
    if (!programId) {
      return Response.json({ error: 'programId required' }, { status: 400 });
    }
    await requireCoachForProgram(programId);

    const result = await withProgramContext(programId, async (tx) =>
      tx
        .select()
        .from(seasons)
        .where(eq(seasons.programId, programId))
        .orderBy(seasons.year),
    );

    span.done({ count: result.length });
    return Response.json({ seasons: result });
  } catch (error) {
    span.fail(error);
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Failed to fetch seasons' }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/seasons', method: 'POST' }, req);
  try {
    const body = await req.json();
    const action = body.action as string | undefined;

    if (action === 'delete') {
      const input = deleteSchema.parse(body);
      await requireCoachRoleForProgram('coordinator', input.programId);

      await withProgramContext(input.programId, async (tx) =>
        tx
          .delete(seasons)
          .where(and(eq(seasons.id, input.id), eq(seasons.programId, input.programId))),
      );

      span.done({ deleted: input.id });
      return Response.json({ deleted: true });
    }

    // Default: create
    const input = createSchema.parse(body);
    await requireCoachRoleForProgram('coordinator', input.programId);

    const [season] = await withProgramContext(input.programId, async (tx) =>
      tx
        .insert(seasons)
        .values({
          programId: input.programId,
          year: input.year,
        })
        .returning(),
    );

    span.done({ seasonId: season?.id });
    return Response.json({ season }, { status: 201 });
  } catch (error) {
    span.fail(error);
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Season operation failed' }, { status: 500 });
  }
}
