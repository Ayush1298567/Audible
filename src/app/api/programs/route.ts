import { auth, currentUser } from '@clerk/nextjs/server';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { withGlobalContext, withProgramContext } from '@/lib/db/client';
import { coaches, programs, seasons, plays } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import { AuthError, requireHeadCoach } from '@/lib/auth/guards';

// ─── GET: current Clerk org's program + play count ─────────────

export async function GET(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/programs', method: 'GET' }, req);

  try {
    let program;

    if (process.env.DEV_BYPASS_AUTH === '1') {
      // Dev mode: return the first program in the DB
      const [first] = await withGlobalContext(async (tx) =>
        tx.select().from(programs).limit(1),
      );
      program = first;
    } else {
      const { userId, orgId } = await auth();
      if (!userId) {
        return Response.json({ error: 'Not authenticated' }, { status: 401 });
      }
      if (!orgId) {
        return Response.json(
          { error: 'No active organization', programs: [] },
          { status: 200 },
        );
      }

      const [found] = await withGlobalContext(async (tx) =>
        tx.select().from(programs).where(eq(programs.clerkOrgId, orgId)).limit(1),
      );
      program = found;
    }

    if (!program) {
      span.done({ count: 0 });
      return Response.json({ programs: [] });
    }

    const [countRow] = await withProgramContext(program.id, async (tx) =>
      tx
        .select({ playCount: sql<number>`cast(count(*) as int)` })
        .from(plays)
        .where(eq(plays.programId, program.id)),
    );

    const playCount = countRow?.playCount ?? 0;

    span.done({ count: 1 });
    return Response.json({
      programs: [{ ...program, play_count: playCount }],
    });
  } catch (error) {
    span.fail(error);
    return Response.json({ error: 'Failed to fetch programs' }, { status: 500 });
  }
}

const createProgramSchema = z.object({
  name: z.string().min(1).max(200),
  level: z.enum(['hs', 'd2', 'd3']),
  city: z.string().max(100).optional(),
  state: z.string().length(2).optional(),
  seasonYear: z.number().int().min(2020).max(2030),
});

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/programs' }, req);

  try {
    const { userId, orgId } = await auth();
    if (!userId) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (!orgId) {
      return Response.json(
        { error: 'Select an organization in Clerk before creating a program' },
        { status: 400 },
      );
    }

    const existing = await withGlobalContext(async (tx) =>
      tx.select({ id: programs.id }).from(programs).where(eq(programs.clerkOrgId, orgId)).limit(1),
    );
    if (existing[0]) {
      return Response.json(
        {
          error: 'This Clerk organization is already linked to an Audible program',
          programId: existing[0].id,
        },
        { status: 409 },
      );
    }

    const body = await req.json();
    const input = createProgramSchema.parse(body);

    const user = await currentUser();
    const email =
      user?.emailAddresses?.[0]?.emailAddress ?? `${userId}@users.clerk.audible`;

    const [program] = await withGlobalContext(async (tx) =>
      tx
        .insert(programs)
        .values({
          name: input.name,
          level: input.level,
          city: input.city ?? null,
          state: input.state ?? null,
          clerkOrgId: orgId,
        })
        .returning(),
    );

    if (!program) {
      throw new Error('Program insert returned no rows');
    }

    await withProgramContext(program.id, async (tx) => {
      const existingCoach = await tx
        .select({ id: coaches.id })
        .from(coaches)
        .where(eq(coaches.clerkUserId, userId))
        .limit(1);
      if (!existingCoach[0]) {
        await tx.insert(coaches).values({
          programId: program.id,
          clerkUserId: userId,
          email,
          firstName: user?.firstName ?? null,
          lastName: user?.lastName ?? null,
          role: 'head_coach',
        });
      }
    });

    const [season] = await withProgramContext(program.id, async (tx) =>
      tx
        .insert(seasons)
        .values({
          programId: program.id,
          year: input.seasonYear,
        })
        .returning(),
    );

    span.done({ programId: program.id, seasonId: season?.id });

    return Response.json(
      {
        program: { id: program.id, name: program.name },
        season: { id: season?.id, year: input.seasonYear },
      },
      { status: 201 },
    );
  } catch (error) {
    span.fail(error);

    if (error instanceof z.ZodError) {
      return Response.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 },
      );
    }

    return Response.json({ error: 'Failed to create program' }, { status: 500 });
  }
}

// ─── PATCH: update program settings ──────────────────────────

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  level: z.enum(['hs', 'd2', 'd3']).optional(),
  city: z.string().max(100).optional(),
  state: z.string().length(2).optional(),
});

export async function PATCH(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/programs', method: 'PATCH' }, req);
  try {
    const session = await requireHeadCoach();
    const body = await req.json();
    const input = updateSchema.parse(body);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.level !== undefined) updates.level = input.level;
    if (input.city !== undefined) updates.city = input.city;
    if (input.state !== undefined) updates.state = input.state;

    const [updated] = await withGlobalContext(async (tx) =>
      tx
        .update(programs)
        .set(updates)
        .where(eq(programs.id, session.programId))
        .returning(),
    );

    if (!updated) {
      return Response.json({ error: 'Program not found' }, { status: 404 });
    }

    span.done({ programId: session.programId });
    return Response.json({ program: updated });
  } catch (error) {
    span.fail(error);
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Validation failed', details: error.issues }, { status: 400 });
    }
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Failed to update program' }, { status: 500 });
  }
}
