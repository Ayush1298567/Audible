/**
 * Database client with program-scoped context.
 *
 * The ONLY way to run a query against tenant-scoped tables is through
 * `withProgramContext(programId, async (tx) => ...)`. The wrapper opens
 * a transaction, runs `SET LOCAL app.program_id = '<uuid>'`, and then
 * hands you a Drizzle transaction handle. Postgres RLS policies do the
 * rest — queries that "forget" the program_id filter simply return
 * zero rows, not leaked rows.
 *
 * Forbidden pattern (will fail code review):
 *   const rows = await db.select().from(plays);  // no context!
 *
 * Required pattern:
 *   const rows = await withProgramContext(programId, async (tx) =>
 *     tx.select().from(plays)
 *   );
 *
 * See PLAN.md §5.2 and drizzle/0001_enable_rls.sql.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Pull it with `vercel env pull .env.local`.');
}

// Single connection pool for the whole process. Neon + postgres-js handles
// pooling transparently; serverless environments reuse this module instance
// across invocations within the same Fluid Compute container.
const queryClient = postgres(process.env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  max_lifetime: 60 * 30,
  prepare: false, // Neon serverless compat
});

export const db = drizzle(queryClient, { schema });

/**
 * Run queries inside a program-scoped context.
 *
 * This function is the only sanctioned way to access tenant-scoped tables.
 * It opens a transaction, sets `app.program_id`, and runs your callback.
 * All queries inside the callback are RLS-enforced against that program.
 *
 * @throws if programId is not a valid UUID
 * @throws if the callback throws — the transaction is rolled back
 */
export async function withProgramContext<T>(
  programId: string,
  fn: (tx: typeof db) => Promise<T>,
): Promise<T> {
  // Guard: prevent SQL injection via malformed programId.
  // Drizzle parameterizes sql.raw, but belt-and-suspenders.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(programId)) {
    throw new Error(`withProgramContext: invalid program UUID: ${programId}`);
  }

  return db.transaction(async (tx) => {
    // SET LOCAL scopes the setting to the current transaction only.
    // RLS policies read this via app.current_program_id().
    await tx.execute(sql.raw(`SET LOCAL app.program_id = '${programId}'`));
    return fn(tx as unknown as typeof db);
  });
}

/**
 * Read-only access for the small set of queries that don't belong to a
 * specific program (e.g., looking up a program by Clerk org ID, reading
 * active prompts). These tables are NOT RLS-enforced.
 */
export async function withGlobalContext<T>(
  fn: (tx: typeof db) => Promise<T>,
): Promise<T> {
  return fn(db);
}

export { schema };
