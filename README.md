# Audible

Football intelligence platform for high school and D-II / D-III college football programs. Ingests Hudl exports, adds a vision-layer that detects coverage and pressure tags Hudl doesn't provide, computes tendencies with clip evidence, and surfaces everything through a coach-facing web app with a natural-language command bar, an AI-assisted game plan builder, and a player mental-rep training experience.

See `../PLAN.md` and `../TEST-PLAN.md` in the parent directory for the full build plan, architectural decisions, and testing strategy. This README covers running the code.

---

## Status

**Phase 0 — Scaffolding.** No user-facing features yet. This directory contains:

- Next.js 16 app shell with App Router
- Drizzle schema for the tag database with RLS policies
- Auth guards skeleton for Clerk multi-tenancy
- Hudl ingestion reconciliation algorithm + Zod schemas
- Central AI schema library for vision ensemble tasks (coverage, pressure)
- Observability primitives (`beginSpan` / `log`)
- Test harness configs (Vitest + Playwright)
- CI workflow

Next: Phase 1 (auth + program setup), then Phase 2 (Hudl ingestion), then the tendency engine.

---

## Local development

### Prerequisites

- **Bun** `1.3.10+` — [install](https://bun.sh)
- **Node.js** `22+` (for compatibility with some tools)
- A **Vercel account** linked to the GitHub repo
- **Account access** to Neon (via Vercel Marketplace), Clerk, and Anthropic

### First-time setup

```bash
# Install dependencies
bun install

# Link to your Vercel project (one-time)
bunx vercel link

# Pull environment variables from Vercel
bunx vercel env pull .env.local

# Generate the Drizzle migration for the initial schema
bun run db:generate

# Apply migrations + RLS policies to your Neon branch
bun run db:migrate
```

### Run the dev server

```bash
bun run dev
# Open http://localhost:3000
```

### Run the full CI locally

```bash
bun run ci
# Runs: typecheck → lint → test → test:evals
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
│   └── 0001_enable_rls.sql         Row-Level Security policies
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

Postgres Row-Level Security enforces this even if you forget. The wrapper sets `app.program_id` per transaction; RLS policies filter on that. See `drizzle/0001_enable_rls.sql` and PLAN.md §5.2.

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
- If you need to share environment variables, use `vercel env` or the Vercel dashboard, not chat or email.

---

## References

- **Full build plan:** `../PLAN.md`
- **Test plan:** `../TEST-PLAN.md`
- **Original product spec:** `../Project context/audible_claude_code_spec.md`
