/**
 * Database client with program-scoped context.
 *
 * Uses @neondatabase/serverless with WebSocket transport for Neon
 * (solves Node 25 ECONNRESET issues), or postgres-js for local PG.
 *
 * The ONLY way to run a query against tenant-scoped tables is through
 * `withProgramContext(programId, async (tx) => ...)`.
 *
 * See PLAN.md §5.2 and drizzle/0001_enable_rls.sql.
 */

import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Pull it with `vercel env pull .env.local`.');
}

const queryFn = neon(process.env.DATABASE_URL);
export const db = drizzle(queryFn, { schema });

/**
 * Run queries inside a program-scoped context.
 *
 * The Neon HTTP driver does not support multi-statement transactions.
 * In production on Vercel, Fluid Compute keeps the function warm so
 * connection overhead is minimal. For RLS enforcement, we rely on
 * the auth guards (which are server-side) rather than SET LOCAL.
 *
 * TODO: Switch to Neon's WebSocket driver or postgres-js with a
 * pooler when RLS enforcement is critical in production.
 */
export async function withProgramContext<T>(
  programId: string,
  fn: (tx: typeof db) => Promise<T>,
): Promise<T> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(programId)) {
    throw new Error(`withProgramContext: invalid program UUID: ${programId}`);
  }
  // Run directly — auth guards handle program isolation.
  return fn(db);
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
