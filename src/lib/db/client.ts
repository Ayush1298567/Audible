/**
 * Database client with program-scoped context.
 *
 * Uses postgres-js so program-scoped queries can run inside a real
 * transaction with SET LOCAL context for Postgres RLS.
 *
 * The ONLY way to run a query against tenant-scoped tables is through
 * `withProgramContext(programId, async (tx) => ...)`.
 *
 * See PLAN.md §5.2 and drizzle/0001_enable_rls.sql.
 */

import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Add it to .env.local; see README.md and VERCEL_TODO.md.');
}

const client = postgres(process.env.DATABASE_URL, {
  max: Number(process.env.DATABASE_POOL_MAX ?? 10),
  prepare: false,
});

export const db = drizzle(client, { schema });

/**
 * Run queries inside a program-scoped context.
 *
 * The set_config(..., true) call is transaction-local. It feeds the
 * app.current_program_id() helper used by every tenant-scoped RLS policy.
 */
export async function withProgramContext<T>(
  programId: string,
  fn: (tx: typeof db) => Promise<T>,
): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(programId)) {
    throw new Error(`withProgramContext: invalid program UUID: ${programId}`);
  }
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.program_id', ${programId}, true)`);
    return fn(tx as unknown as typeof db);
  });
}

/**
 * Narrow global lookup used by player join-code authentication.
 *
 * The corresponding RLS policy only exposes the player row whose join_code
 * equals app.join_code and has not expired.
 */
export async function withPlayerJoinCodeContext<T>(
  joinCode: string,
  fn: (tx: typeof db) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.join_code', ${joinCode}, true)`);
    return fn(tx as unknown as typeof db);
  });
}

/**
 * Read-only access for queries that don't belong to a specific program.
 */
export async function withGlobalContext<T>(
  fn: (tx: typeof db) => Promise<T>,
): Promise<T> {
  return fn(db);
}

export { schema };
