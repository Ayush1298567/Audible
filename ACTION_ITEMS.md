# Action Items

This is the single source of truth for what you need to do manually.
I will keep this file updated as we continue.

## Status Legend

- [ ] Required, not done yet
- [x] Done
- [-] Optional / only if you want that capability

---

## Immediate Required Actions

- [ ] Set `PLAYER_SESSION_SECRET_CURRENT` in Vercel envs (production/preview/development).
  - Use a strong random secret.
  - Required for signed player session tokens.

- [ ] Provision Upstash Redis and set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` in Vercel envs (production/preview/development).
  - Required for distributed rate limiting on join code auth.
  - Without these, rate limiting falls back to in-memory per instance.

- [ ] Redeploy after setting env vars.
  - New token/session security and distributed throttling only apply after deploy.

---

## Clerk (auth) & program linkage

- [ ] In the [Clerk Dashboard](https://dashboard.clerk.com/), ensure your production application matches the keys in Vercel (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and any webhook secrets you use).

- [ ] Use an **organization** (team) in Clerk for each real football program, and sign in as a coach who belongs to that org.

- [ ] **Link a program to the org** (first time): call `POST /api/programs` while signed in as head coach (or use whatever UI flow you add later). The API returns **409** if that org already has a program — then use the existing program id everywhere.

- [ ] **Roles**: `head_coach` is seeded when the program is created. Other coaches need appropriate roles in your DB (`coach` / `coordinator`) for guarded routes; align this with how you invite staff in Clerk and mirror into `program_staff` if you add that flow.

- [ ] **Player join codes**: create or rotate join codes in your admin/coach UI or DB so players can authenticate; verify join + `x-player-token` flows in production.

---

## Database & migrations

- [ ] From the `audible/` app directory, run your usual Drizzle workflow against the target database (e.g. `drizzle-kit push` or migrate scripts your repo documents) whenever you pull new schema changes.
  - Confirm tables exist: `game_plan_assignments`, `sessions` / `session_plays` for published film, CV-related columns, etc.

- [ ] **Neon / Postgres**: provision the database, set `DATABASE_URL` (and pooling URL if you split them) in all Vercel environments, then `vercel env pull .env.local` for local dev.

---

## AI, CV, and game breakdown (Google / Gateway)

- [ ] Set **`GOOGLE_API_KEY`** or **`GEMINI_API_KEY`** (whichever your deployment reads) in Vercel for routes that call Gemini (game boundary scan, suggestions, etc.).

- [ ] If you use **Vercel AI Gateway**, set `AI_GATEWAY_API_KEY` and pick model ids from the live catalog: `curl https://ai-gateway.vercel.sh/v1/models` (do not rely on stale model strings).

- [ ] **Prompts / versioning**: first deploy seeds default rows in `prompts` and active prompt wiring; if you customize prompts in the DB, document your ids or use the app’s admin path if you add one.

---

## Blob (film / play clips)

- [ ] Create a Vercel Blob store and set **`BLOB_READ_WRITE_TOKEN`** (or the env name your `play-clip-url` helper expects) in production/preview/development.
  - Required for time-limited read URLs for player-accessible clips when clips live in Blob.

---

## Coach workflows (so the player app has data)

### Practice film (player `type=film`)

- [ ] Record or upload film, create **practice sessions**, attach plays, then **publish** the session (API or dashboard) so `sessions` is published.
  - Players only receive film from **published** sessions; unpublished stays coach-only.

### Game plan & board (player `type=gameplan`)

- [ ] On **The Board**, build cards for the week, then use **Push install to players** (position group + install notes). That writes `game_plan_assignments` with all current board card ids.
  - Requires **coordinator** (or higher) role on the API.
- [ ] A **head coach** must **Publish** the game plan so the plan is marked published for staff/PDF flow; confirm your player app also checks `publishStatus` if you gate installs on publish.

### Field / tendencies / CV

- [ ] Run ingest + CV pipelines as your product flow defines so `tendencies` and Field views have data (coverage shell, pressure, etc.).

---

## Vercel Manual Runbook (You run these)

- [ ] Ensure Vercel CLI is up to date.
  - `npm i -g vercel@latest` (or `pnpm add -g vercel@latest`)

- [ ] Link project in repo root if needed.
  - `vercel link --yes --project audible`

- [ ] Add player session secret to all environments.
  - `vercel env add PLAYER_SESSION_SECRET_CURRENT production`
  - `vercel env add PLAYER_SESSION_SECRET_CURRENT preview`
  - `vercel env add PLAYER_SESSION_SECRET_CURRENT development`

- [ ] (Rotation window only) Add previous secret(s) to all environments.
  - `vercel env add PLAYER_SESSION_PREVIOUS_SECRET production`
  - `vercel env add PLAYER_SESSION_PREVIOUS_SECRET preview`
  - `vercel env add PLAYER_SESSION_PREVIOUS_SECRET development`
  - If you have multiple old keys, use `PLAYER_SESSION_PREVIOUS_SECRETS` as comma-separated values instead.

- [ ] Provision Upstash Redis via Marketplace.
  - Dashboard path: Vercel Project -> Integrations -> Add Integration -> Upstash for Redis
  - Or CLI: `vercel integration add upstash/upstash-kv`
  - Ensure env vars are connected to this project in all three environments.

- [ ] Confirm env vars exist.
  - `vercel env ls`

- [ ] Pull env vars locally and restart local server.
  - `vercel env pull .env.local`

- [ ] Deploy production.
  - `vercel --prod`

- [ ] Post-deploy quick checks.
  - Confirm `/api/player-auth` returns `429` + `Retry-After` under repeated bad attempts.
  - Confirm player token invalidates when player status changes away from `available`.
  - Smoke-test **Board → Push install** and **player-data** with a real player token.

---

## Recommended Security/Operations Actions

- [ ] Secret rotation setup (recommended):
  - Set `PLAYER_SESSION_PREVIOUS_SECRET` (or `PLAYER_SESSION_PREVIOUS_SECRETS`) during rotation windows.
  - Remove previous secrets after your grace period.

- [ ] Verify player revocation behavior in production:
  - Change a player status away from `available`.
  - Confirm existing player session is rejected and user is forced to rejoin.

- [ ] Verify rate-limit behavior in production:
  - Trigger repeated bad join-code attempts.
  - Confirm endpoint returns `429` and `Retry-After`.

---

## Optional Improvements (Can Do Next)

- [-] Add structured security telemetry for rate-limit hits and suspicious auth patterns.
- [-] Add coach-triggered player session revocation endpoint/workflow.
- [-] Add Redis-backed metrics dashboard for auth abuse monitoring.

---

## Verification Commands (for your reference)

These are currently passing in local CI:

- `bun run typecheck`
- `bun run lint`
- `bun run test`
- `bun run test:evals`

---

## Notes

- Player auth now uses signed, expiring tokens with server-side verification.
- Token verification supports key rotation.
- Session invalidation checks include player row mutation and join-code expiry changes.
- Redis-backed distributed join-code rate limiting is implemented and auto-activates when Upstash env vars are set.
- **Game plan assignments** store `relatedPlayIds` as **board card ids** (`game_plan_plays.id`). The player API accepts both legacy playbook UUIDs and card ids when resolving installs.
