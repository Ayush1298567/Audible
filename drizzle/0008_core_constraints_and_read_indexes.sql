-- Core uniqueness constraints and read-path indexes.
--
-- These match app-level assumptions for staff membership, season identity,
-- game-plan assignment replacement, collection membership, and the player app /
-- scouting query shapes used on hot paths.

CREATE UNIQUE INDEX IF NOT EXISTS "coaches_program_clerk_user_uidx"
  ON "coaches" ("program_id", "clerk_user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "seasons_program_year_uidx"
  ON "seasons" ("program_id", "year");

CREATE UNIQUE INDEX IF NOT EXISTS "game_plan_assignments_plan_position_situation_uidx"
  ON "game_plan_assignments" ("game_plan_id", "position_group", "situation");

CREATE UNIQUE INDEX IF NOT EXISTS "collection_plays_collection_play_uidx"
  ON "collection_plays" ("collection_id", "play_id");

CREATE INDEX IF NOT EXISTS "session_plays_program_session_play_idx"
  ON "session_plays" ("program_id", "session_id", "play_id");

CREATE INDEX IF NOT EXISTS "player_session_results_program_player_completed_idx"
  ON "player_session_results" ("program_id", "player_id", "completed");

CREATE INDEX IF NOT EXISTS "film_grades_program_player_idx"
  ON "film_grades" ("program_id", "player_id");

CREATE INDEX IF NOT EXISTS "plays_program_game_status_idx"
  ON "plays" ("program_id", "game_id", "status");

CREATE INDEX IF NOT EXISTS "plays_program_formation_type_situation_idx"
  ON "plays" ("program_id", "formation", "play_type", "down", "distance_bucket");

CREATE INDEX IF NOT EXISTS "cv_tags_program_play_type_surfaced_idx"
  ON "cv_tags" ("program_id", "play_id", "tag_type", "is_surfaced");
