-- ───────────────────────────────────────────────────────────────
-- Audible — Row-Level Security policies
--
-- Every tenant-scoped table is RLS-enforced. Cross-program reads
-- return zero rows even when the query forgets a WHERE clause.
--
-- Usage: before any query, the app calls:
--   SET LOCAL app.program_id = '<verified clerk org uuid>';
--
-- The `lib/db/client.ts` wrapper makes forgetting this impossible —
-- all queries go through `withProgramContext(programId, async (tx) => ...)`.
--
-- Test: tests/integration/db/rls.test.ts verifies that queries from
-- program A cannot see program B's rows, even with explicit WHERE
-- clauses that would return them without RLS.
--
-- Reference: PLAN.md §5.2
-- ───────────────────────────────────────────────────────────────

-- Create the app schema first — the helper function lives here.
CREATE SCHEMA IF NOT EXISTS app;

-- Helper function: read the current program_id from session setting.
-- Returns NULL if not set, which causes every policy to deny by default.
CREATE OR REPLACE FUNCTION app.current_program_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
AS $$
  SELECT NULLIF(current_setting('app.program_id', true), '')::uuid;
$$;

-- ─── Enable RLS on every tenant-scoped table ───────────────────

ALTER TABLE coaches            ENABLE ROW LEVEL SECURITY;
ALTER TABLE players            ENABLE ROW LEVEL SECURITY;
ALTER TABLE opponents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons            ENABLE ROW LEVEL SECURITY;
ALTER TABLE games              ENABLE ROW LEVEL SECURITY;
ALTER TABLE film_uploads       ENABLE ROW LEVEL SECURITY;
ALTER TABLE plays              ENABLE ROW LEVEL SECURITY;
ALTER TABLE cv_tags            ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_bench         ENABLE ROW LEVEL SECURITY;
ALTER TABLE playbook_plays     ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_plans         ENABLE ROW LEVEL SECURITY;

-- NOTE: `programs` itself is NOT RLS-enforced because a user needs
-- to be able to look up their own program from their Clerk org ID
-- BEFORE the program context is set. Access to `programs` is gated
-- at the app layer: only the verified Clerk org ID matches.

-- NOTE: `prompts` is NOT RLS-enforced. Prompts are global across
-- all tenants — every program uses the same active prompt versions.

-- ─── Policies: one per table, identical shape ──────────────────

CREATE POLICY program_isolation_coaches
  ON coaches
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

CREATE POLICY program_isolation_players
  ON players
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

CREATE POLICY program_isolation_opponents
  ON opponents
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

CREATE POLICY program_isolation_seasons
  ON seasons
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

CREATE POLICY program_isolation_games
  ON games
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

CREATE POLICY program_isolation_film_uploads
  ON film_uploads
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

CREATE POLICY program_isolation_plays
  ON plays
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

CREATE POLICY program_isolation_cv_tags
  ON cv_tags
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

CREATE POLICY program_isolation_eval_bench
  ON eval_bench
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

CREATE POLICY program_isolation_playbook_plays
  ON playbook_plays
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

CREATE POLICY program_isolation_game_plans
  ON game_plans
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

-- ─── Forbidden: no superuser bypass ────────────────────────────
-- If we ever need to run migrations or maintenance, use FORCE ROW LEVEL
-- SECURITY to ensure even superusers respect policies. This blocks the
-- "oops I ran the query as postgres" class of mistakes.

ALTER TABLE coaches            FORCE ROW LEVEL SECURITY;
ALTER TABLE players            FORCE ROW LEVEL SECURITY;
ALTER TABLE opponents          FORCE ROW LEVEL SECURITY;
ALTER TABLE seasons            FORCE ROW LEVEL SECURITY;
ALTER TABLE games              FORCE ROW LEVEL SECURITY;
ALTER TABLE film_uploads       FORCE ROW LEVEL SECURITY;
ALTER TABLE plays              FORCE ROW LEVEL SECURITY;
ALTER TABLE cv_tags            FORCE ROW LEVEL SECURITY;
ALTER TABLE eval_bench         FORCE ROW LEVEL SECURITY;
ALTER TABLE playbook_plays     FORCE ROW LEVEL SECURITY;
ALTER TABLE game_plans         FORCE ROW LEVEL SECURITY;
