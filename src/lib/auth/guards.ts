/**
 * Auth guards — centralized role enforcement.
 *
 * Every coach-facing API route and server action goes through one of
 * these guards. Ad-hoc `if (user.role === ...)` checks in route handlers
 * are forbidden. Having one place to read means one place to audit.
 *
 * DEV MODE: When DEV_BYPASS_AUTH=1, all guards return a fake session
 * with the role from DEV_ROLE (default: head_coach) and the programId
 * from DEV_PROGRAM_ID. This lets us test every route without Clerk.
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
 * Dev bypass: return a fake session when DEV_BYPASS_AUTH=1.
 * Reads role from DEV_ROLE env var, programId from DEV_PROGRAM_ID
 * or falls back to the first program in the DB.
 */
async function devBypassSession(): Promise<CoachSession | null> {
  if (process.env.DEV_BYPASS_AUTH !== '1') return null;

  let programId = process.env.DEV_PROGRAM_ID;
  if (!programId) {
    // Auto-discover the first program in the DB
    const firstProgram = await withGlobalContext(async (tx) => {
      const rows = await tx.select({ id: programs.id }).from(programs).limit(1);
      return rows[0];
    });
    programId = firstProgram?.id ?? 'dev-program-id';
  }

  const role = (process.env.DEV_ROLE ?? 'head_coach') as CoachRole;
  return {
    clerkUserId: 'dev-user',
    clerkOrgId: 'dev-org',
    programId,
    role,
  };
}

/**
 * Require any authenticated coach. Returns the coach session with
 * programId resolved, ready to pass into withProgramContext.
 *
 * Throws AuthError with a 401 if unauthenticated, 403 if the user
 * has no coach record in their active organization.
 */
export async function requireCoach(): Promise<CoachSession> {
  // Dev bypass
  const devSession = await devBypassSession();
  if (devSession) return devSession;

  const { userId, orgId } = await auth();

  if (!userId) {
    throw new AuthError('Not authenticated', 401);
  }
  if (!orgId) {
    throw new AuthError('No active organization — coach must be in a program', 403);
  }

  // Resolve programId from the Clerk org ID.
  const program = await withGlobalContext(async (tx) => {
    const rows = await tx.select().from(programs).where(eq(programs.clerkOrgId, orgId)).limit(1);
    return rows[0];
  });

  if (!program) {
    throw new AuthError('Clerk org is not linked to an Audible program', 403);
  }

  // Look up the coach record inside the program's RLS context.
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

/**
 * Require that the requested programId matches the authenticated coach's
 * active organization.
 */
export async function requireCoachForProgram(programId: string): Promise<CoachSession> {
  const session = await requireCoach();

  // In dev mode, always allow (programId comes from the client)
  if (process.env.DEV_BYPASS_AUTH === '1') {
    return { ...session, programId };
  }

  if (session.programId !== programId) {
    throw new AuthError('Forbidden: program mismatch', 403);
  }

  return session;
}

/**
 * Same as requireCoachForProgram, but enforces a minimum role.
 */
export async function requireCoachRoleForProgram(
  minRole: CoachRole,
  programId: string,
): Promise<CoachSession> {
  const session = await requireCoachRole(minRole);

  if (process.env.DEV_BYPASS_AUTH === '1') {
    return { ...session, programId };
  }

  if (session.programId !== programId) {
    throw new AuthError('Forbidden: program mismatch', 403);
  }

  return session;
}
