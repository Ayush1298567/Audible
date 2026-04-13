-- ───────────────────────────────────────────────────────────────
-- Phase 1b: Collections + Coach tag overrides
-- ───────────────────────────────────────────────────────────────

-- Coach can override any tag on a play (2-tap correction)
ALTER TABLE "plays" ADD COLUMN "coach_override" jsonb;

-- Named clip collections
CREATE TABLE IF NOT EXISTS "collections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "program_id" uuid NOT NULL REFERENCES "programs"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "collections_program_idx" ON "collections" ("program_id");

CREATE TABLE IF NOT EXISTS "collection_plays" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "collection_id" uuid NOT NULL REFERENCES "collections"("id") ON DELETE CASCADE,
  "play_id" uuid NOT NULL REFERENCES "plays"("id") ON DELETE CASCADE,
  "added_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "collection_plays_collection_idx" ON "collection_plays" ("collection_id");
CREATE INDEX IF NOT EXISTS "collection_plays_play_idx" ON "collection_plays" ("play_id");

-- RLS on new tables
ALTER TABLE "collections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "collections" FORCE ROW LEVEL SECURITY;

CREATE POLICY "collections_tenant_isolation" ON "collections"
  USING ("program_id" = current_setting('app.program_id', true)::uuid);

-- collection_plays doesn't have program_id directly, so we join through collections
-- For simplicity, no RLS on the join table — it's always accessed via collection_id
-- which is already RLS-gated.
