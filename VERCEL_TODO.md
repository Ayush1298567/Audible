# Vercel TODO

Codex must not run these commands right now. The user is not logged in to Vercel
in this environment. This file is the later manual runbook for Vercel-only work.

## Why This Matters

Audible relies on Vercel-managed project wiring for production and preview:
environment variables, Neon, Clerk, Blob, AI Gateway, Upstash Redis, and deploy
verification. Local code can build without these, but real coach/player flows
need them configured before deployment can be trusted.

## Required Environment Variables

Set these in Vercel for production, preview, and development unless noted.

- `DATABASE_URL`: Neon Postgres connection string.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clerk browser key.
- `CLERK_SECRET_KEY`: Clerk server key.
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`: `/sign-in`.
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL`: `/sign-up`.
- `PLAYER_SESSION_SECRET_CURRENT`: strong random secret for player session tokens.
- `PLAYER_SESSION_PREVIOUS_SECRET`: optional, only during rotation.
- `PLAYER_SESSION_PREVIOUS_SECRETS`: optional comma-separated rotation list.
- `PLAYER_SESSION_SECRET`: deprecated legacy name. Do not set it for new
  environments; production token creation requires `PLAYER_SESSION_SECRET_CURRENT`.
- `UPSTASH_REDIS_REST_URL`: Upstash Redis REST URL for distributed rate limits.
- `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis REST token.
- `BLOB_READ_WRITE_TOKEN`: Vercel Blob token for film/clips/PDF storage.
- `AI_GATEWAY_API_KEY`: Vercel AI Gateway key, if using Gateway routing.
- `ANTHROPIC_API_KEY`: fallback/direct Anthropic access if Gateway is not used.
- `OPENAI_API_KEY`: vision ensemble secondary provider when enabled.
- `GOOGLE_API_KEY` or `GEMINI_API_KEY`: Gemini video/boundary analysis.
- `ROBOFLOW_API_KEY`: optional player-detection path.
- `RESEND_API_KEY`: transactional email.
- `RESEND_FROM_EMAIL`: sender address.
- `SPEND_CAP_VISION_USD_PER_PROGRAM_PER_DAY`: default `5`.
- `VISION_CONCURRENCY_PER_PROGRAM`: default `5`.
- `FLAG_CV_COVERAGE_SHELL`: default `false` until benchmarked.
- `FLAG_CV_PRESSURE_TYPE`: default `false` until benchmarked.
- `FLAG_CV_PRESSURE_SOURCE`: default `false` until benchmarked.
- `FLAG_CV_COVERAGE_DISGUISE`: default `false` until benchmarked.
- `FLAG_CV_ALIGNMENT_DEPTH`: default `false` until benchmarked.
- `SENTRY_DSN`: optional production error tracking.

## Later Manual Commands

Run these only after logging in locally with the correct Vercel account/team.

```bash
npm i -g vercel@latest
vercel link --yes --project audible
vercel env pull .env.local
bun run db:migrate
bun run ci
bun run build
vercel --prod
```

For env additions, use either the Vercel dashboard or these later CLI commands:

```bash
vercel env add PLAYER_SESSION_SECRET_CURRENT production
vercel env add PLAYER_SESSION_SECRET_CURRENT preview
vercel env add PLAYER_SESSION_SECRET_CURRENT development
vercel env add UPSTASH_REDIS_REST_URL production
vercel env add UPSTASH_REDIS_REST_TOKEN production
vercel env add BLOB_READ_WRITE_TOKEN production
vercel env add AI_GATEWAY_API_KEY production
```

Repeat env additions for preview/development where the dashboard integration did
not propagate values automatically.

## Verification After Deploy

- `GET /api/health` returns `200`.
- `GET /api/health/dependencies` returns `ok` after required production env vars
  are configured, and never prints secret values.
- `POST /api/player-auth` returns `429` plus `Retry-After` after repeated bad
  join-code attempts.
- Player join-code redemption works with a real unexpired player code.
- Existing player token fails after player status changes away from `available`.
- Existing player token fails after player `updated_at` or join-code expiry
  changes.
- Coach creates or accesses a Clerk-org-linked program.
- Coach can push a Board install to a position group.
- Player can load `type=gameplan` through `/api/player-data` with `x-player-token`.
- Blob-backed clips resolve only through signed/authorized read paths.
- Production logs show `player_auth_rate_limited` and
  `player_auth_invalid_join_code` metrics without raw join-code values.
