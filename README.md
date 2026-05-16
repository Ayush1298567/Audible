# Audible

Football intelligence platform for high school and D-II / D-III college football programs. Ingests Hudl exports, adds a vision-layer that detects coverage and pressure tags Hudl doesn't provide, computes tendencies with clip evidence, and surfaces everything through a coach-facing web app with a natural-language command bar, an AI-assisted game plan builder, and a player mental-rep training experience.

See `../PLAN.md` and `../TEST-PLAN.md` in the parent directory for the full build plan, architectural decisions, and testing strategy. This README covers running the code.

---

## Status

**Active prototype.** The app now has coach/dashboard routes, Clerk-backed program
context, dev auth bypass, roster/staff management, film ingest/import paths,
scouting walkthroughs, practice scripts, PDFs, the Board/game-plan flow, player
join-code auth, player film/game-plan/progress APIs, CV/tendency helpers, and
realistic demo seed data.

Current hardening work is tracked in `PROJECT_DEEP_TODO.md`. Manual deploy/env
steps live in `ACTION_ITEMS.md` and `VERCEL_TODO.md`.

---

## Local development

Vercel CLI/deploy work is deferred while the user is not logged in. Do not run
`vercel`, `bunx vercel`, or `npx vercel` from this Codex session; later manual
steps live in `VERCEL_TODO.md`.

### Prerequisites

