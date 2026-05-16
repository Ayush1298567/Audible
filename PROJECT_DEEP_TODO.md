# Audible Deep Execution TODO

This is the engineering backlog I am using for broad, top-to-bottom project work.
`ACTION_ITEMS.md` remains the manual operator runbook. This file is code/product work.

## Priority Legend

- P0: Blocks running, deploying, or trusting the app.
- P1: Core product capability for a coach/player workflow.
- P2: Quality, speed, polish, maintainability.
- P3: Later product expansion.

## Current Execution Slice

- [x] Fix RLS runtime context so `withProgramContext` uses transaction-local settings.
- [x] Add join-code scoped player lookup policy.
- [x] Make seed/dev data paths respect RLS.
- [x] Restore lint/type/test/build to green.
- [x] Fix migration hygiene so `bun run db:migrate` has every journaled SQL file.
- [x] Make `bun run test:db` actually run the DB integration config.
- [x] Harden production player-token secrets so missing envs cannot silently use the dev secret.
- [x] Add a migration metadata test so missing SQL files are caught by unit CI.
- [x] Expand RLS hardening migration to cover every current tenant table, not only late-added tables.
- [x] Update env docs for player session, Upstash, Gemini, and Roboflow vars.
- [x] Update README/BOOTSTRAP references away from stale Phase 0 RLS instructions.
- [x] Remove the Next/Turbopack workspace-root warning without breaking dev CSS resolution.
- [x] Add roster CSV validation preview before insert in first-run setup.
- [x] Add duplicate jersey warnings in setup and roster player entry.
- [x] Make `bun run db:migrate` load `.env.local` through `drizzle.config.ts`.

## P0 - Trust, Data Isolation, And Runtime Safety

- [ ] Apply and verify `drizzle/0007_rls_runtime_context.sql` against the intended Neon branch.
  - 2026-05-13: blocked locally by Neon connection reset before TLS on both pooled and unpooled hosts. `bun run db:migrate` now loads `.env.local`; rerun once network/database access is healthy.
