/**
 * Auth guards — centralized role enforcement.
 *
 * Every coach-facing API route and server action goes through one of
 * these guards. Ad-hoc `if (user.role === ...)` checks in route handlers
 * are forbidden. Having one place to read means one place to audit.
 *
 * See PLAN.md §5.1 for the role model.
 */

import { auth } from '@clerk/nextjs/server';
import { withGlobalContext, withProgramContext } from '@/lib/db/client';
import { coaches, programs } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export type CoachRole = 'head_coach' | 'coordinator' | 'assistant';

export interface CoachSession {
  clerkUserId: string;
  clerkOrgId: string;
  programId: string;
  role: CoachRole;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Require any authenticated coach. Returns the coach session with
 * programId resolved, ready to pass into withProgramContext.
 *
 * Throws AuthError with a 401 if unauthenticated, 403 if the user
 * has no coach record in their active organization.
 */
export async function requireCoach(): Promise<CoachSession> {
  const { userId, orgId } = await auth();

  if (!userId) {
    throw new AuthError('Not authenticated', 401);
  }
  if (!orgId) {
    throw new AuthError('No active organization — coach must be in a program', 403);
  }

  // Resolve programId from the Clerk org ID. This lookup bypasses RLS
  // because `programs` is not a tenant-scoped table.
  const program = await withGlobalContext(async (tx) => {
    const rows = await tx.select().from(programs).where(eq(programs.clerkOrgId, orgId)).limit(1);
    return rows[0];
  });

  if (!program) {
    throw new AuthError('Clerk org is not linked to an Audible program', 403);
  }

  // Now look up the coach record inside the program's RLS context.
  const coach = await withProgramContext(program.id, async (tx) => {
    const rows = await tx
      .select()
      .from(coaches)
      .where(eq(coaches.clerkUserId, userId))
      .limit(1);
    return rows[0];
  });

  if (!coach) {
    throw new AuthError('User is in the org but has no coach record', 403);
  }

  return {
    clerkUserId: userId,
    clerkOrgId: orgId,
    programId: program.id,
    role: coach.role,
  };
}

/**
 * Require a specific minimum role. Roles are ordered:
 *   head_coach > coordinator > assistant
 *
 * `requireCoachRole('coordinator')` allows head_coach and coordinator
 * but not assistant.
 */
export async function requireCoachRole(minRole: CoachRole): Promise<CoachSession> {
  const session = await requireCoach();

  const rank: Record<CoachRole, number> = {
    assistant: 1,
    coordinator: 2,
    head_coach: 3,
  };

  if (rank[session.role] < rank[minRole]) {
    throw new AuthError(
      `Requires role '${minRole}' or higher; user has '${session.role}'`,
      403,
    );
  }

  return session;
}

/**
 * Require the highest role (admin-only actions).
 */
export async function requireHeadCoach(): Promise<CoachSession> {
  return requireCoachRole('head_coach');
}
