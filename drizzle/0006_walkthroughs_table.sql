-- Persisted scouting walkthroughs + practice scripts.
--
-- Walkthroughs are expensive to generate (one Claude call with a lot of
-- per-play context). Persisting lets the coach reopen them later without
-- paying the token cost again, and lets the UI distinguish "show me the
-- cached one" from "spend tokens to regenerate."
--
-- gameId is nullable: NULL = walkthrough scoped to every game we have
-- film for on this opponent; non-null = scoped to one specific game.
--
-- payload         shape: src/lib/scouting/insights.ts → Walkthrough
-- practice_script shape: src/lib/scouting/practice-script.ts → PracticeScript

CREATE TABLE "walkthroughs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "program_id" uuid NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "opponent_id" uuid NOT NULL REFERENCES "opponents"("id") ON DELETE CASCADE,
  "game_id" uuid,
  "payload" jsonb NOT NULL,
  "practice_script" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "walkthroughs_program_idx" ON "walkthroughs" ("program_id");
CREATE INDEX "walkthroughs_lookup_idx" ON "walkthroughs" ("program_id", "opponent_id", "created_at");

-- Tenancy isolation matches every other tenant-scoped table.
ALTER TABLE "walkthroughs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "walkthroughs" FORCE ROW LEVEL SECURITY;

CREATE POLICY program_isolation_walkthroughs
  ON "walkthroughs"
  FOR ALL
  USING (program_id = app.current_program_id())
  WITH CHECK (program_id = app.current_program_id());
