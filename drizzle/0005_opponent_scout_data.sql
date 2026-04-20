-- Add public-scouting-data columns to opponents.
--
-- COLLEGE PROGRAMS ONLY — never populated for HS opponents (minors).
-- Used by the walkthrough hallucination guards to validate jersey
-- numbers Claude cites against the actual opponent roster.
--
-- Shape of scout_data: CollegeOpponentScoutData from
-- src/lib/scouting/college-scout.ts — { team, roster, headCoach, fetchedAt }.

ALTER TABLE "opponents" ADD COLUMN "scout_data" jsonb;
ALTER TABLE "opponents" ADD COLUMN "scout_data_fetched_at" timestamp with time zone;