- **Bun** `1.3.10+` — [install](https://bun.sh)
- **Node.js** `22+` (for compatibility with some tools)
- A **Vercel account** linked to the GitHub repo
- **Account access** to Neon (via Vercel Marketplace), Clerk, and Anthropic

### First-time setup

```bash
# Install dependencies
bun install

# Create local env from the template or later pull it manually via Vercel.
cp .env.example .env.local
# Fill DATABASE_URL, Clerk keys, player-token secret, and any AI/Blob vars you need.

# Validate required env names without printing secret values.
bun run env:check

# Apply journaled migrations + RLS policies to your safe local/dev database.
bun run db:migrate
```

### Environment notes

`DATABASE_URL` is the supported database URL for the app runtime, Drizzle
migrations, and `drizzle-kit`. Use `DATABASE_POOL_MAX` to tune the runtime pool
size; the default is `10`. `DATABASE_URL_UNPOOLED` is only read by the
legacy/emergency `scripts/push-schema.ts` path and is not the normal migration
path.

For local UI work without Clerk, set these in `.env.local` only:

```bash
DEV_BYPASS_AUTH=1
DEV_PROGRAM_ID=<safe-dev-program-uuid>
DEV_ROLE=head_coach
```

Never set the dev bypass variables in preview or production.

### Run the dev server

```bash
bun run dev
# Open http://localhost:3000
```

### Local verification

```bash
bun run verify
# Runs: migrate:check -> typecheck -> lint -> test -> test:evals -> build
# This is the DB-free local full pass.

bun run ci
# Runs: migrate:check -> typecheck -> lint -> test -> test:db -> test:evals
# test:db skips with no DATABASE_URL, but fails if DATABASE_URL is present
# without RUN_DB_TESTS=1.
```

---

## Project structure

```
audible/
├── src/
│   ├── app/                        Next.js App Router pages, layouts, routes
│   │   ├── api/
│   │   │   └── health/             Health check endpoint (reference template
│   │   │                            for every new route handler)
│   │   ├── globals.css             Tailwind v4 + theme tokens
│   │   ├── layout.tsx              Root layout with Analytics + SpeedInsights
│   │   └── page.tsx                Temporary Phase 0 landing page
│   │
│   ├── proxy.ts                    Next.js 16 proxy (formerly middleware.ts)
│   │                                — security headers + Phase 1 auth gate
│   │
│   └── lib/
│       ├── auth/
│       │   └── guards.ts           Centralized role enforcement for coach routes
│       ├── db/
│       │   ├── schema.ts           Drizzle schema — programs, plays, cv_tags, etc.
│       │   └── client.ts           `withProgramContext` — RLS-enforced DB access
│       ├── ingestion/
│       │   ├── hudl-schemas.ts     Zod schemas for Hudl CSV + SportsCode XML
│       │   ├── reconcile.ts        Reconciliation algorithm (PLAN.md §4a)
│       │   └── index.ts            Public API
│       ├── ai/
│       │   └── schemas/
│       │       ├── coverage-shell.ts  Phase 4.5 vision task
│       │       ├── pressure.ts        Phase 4.5 vision task
│       │       └── index.ts           Central AI schema library
│       └── observability/
│           └── log.ts              `beginSpan` / `log` / `emitMetric` helpers
│
├── drizzle/
│   └── 0007_rls_runtime_context.sql  Row-Level Security runtime hardening
│
├── tests/
│   ├── unit/                       Fast, isolated unit tests
│   ├── integration/                DB + API tests (Neon branches)
│   ├── e2e/                        Playwright end-to-end tests
│   ├── evals/                      LLM eval harness (see TEST-PLAN.md §4)
│   ├── cv-bench/                   CV accuracy benchmarks (see TEST-PLAN.md §5)
│   └── fixtures/
│       └── synthetic-hudl/         Generated-in-tree test fixtures
│
├── .github/workflows/
│   └── ci.yml                      Typecheck, lint, unit + integration tests
│
├── biome.json                      Linter + formatter config
├── drizzle.config.ts               Drizzle-Kit config
├── next.config.ts                  Next.js config (Cache Components enabled)
├── package.json
├── playwright.config.ts            E2E test runner config
├── tsconfig.json                   TypeScript strict mode
├── vercel.ts                       Vercel project config (replaces vercel.json)
├── vitest.config.ts                Unit + integration test config
├── vitest.evals.config.ts          LLM eval test config (slower, hits real APIs)
└── vitest.cv.config.ts             CV benchmark config
```

---

## Architectural invariants

These rules are non-negotiable. They are enforced by tests, by the type system, and by `/plan-eng-review`. Breaking them breaks the product's trust model.

### 1. Every DB query against tenant-scoped tables goes through `withProgramContext`.

```ts
// ❌ FORBIDDEN — will leak data across programs
const rows = await db.select().from(plays);

// ✅ REQUIRED
const rows = await withProgramContext(programId, async (tx) =>
  tx.select().from(plays)
);
```

Postgres Row-Level Security enforces this even if you forget. The wrapper sets `app.program_id` per transaction; RLS policies filter on that. See `drizzle/0007_rls_runtime_context.sql` and PLAN.md §5.2.

### 2. Every LLM call goes through a Zod schema in `src/lib/ai/schemas/`.

No inline prompts. No free-form responses. Every model invocation validates against a schema defined once, reused everywhere, versioned via `prompt_version_id` in the DB. See PLAN.md §5.4 and §5.8.

### 3. Every route handler uses `beginSpan` for structured logging.

See `src/app/api/health/route.ts` for the template. Every route:
1. Opens a span at the top with `route` context
2. Wraps the body in try/catch
3. Calls `span.done()` on success, `span.fail(error)` on failure
4. Returns a well-formed Response on both paths

### 4. Every CV tag is ensemble-voted.

Phase 4.5 vision tasks run **two models in parallel** (Claude Sonnet + GPT-4o). Only tags where both models agree *and* ensemble confidence ≥ 0.90 are surfaced to the coach. Disagreements and low-confidence results are logged to `eval_bench` for future training. See PLAN.md §5.3.

### 5. No coach correction loop.

The product saves coach time; it does not shift labor from tagging to correcting. Wrong CV tags are filtered by the confidence gate, not surfaced and fixed. See PLAN.md §3.2.

### 6. Ingestion is all-or-nothing.

If CSV row count, XML segment count, or MP4 duration don't reconcile, the upload is **rejected with a clear error naming the mismatch**. No partial ingestion ever. See `src/lib/ingestion/reconcile.ts` and PLAN.md §4a.

---

## Known validator quirks

Some hooks in the Claude Code environment pattern-match on literal token shapes and flag the wrapper-based observability / security patterns used here. Specifically:

- **"Route handler has no observability instrumentation"** — false positive. `beginSpan` from `src/lib/observability/log.ts` emits structured JSON logs matching the prescribed shape, but the validator looks for inline `console.log(JSON.stringify(...))` calls. See `src/app/api/health/route.ts` for the template we use instead.

If you see these warnings in CI or code review tooling, they can be safely dismissed. The underlying invariants (structured logging on entry/exit, error capture on throw) are enforced.

---

## Safety reminders

- **Never paste a live API key into any chat, issue, or PR description.** Rotate immediately if you do.
- Set a **spend cap** on the Anthropic console (`Settings → Limits`) before connecting a real key. Recommended: `$10/month` during development, raise later.
- `.env.local` is gitignored. Do not override that. Ever.
- If you need to share environment variables, use the Vercel dashboard or the
  later manual steps in `VERCEL_TODO.md`, not chat or email.

---

## References

- **Full build plan:** `../PLAN.md`
- **Test plan:** `../TEST-PLAN.md`
- **Original product spec:** `../Project context/audible_claude_code_spec.md`
