/**
 * Row-Level Security isolation test.
 *
 * This is the single most important security test in the product.
 * It creates two programs with identical data and verifies that
 * queries from program A cannot see program B's rows — even when the
 * query explicitly tries to read them without a program_id filter.
 *
 * If this test ever fails, stop shipping. Cross-tenant data leaks
 * are the one class of bug that cannot be explained to a coach.
 *
 * Reference: PLAN.md §5.2, drizzle/0001_enable_rls.sql.
 *
 * ─────────────────────────────────────────────────────────────
 * Status: SCAFFOLD ONLY until the DB is provisioned. This test
 * is skipped until DATABASE_URL points to a real Neon branch with
 * migrations applied. Phase 1 wires this in; once it runs green,
 * we gate the CI workflow on it.
 * ─────────────────────────────────────────────────────────────
 */

import { describe, it, beforeAll, expect } from 'vitest';

// This test is gated on a real database. When DATABASE_URL is not
// set, we skip the whole suite with a clear message so CI doesn't
// explode before Phase 1 wires up Neon.
const HAS_DATABASE = !!process.env.DATABASE_URL;

describe.skipIf(!HAS_DATABASE)('RLS cross-program isolation', () => {
  beforeAll(async () => {
    // TODO Phase 1: create two programs, seed each with ~5 plays,
    // capture their program IDs for the test cases below.
  });

  it('queries from program A return zero rows for program B data', async () => {
    // TODO Phase 1:
    //   1. withProgramContext(programA.id, (tx) => tx.select().from(plays))
    //   2. assert every row.programId === programA.id
    //   3. withProgramContext(programB.id, (tx) => tx.select().from(plays))
    //   4. assert every row.programId === programB.id
    //   5. assert the two result sets are disjoint
    expect.fail('TODO: implement in Phase 1 once DB is provisioned');
  });

  it('cross-program INSERT attempts are rejected by the WITH CHECK policy', async () => {
    // TODO Phase 1: attempt to insert a row with program_id = programB
    //   inside a withProgramContext(programA.id) transaction. This should
    //   throw a Postgres RLS policy violation error.
    expect.fail('TODO: implement in Phase 1 once DB is provisioned');
  });

  it('forgetting to call withProgramContext returns zero rows, not leaked rows', async () => {
    // TODO Phase 1: call db.select().from(plays) WITHOUT wrapping in
    //   withProgramContext. Expected behavior: the app.program_id
    //   setting is NULL, current_program_id() returns NULL, policies
    //   evaluate false, zero rows returned.
    //   This is the belt-and-suspenders check that catches the
    //   "forgot the wrapper" class of bug at runtime.
    expect.fail('TODO: implement in Phase 1 once DB is provisioned');
  });

  it('FORCE ROW LEVEL SECURITY blocks superuser bypass', async () => {
    // TODO Phase 1: confirm that even connecting as the Neon owner
    //   role respects the RLS policies (no implicit BYPASSRLS).
    expect.fail('TODO: implement in Phase 1 once DB is provisioned');
  });
});

// When DATABASE_URL is not set, emit a warning so developers know
// this critical test is skipped.
if (!HAS_DATABASE) {
  // eslint-disable-next-line no-console
  console.warn(
    '[rls.test.ts] DATABASE_URL not set — RLS isolation tests skipped. ' +
      'Run `vercel env pull .env.local` and rerun.',
  );
}
