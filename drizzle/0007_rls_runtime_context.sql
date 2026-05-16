-- ───────────────────────────────────────────────────────────────
-- RLS runtime context hardening
--
-- The app now sets app.program_id inside every withProgramContext()
-- transaction. This migration completes tenant policies for tables
-- added after the original RLS migration and adds a narrow join-code
-- lookup path for player auth.
-- ───────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_program_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
AS $$
  SELECT NULLIF(current_setting('app.program_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.current_join_code()
  RETURNS text
  LANGUAGE sql
  STABLE
AS $$
  SELECT NULLIF(current_setting('app.join_code', true), '');
$$;

-- Core tenant tables. This migration intentionally re-applies the original
-- isolation policies because the historical manual RLS file is not part of
-- Drizzle's journal on every branch.
ALTER TABLE coaches              ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaches              FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_isolation_coaches ON coaches;
CREATE POLICY program_isolation_coaches
  ON coaches
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

ALTER TABLE players              ENABLE ROW LEVEL SECURITY;
ALTER TABLE players              FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_isolation_players ON players;
CREATE POLICY program_isolation_players
  ON players
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

ALTER TABLE opponents            ENABLE ROW LEVEL SECURITY;
ALTER TABLE opponents            FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_isolation_opponents ON opponents;
CREATE POLICY program_isolation_opponents
  ON opponents
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

ALTER TABLE seasons              ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons              FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_isolation_seasons ON seasons;
CREATE POLICY program_isolation_seasons
  ON seasons
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

ALTER TABLE games                ENABLE ROW LEVEL SECURITY;
ALTER TABLE games                FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_isolation_games ON games;
CREATE POLICY program_isolation_games
  ON games
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

ALTER TABLE film_uploads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE film_uploads         FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_isolation_film_uploads ON film_uploads;
CREATE POLICY program_isolation_film_uploads
  ON film_uploads
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

ALTER TABLE plays                ENABLE ROW LEVEL SECURITY;
ALTER TABLE plays                FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_isolation_plays ON plays;
CREATE POLICY program_isolation_plays
  ON plays
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

ALTER TABLE cv_tags              ENABLE ROW LEVEL SECURITY;
ALTER TABLE cv_tags              FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_isolation_cv_tags ON cv_tags;
CREATE POLICY program_isolation_cv_tags
  ON cv_tags
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

ALTER TABLE eval_bench           ENABLE ROW LEVEL SECURITY;
ALTER TABLE eval_bench           FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_isolation_eval_bench ON eval_bench;
CREATE POLICY program_isolation_eval_bench
  ON eval_bench
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

ALTER TABLE playbook_plays       ENABLE ROW LEVEL SECURITY;
ALTER TABLE playbook_plays       FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_isolation_playbook_plays ON playbook_plays;
CREATE POLICY program_isolation_playbook_plays
  ON playbook_plays
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

ALTER TABLE game_plans           ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_plans           FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_isolation_game_plans ON game_plans;
CREATE POLICY program_isolation_game_plans
  ON game_plans
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

-- Player join-code lookup: only the exact, unexpired code set on the
-- transaction can be read without app.program_id.
DROP POLICY IF EXISTS player_join_code_lookup ON players;
CREATE POLICY player_join_code_lookup
  ON players
  FOR SELECT
  USING (
    join_code IS NOT NULL
    AND join_code_expires_at > now()
    AND join_code = app.current_join_code()
  );

-- Tables introduced after the original RLS migration.
ALTER TABLE player_detections       ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_detections       FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_isolation_player_detections ON player_detections;
CREATE POLICY program_isolation_player_detections
  ON player_detections
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

ALTER TABLE game_plan_plays         ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_plan_plays         FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_isolation_game_plan_plays ON game_plan_plays;
CREATE POLICY program_isolation_game_plan_plays
  ON game_plan_plays
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

ALTER TABLE game_plan_assignments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_plan_assignments   FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_isolation_game_plan_assignments ON game_plan_assignments;
CREATE POLICY program_isolation_game_plan_assignments
  ON game_plan_assignments
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

ALTER TABLE suggestion_dismissals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestion_dismissals   FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_isolation_suggestion_dismissals ON suggestion_dismissals;
CREATE POLICY program_isolation_suggestion_dismissals
  ON suggestion_dismissals
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

ALTER TABLE sessions                ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions                FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_isolation_sessions ON sessions;
CREATE POLICY program_isolation_sessions
  ON sessions
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

ALTER TABLE session_plays           ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_plays           FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_isolation_session_plays ON session_plays;
CREATE POLICY program_isolation_session_plays
  ON session_plays
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

ALTER TABLE player_session_results  ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_session_results  FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_isolation_player_session_results ON player_session_results;
CREATE POLICY program_isolation_player_session_results
  ON player_session_results
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

ALTER TABLE scenarios               ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenarios               FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_isolation_scenarios ON scenarios;
CREATE POLICY program_isolation_scenarios
  ON scenarios
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

ALTER TABLE film_grades             ENABLE ROW LEVEL SECURITY;
ALTER TABLE film_grades             FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_isolation_film_grades ON film_grades;
CREATE POLICY program_isolation_film_grades
  ON film_grades
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

ALTER TABLE collections             ENABLE ROW LEVEL SECURITY;
ALTER TABLE collections             FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS collections_tenant_isolation ON collections;
DROP POLICY IF EXISTS program_isolation_collections ON collections;
CREATE POLICY program_isolation_collections
  ON collections
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());

ALTER TABLE collection_plays        ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_plays        FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_isolation_collection_plays ON collection_plays;
CREATE POLICY program_isolation_collection_plays
  ON collection_plays
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM collections
      WHERE collections.id = collection_plays.collection_id
        AND collections.program_id = app.current_program_id()
    )
    AND EXISTS (
      SELECT 1
      FROM plays
      WHERE plays.id = collection_plays.play_id
        AND plays.program_id = app.current_program_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM collections
      WHERE collections.id = collection_plays.collection_id
        AND collections.program_id = app.current_program_id()
    )
    AND EXISTS (
      SELECT 1
      FROM plays
      WHERE plays.id = collection_plays.play_id
        AND plays.program_id = app.current_program_id()
    )
  );

ALTER TABLE walkthroughs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE walkthroughs            FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS program_isolation_walkthroughs ON walkthroughs;
CREATE POLICY program_isolation_walkthroughs
  ON walkthroughs
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());