- [x] Confirm every tenant-scoped table has `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.
- [x] Confirm every tenant-scoped table has both `USING` and `WITH CHECK` isolation.
- [x] Add a DB integration test for cross-program SELECT isolation.
- [x] Add a DB integration test for cross-program INSERT rejection.
- [x] Add a DB integration test for unscoped tenant-table reads returning zero rows.
- [x] Add a DB integration test for player join-code lookup reading only the exact unexpired player.
- [x] Add a DB integration test that expired join codes cannot authenticate.
- [x] Decide whether DB tests should require `RUN_DB_TESTS=1` or always run on CI Neon branches.
- [x] Make CI fail if `test:db` is skipped on branches with DB credentials.
- [x] Add a script that checks migration journal entries against files on disk.
- [x] Decide what to do with legacy `0001_enable_rls.sql`: document as superseded reference material, not a journaled migration.
- [x] Decide whether `scripts/push-schema.ts` stays supported or is replaced by Drizzle migrate only: Drizzle migrate is supported; `push-schema.ts` is legacy/emergency-only.
- [x] If `push-schema.ts` stays, parse SQL comments/breakpoints correctly.
- [x] If `push-schema.ts` stays, fail the process when a non-idempotent migration statement fails.
- [x] Add a production guard that rejects player-token creation without `PLAYER_SESSION_SECRET_CURRENT`.
- [x] Add a production guard that excludes the dev player-token secret from verification.
- [x] Add token tests for current secret, previous secret, comma-separated previous secrets, tamper, expiry, and prod missing-secret.
- [x] Add join-code input tests for trim, uppercase, too short, too long, invalid body, and rate-limit responses.
- [x] Make join-code validation trim before length checks.
- [x] Confirm `PLAYER_SESSION_SECRET` legacy env is documented as deprecated.
- [x] Add structured telemetry for auth rate-limit hits.
- [x] Add structured telemetry for invalid join-code attempts without logging the raw code.
- [x] Add a player-session revocation endpoint or coach workflow.
- [x] Verify existing player tokens fail when a player status changes away from `available`.
- [x] Verify existing player tokens fail when the player row `updatedAt` changes.
- [x] Verify existing player tokens fail when the player join-code expiry changes.
- [x] Confirm all API routes call centralized auth guards before tenant DB access.
- [x] Add a static test for direct tenant-table `db.select/insert/update/delete` usage outside approved files.
- [x] Add a static test that route handlers import `beginSpan`.
- [x] Add a static test that write routes handle `AuthError` with the original status.
- [x] Add a dependency/env check endpoint that reports missing non-secret configuration without exposing values.

## P0 - Migration And Database Shape

- [ ] Confirm new schema can migrate from an empty database.
- [ ] Confirm new schema can migrate from the current dev Neon database.
- [x] Confirm `drizzle/meta/_journal.json` order matches file order and intended dependency order.
- [x] Fix or intentionally preserve the `0004_chunky_union_jack` vs `0004_collections_and_overrides` mismatch.
- [x] Add RLS policies for `collection_plays` that validate both owning collection and play belong to the current program.
- [x] Audit nullable foreign keys for route assumptions; preserved intentional nulls and fixed player session result auth found during the audit.
- [x] Add unique constraints where app logic assumes uniqueness:
  - [x] `coaches(program_id, clerk_user_id)`
  - [x] `seasons(program_id, year)`
  - [x] `games(program_id, opponent_id, played_at)` intentionally not constrained; game `id` is the identity.
  - [x] `game_plan_assignments(game_plan_id, position_group, situation)` if publish overwrites.
  - [x] `collection_plays(collection_id, play_id)`
- [x] Add indexes for player app read paths:
  - [x] `session_plays(program_id, session_id, play_id)`
  - [x] `player_session_results(program_id, player_id, completed)`
  - [x] `film_grades(program_id, player_id)`
- [x] Add indexes for scouting paths:
  - [x] `plays(program_id, game_id, status)`
  - [x] `plays(program_id, formation, play_type, down, distance_bucket)`
  - [x] `cv_tags(program_id, play_id, tag_type, is_surfaced)`
- [x] Confirm `prompts` is intentionally global and cannot leak tenant data.
- [x] Add `updated_at` maintenance strategy: app-side updates, trigger, or accepted manual updates.
- [x] Decide whether `join_code` uniqueness across all programs is acceptable or should be program-scoped.

## P1 - Coach Core Workflow

- [ ] Make first-run setup obvious: org selected, program created, season created, roster seeded/imported.
- [x] Add coach-facing join-code generation/rotation UI.
- [x] Add roster CSV import validation preview before insert.
- [x] Add duplicate jersey warning inside the same program.
- [ ] Add staff invite/linking workflow instead of requiring manual Clerk user IDs.
- [ ] Add role downgrade guard so the last head coach cannot remove themself.
- [ ] Add a clean empty state for every dashboard page.
- [ ] Add a demo-data reset control that is impossible to confuse with production data.
- [ ] Add a health panel that shows DB, Blob, AI, Redis, and Clerk readiness.
- [x] Update README status from stale Phase 0 to current runnable product state.
- [x] Update BOOTSTRAP to match the current migration and env reality.

## P1 - Film Import And Processing

- [ ] Verify CSV parser handles real Hudl column variants.
- [ ] Verify XML parser handles SportsCode exports with missing/extra labels.
- [ ] Add fixture coverage for unknown extra CSV columns.
- [ ] Add fixture coverage for missing required CSV columns with row-level error messages.
- [ ] Add fixture coverage for off-by-one CSV/XML count mismatch.
- [ ] Add fixture coverage for XML timestamps beyond MP4 duration.
- [ ] Add fixture coverage for zero-duration XML segments.
- [ ] Add idempotency test for duplicate upload key.
- [ ] Confirm `idempotency_key` cannot collide across program/game boundaries.
- [ ] Confirm ffmpeg split errors mark only the failed play as `clip_failed`.
- [ ] Add queue/workflow retry visibility in the film upload UI.
- [ ] Add per-play status counts: awaiting clip, awaiting CV, ready, failed.
- [ ] Add upload cancel/retry affordance.
- [ ] Confirm Blob read URLs are time-limited for player-facing clips.
- [ ] Add a signed-url fallback error state for expired or missing clips.

## P1 - Scouting And Tendency Product

- [ ] Verify tendency queries use sample-size confidence labels everywhere.
- [ ] Verify every tendency card links back to exact supporting clips.
- [ ] Add tests for down/distance/field-zone tendency buckets.
- [ ] Add tests for drive-sequence analysis.
- [ ] Add tests for same opponent across multiple seasons.
- [ ] Add UI distinction between this-year film and previous-year carryover.
- [ ] Add low-sample warning copy that coaches can trust quickly.
- [ ] Cache generated walkthroughs and practice scripts by opponent/game scope.
- [ ] Add regenerate controls with visible cost/latency warning.
- [ ] Add hallucination guard tests for scouting report player/jersey references.
- [ ] Add "no real data yet" demo mode that clearly labels generated content.

## P1 - Game Plan And Player Delivery

- [ ] Verify Board publish writes assignments with board-card IDs consistently.
- [ ] Verify player app accepts only published game plans if that is the intended rule.
- [ ] Add tests for legacy playbook UUIDs mapping to board-card IDs.
- [ ] Add tests for coordinator vs assistant publish permissions.
- [ ] Add tests for head coach publish-only actions.
- [ ] Add UI confirmation for publishing and unpublishing.
- [ ] Add immutable snapshot behavior for PDFs generated at publish time.
- [ ] Add player assignment preview before push.
- [ ] Add position-group validation for assignments.
- [ ] Add "what changed since last publish" summary.
- [ ] Add audit log for publish, unpublish, push install, and assignment edits.

## P1 - Player App

- [ ] Add player-home route that defaults to today's assignment.
- [ ] Add player join-code redemption tests.
- [ ] Add player film assignment empty state.
- [ ] Add player game-plan empty state.
- [ ] Add completion tracking for film-review sessions.
- [ ] Add recognition challenge interaction tests.
- [ ] Add mobile viewport QA for join, film, game plan, and progress.
- [ ] Add token refresh/rejoin UX when a session is invalidated.
- [ ] Add copy for revoked access that tells the player to ask a coach.
- [ ] Verify player APIs never accept coach credentials as a substitute.

## P1 - Command Bar And AI Tooling

- [ ] Add golden command-bar evals for the top 20 coach queries.
- [ ] Add destructive action confirmation for command-bar mutations.
- [ ] Add tool-call schema tests for every command-bar tool.
- [ ] Add "show me the clips" response shape with evidence links.
- [ ] Add assistant fallback when the query is outside supported football/data scope.
- [ ] Add trace IDs linking command-bar requests to DB queries and LLM outputs.
- [ ] Add prompt versioning for command-bar reasoning prompts if not already covered by `prompts`.

## P1 - CV And Computer Vision

- [ ] Decide current v1 CV scope: single-model Claude vs true ensemble.
- [ ] If true ensemble, wire OpenAI/GPT vision alongside Claude and gate by agreement.
- [ ] Add circuit breaker for model-provider 5xx bursts.
- [ ] Add per-program concurrency limits for CV work.
- [ ] Add per-program spend caps and hard-stop behavior.
- [ ] Add dead-letter state for plays that fail all retries.
- [ ] Add eval bench writes for model disagreement and low confidence.
- [ ] Add labeled held-out fixture support.
- [ ] Add a clear production flag per CV task.
- [ ] Verify UI only surfaces tags above task-specific confidence thresholds.
- [ ] Add visual overlay rendering for player/cushion/depth annotations.

## P2 - Frontend Quality

- [ ] Run full browser QA across desktop and mobile.
- [ ] Fix any clipped text in dashboard sidebars, cards, and compact controls.
- [ ] Verify all tables have mobile alternatives or horizontal scroll.
- [ ] Verify all modals fit at 390px mobile width.
- [ ] Verify all icon-only controls have accessible labels/tooltips.
- [ ] Remove visual one-off styles that should use shared UI components.
- [ ] Add loading states for every route-level data fetch.
- [ ] Add error states with retry actions for every major page.
- [ ] Add skeleton states for hub, film, board, scouting, roster, practice, and player pages.
- [ ] Audit color contrast against the actual dark theme.
- [ ] Replace stale marketing-page claims with current product state.
- [ ] Verify PDF buttons disable while generating.

## P2 - Developer Experience

- [x] Make `bun run ci` include `test:db` only when DB test credentials are intentionally present.
- [x] Add `bun run verify` for local full pass: typecheck, lint, unit, eval schema, build.
- [x] Add `bun run migrate:check` to validate journal/files without touching DB.
- [x] Add `bun run env:check` that validates required env names without printing secrets.
- [ ] Add a short "local happy path" script: migrate, seed, start dev, open `/dev`.
- [x] Make Drizzle CLI commands load `.env.local` without manual shell sourcing.
- [x] Document the expected dev bypass variables.
- [x] Document whether local DB should be pooled or unpooled.
- [ ] Add a test fixture factory for programs/games/plays instead of hand-coded inserts.
- [ ] Add route-handler test helpers for auth guard mocking.
- [ ] Add a conventional place for product decisions made during sessions.

## P2 - Performance And Reliability

- [ ] Measure hub load time with seed data.
- [ ] Measure film page load time with 500 plays.
- [ ] Add DB query limits to every list endpoint.
- [ ] Add pagination/cursor support for film plays and large rosters.
- [ ] Add request timeouts around third-party AI/ESPN/Blob calls.
- [ ] Add retry/backoff only where operations are idempotent.
- [ ] Add circuit breaker around ESPN roster fetches.
- [ ] Cache public college roster fetches with stale-while-revalidate behavior.
- [ ] Add memory/temporary-file cleanup checks for ffmpeg/sandbox routes.
- [ ] Add maximum upload size validation before accepting video work.

## P2 - Security And Abuse

- [ ] Audit all endpoints for user-controlled `programId` and centralized guard enforcement.
- [ ] Add rate limits to expensive AI/CV/scouting routes.
- [ ] Add rate limits to ingest/upload routes.
- [ ] Add CSRF posture decision for same-site coach mutations.
- [ ] Add strict response shapes that never expose stack traces.
- [ ] Confirm third-party URLs cannot trigger SSRF in video/YouTube import paths.
- [ ] Confirm player clip URLs cannot expose arbitrary Blob keys across programs.
- [ ] Add logging redaction for tokens, join codes, API keys, and auth headers.
- [ ] Add secret scanning to CI if GitHub Advanced Security is unavailable.

## P3 - Complete Product Expansion

- [ ] Multi-year opponent carryover reports.
- [ ] Opponent playbook extraction for offense and defense.
- [ ] Manual video annotation tools saved per clip.
- [ ] Auto-generated visual annotations from CV outputs.
- [ ] Film grading workflow for position coaches.
- [ ] Practice Builder session templates.
- [ ] Recognition Challenge player mode.
- [ ] Decision Drill player mode.
- [ ] The Field simulation scenario builder.
- [ ] Position-specific simulation modes for QB, RB, WR/TE, OL, DL, LB, CB, safety.
- [ ] Multi-device walkthrough synchronization.
- [ ] Web push notifications for player assignments.
- [ ] Weekly awards and grade trends.
- [ ] Coach-facing budget/cost dashboard.

## Evidence To Collect Before First Real Coach

- [ ] Empty DB migrate succeeds.
- [ ] Seed succeeds.
- [ ] Dev route creates realistic demo data.
- [ ] Coach can sign in with Clerk org selected.
- [ ] Coach can create program and season.
- [ ] Coach can add/import roster.
- [ ] Coach can create or rotate player join codes.
- [ ] Player can redeem join code on mobile.
- [ ] Coach can upload or import film.
- [ ] Coach can view plays in Film Room.
- [ ] Coach can create scouting walkthrough.
- [ ] Coach can generate practice script PDF.
- [ ] Coach can build/publish Board game plan.
- [ ] Player can view assigned film and game plan.
- [ ] Production deploy health endpoint returns 200.
- [ ] Production repeated bad join-code attempts return 429.
- [ ] Production player token revocation works.
