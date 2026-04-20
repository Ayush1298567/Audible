/**
 * /api/coaches — Staff management for a program.
 *
 * Head coaches can list, add, update roles of, and remove coaching
 * staff. Adding a coach requires their Clerk user ID and email (the
 * head coach gets these from the Clerk org member list or by asking
 * the staff member to sign up first).
 *
 * Role hierarchy: head_coach > coordinator > assistant.
 * Only head_coach can manage staff.
 */

import { withProgramContext } from '@/lib/db/client';
import { coaches } from '@/lib/db/schema';
import { beginSpan } from '@/lib/observability/log';
import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import {
  AuthError,
  requireCoachForProgram,
  requireHeadCoach,
  type CoachRole,
} from '@/lib/auth/guards';

const addSchema = z.object({
  programId: z.string().uuid(),
  clerkUserId: z.string().min(1),
  email: z.string().email(),
  firstName: z.string().max(50).optional(),
  lastName: z.string().max(50).optional(),
  role: z.enum(['coordinator', 'assistant']),
});

const updateRoleSchema = z.object({
  programId: z.string().uuid(),
  coachId: z.string().uuid(),
  role: z.enum(['coordinator', 'assistant']),
});

const removeSchema = z.object({
  programId: z.string().uuid(),
  coachId: z.string().uuid(),
});

export async function GET(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/coaches', method: 'GET' }, req);
  try {
    const url = new URL(req.url);
    const programId = url.searchParams.get('programId');
    if (!programId) {
      return Response.json({ error: 'programId required' }, { status: 400 });
    }
    await requireCoachForProgram(programId);

    const staff = await withProgramContext(programId, async (tx) =>
      tx
        .select({
          id: coaches.id,
          clerkUserId: coaches.clerkUserId,
          email: coaches.email,
          firstName: coaches.firstName,
          lastName: coaches.lastName,
          role: coaches.role,
          createdAt: coaches.createdAt,
        })
        .from(coaches)
        .where(eq(coaches.programId, programId))
        .orderBy(coaches.role, coaches.createdAt),
    );

    span.done({ count: staff.length });
    return Response.json({ coaches: staff });
  } catch (error) {
    span.fail(error);
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    return Response.json({ error: 'Failed to fetch coaches' }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const span = beginSpan({ route: '/api/coaches', method: 'POST' }, req);
  try {
    const body = await req.json();
    const action = body.action as string | undefined;

    if (action === 'updateRole') {
      const input = updateRoleSchema.parse(body);
      const session = await requireHeadCoach();
      if (session.programId !== input.programId) {
        throw new AuthError('Forbidden: program mismatch', 403);
      }

      const [updated] = await withProgramContext(input.programId, async (tx) =>
        tx
          .update(coaches)
          .set({ role: input.role as CoachRole })
          .where(
            and(
              eq(coaches.id, input.coachId),
              eq(coaches.programId, input.programId),
              // Can't change head_coach role through this endpoint
              ne(coaches.role, 'head_coach'),
            ),
          )
          .returning(),
      );

      if (!updated) {
        return Response.json(
          { error: 'Coach not found or cannot change head coach role' },
          { status: 404 },
        );
      }
      span.done({ updated: input.coachId, newRole: input.role });
      return Response.json({ coach: updated });
    }

    if (action === 'remove') {
      const input = removeSchema.parse(body);
      const session = await requireHeadCoach();
      if (session.programId !== input.programId) {
        throw new AuthError('Forbidden: program mismatch', 403);
      }

      // Can't remove yourself (head coach)
      const deleted = await withProgramContext(input.programId, async (tx) =>
        tx
          .delete(coaches)
          .where(
            and(
              eq(coaches.id, input.coachId),
              eq(coaches.programId, input.programId),
              ne(coaches.role, 'head_coach'),
            ),
          )
          .returning({ id: coaches.id }),
      );

      if (deleted.length === 0) {
        return Response.json(
          { error: 'Coach not found or cannot remove head coach' },
          { status: 404 },
        );
      }
      span.done({ removed: input.coachId });
      return Response.json({ removed: true });
    }

    // Default: add
    const input = addSchema.parse(body);
    const session = await requireHeadCoach();
    if (session.programId !== input.programId) {
      throw new AuthError('Forbidden: program mismatch', 403);
    }

    const [coach] = await withProgramContext(input.programId, async (tx) =>
      tx
        .insert(coaches)
        .values({
          programId: input.programId,
          clerkUserId: input.clerkUserId,
          email: input.email,
          firstName: input.firstName ?? null,
          lastName: input.lastName ?? null,
          role: input.role as CoachRole,
        })
        .returning(),
    );

    span.done({ coachId: coach?.id, role: input.role });
    return Response.json({ coach }, { status: 201 });
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
    return Response.json({ error: 'Coach operation failed' }, { status: 500 });
  }
}
