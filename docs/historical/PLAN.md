# Audible — v1 Build Plan

> **Status:** Pre-implementation. Plan reviewed via `/plan-eng-review` on 2026-04-11 with 14 findings applied. Ready to begin Phase 0.
>
> **Last updated:** 2026-04-11

---

## 1. Product Summary

Audible is a football intelligence platform for high school and D-II/D-III college football programs. It ingests already-tagged film from Hudl, adds a vision-based intelligence layer that detects coverage shell and pressure packages that Hudl doesn't tag, computes tendencies and self-scout patterns with clip evidence, and surfaces the intelligence through a coach-facing web app with a natural-language command bar, an auto-suggested game plan builder, and a player-facing mental-rep training experience.

The v1 target is a web-only MVP that a single coach at a single program can upload one game film to and receive non-trivial intelligence within minutes. Mobile apps are deferred. Native video is deferred. Deep pre-snap behavioral tracking is deferred.

---

## 2. Target Users

**Primary:** High school head coaches who also teach full-time, staffs of 4–8 people, no analytics staff, total tech budget $1k–3k/year, already using Hudl for film storage and breakdown.

**Secondary:** D-II and D-III college staffs with 3–5 coaches, similar resource constraints, more film volume but same manual-processing bottleneck.

**Tertiary:** Players on both tiers, ages 14–22, smartphone-first but web browser is acceptable for v1.

---

## 3. v1 Architecture Decision

After extended iteration, the following architectural decisions are locked for v1:

### 3.1 Ingestion: Architecture A (Bring-Your-Own Hudl Tags)

Coaches finish their normal tagging workflow in Hudl, then export three files and drop them into Audible:

1. Breakdown CSV (the already-tagged play data — Hudl Assist auto-tags formation, personnel, down/distance, hash, play type, play direction, motion direction, ODK, quarter, yard line, gain/loss)
2. Sportscode-compatible XML (provides per-play timestamps)
3. Concatenated MP4 of all clips (the actual film)

The ingestion pipeline parses the CSV into tag rows, uses the XML timestamps to align each row to a segment of the MP4, and uses `ffmpeg` to split the MP4 into individual per-play clips which are uploaded to Vercel Blob.

**No computer vision for base tagging.** Hudl already does it. Rebuilding it would deliver zero new insight and cost months of ML engineering.

**Why:** ~99% of target users are already on Hudl Assist. This ingestion model adds 3 clicks to their existing workflow instead of replacing it. It also unblocks the entire intelligence layer on day one with zero CV dependency.

### 3.2 Vision Intelligence Layer: Phase 4.5 (the "find what Hudl doesn't tag" layer)

Vision-capable LLMs (Claude Sonnet 4.6 + GPT-4o, routed via Vercel AI Gateway) analyze targeted frames of each play to extract tags that Hudl does not provide. Scope for v1:

| Task | What it detects | Frames analyzed | Precision target |
|---|---|---|---|
| **Coverage shell** | Cover 1 / 2 / 3 / 4 / Quarters / Man Free / Man Under | 2 (pre-snap + 1s post-snap) | ≥92% |
| **Pressure type** | 4-man / 5-man / 6-man / LB blitz / DB blitz / stunt | 1 (snap + 0.5s post-snap) | ≥88% |
| **Pressure source** | Weak side / strong side / middle / edge / A-gap / B-gap / C-gap | 1 (same frame as pressure type) | ≥85% |
| **Coverage disguise** | Pre-snap look vs post-snap reality mismatch | 2 (same frames as coverage shell) | ≥90% with higher confidence threshold |
| **Alignment depth** | CB cushion, safety depth, as numerical range | 1 (pre-snap) | Range output, not point |

**Ensemble voting:** every frame gets sent to two independent vision models in parallel. Only tags where both models agree are accepted into the database. Disagreements are silently discarded and logged for eval improvement.

**Confidence filtering:** only high-confidence agreements (≥90% threshold, higher for disguise detection) are surfaced in the UI. Lower-confidence tags exist in the DB for internal use (training data, eval) but are never shown to coaches.

**No coach correction loop.** The product promise is to save coach time, not shift the labor. Coaches do not fix AI mistakes. The product only surfaces insights the system is very sure about. Recall (how many patterns we find) is intentionally traded for precision (every pattern we show is right).

### 3.3 Deferred to v2

The following CV features are on the public roadmap but explicitly not shipping in v1 because the accuracy ceiling with off-the-shelf vision LLMs is too low for a no-correction product:

- Pre-snap stance weight shift detection
- Gaze direction / head tracking
- Foot position and width changes
- Route break-point timing at receiver-level granularity
- Fatigue pattern detection (requires pose estimation pipeline)

These become achievable in v2 because v1 accumulates labeled training data as a byproduct of running ensemble CV on every film. Correct outcomes become positive examples; disagreement cases become hard negatives. v2's specialized model is trained on v1's data exhaust.

---

## 4. Build Phase Sequence

The v1 build is decomposed into 10 phases. Each phase is a shippable chunk that adds one specific capability. Phase 4 is the center of gravity — everything before it is infrastructure, everything after is value on top.

| # | Phase | What it adds | Usable? |
|---|---|---|---|
| 0 | Scaffolding | Vercel project, Next.js app on a URL, Postgres provisioned, CI | No |
| 1 | Auth + Program Setup | Clerk, program/team model, manual roster, join codes | Partial |
| 2 | Hudl Ingestion | Upload flow, CSV+XML parser (with reconciliation, §4a), queued ffmpeg clip splitter, Blob uploads | Yes (basic) |
| 3 | Film Room v0 | Play grid, filter chips, video player, tag display | Yes |
| 4 | Tendency Engine | Scouting Hub, situation breakdowns, self-scout, clip evidence | **Yes — "holy shit" moment** |
| **4.5** | **Vision Intelligence Layer** | Ensemble CV for coverage shell, pressure type/source, disguise, alignment depth | **Yes — the moat** |
| 5 | Command Bar | Persistent NL input, LLM tool calling, inline results | Yes |
| 6 | The Board (Game Plan) | Situation columns, Play Suggester, publish + auto-generated outputs | Yes |
| 7 | Player App v0 | Responsive web, join code login, Home / Film / My Game Plan | Yes |
| 8 | Practice Builder | Film Review + Recognition Challenge session types | Yes |
| 9 | The Field | 2D top-down canvas sim, tendency-driven defense, QB interaction first | Yes |
| 10 | Polish + first real coach | Edge cases, onboarding copy, eval suite, bug fixes | Yes, shippable |

**Phases 0–4 are the shippable MVP.** Phase 4.5 is the differentiator that makes Audible unique vs "Hudl with a dashboard." Phases 5–10 are essential product features but none of them are gating the "is this useful to a coach" validation question.

### 4a. Ingestion Reconciliation Algorithm (Phase 2)

This is the single biggest runtime bug risk in the product. Locked in now so the implementer has no room to improvise.

```
ingest(csv, xml, mp4):
  1. parse csv            → N_csv play rows, validated via lib/ingestion/hudl-schemas.ts
  2. parse xml            → N_xml code instances (each with t_start, t_end in seconds)
  3. ffprobe mp4          → D_total duration in seconds
  4. ASSERT N_csv == N_xml
     → fail: "Hudl export mismatch: CSV has {N_csv} plays but XML has {N_xml} segments.
               Re-export from Hudl and try again."
  5. ASSERT max(xml[i].t_end) <= D_total + 2.0  (2s tolerance for encoder drift)
     → fail: "XML timestamps extend beyond video duration. Re-export and try again."
  6. ASSERT every xml segment has positive duration (t_end > t_start)
     → fail: "XML contains zero-duration segments at rows: [...]"
  7. Align csv[i] ↔ xml[i] BY INDEX (positional), not by any key
     → assumption: Hudl always exports in the same order. Validate this in eval fixture.
  8. For each (csv_row, xml_segment) pair:
     a. enqueue clip_split job with {play_id, t_start, t_end, mp4_blob_key}
     b. write tag row to plays table with all Hudl-provided columns
     c. status = 'awaiting_clip'
  9. clip_split worker (queued):
     a. ffmpeg -ss t_start -to t_end -c copy → outputs ./clip-{play_id}.mp4
     b. upload to Vercel Blob → signed URL
     c. update plays row with clip_blob_key, status = 'awaiting_cv' (or 'ready' if CV off)
     d. ASSERT clip duration == xml.duration ± 0.1s
        → fail: mark play as 'clip_failed', alert, do not retry automatically
  10. cv_analyze worker (queued, see §5.3):
     a. analyze coverage shell, pressure type, pressure source, disguise, depth
     b. write CV tag rows linked to play_id with prompt_version_id
     c. update plays row status = 'ready'

Idempotency:
  - Upload request carries an idempotency key = sha256(mp4) + program_id + game_id
  - Duplicate uploads return the existing game's status, do not reprocess
  - Retry of a failed ingestion uses the same idempotency key to avoid double-write
```

**Partial ingestion is forbidden.** If any step 4-6 fails, the entire upload is rejected with a clear user-facing error naming the mismatch. Do not try to salvage partial data — partial data produces silently-wrong tendencies, which violates the "evidence over assertion" rule in §8.

---

## 5. Technology Stack

| Layer | Choice | Rationale |
|---|---|---|
| **Hosting** | Vercel (Fluid Compute) | Native CI/CD, preview URLs, automatic fallback, cheap until scale |
| **Framework** | Next.js (App Router, Server Components where they help) | Matches Vercel, modern React, good DX |
| **Styling** | Tailwind CSS + shadcn/ui | Production-quality UI for free, avoids the "LLM slop UI" look |
| **Database** | Neon Postgres via Vercel Marketplace | Serverless, cheap, one-click provision, branching for preview envs |
| **ORM** | Drizzle | TypeScript-native, fast, good migration story |
| **Auth** | Clerk via Vercel Marketplace | Built-in org/team concept matches program/team model, player join codes work naturally |
| **Object Storage** | Vercel Blob (private) | Per-play clips, thumbnails, generated PDFs. Auth-gated delivery |
| **LLM Routing** | Vercel AI Gateway | Zero markup, automatic provider fallback, single API key, observability |
| **LLM Providers** | Anthropic Claude (primary), OpenAI (secondary for vision ensemble) | Haiku 4.5 for structured parsing, Sonnet 4.6 for reasoning, GPT-4o for vision ensemble tiebreaker |
| **AI SDK** | Vercel AI SDK | Tool calling, structured outputs, streaming, works with AI Gateway |
| **Video Processing** | ffmpeg via `@ffmpeg-installer/ffmpeg`, invoked **per-play** from queued jobs | Clip splitting at the segment level, not the full-game level — avoids Function bundle size and timeout risks |
| **Job Queue / Orchestration** | Vercel Queues + Workflow DevKit (public beta, accepted) | Durable async ingestion + CV fan-out, built-in retries and observability, zero new vendor surface |
| **Validation** | Zod | Runtime type safety, LLM response validation |
| **Email** | Resend via Vercel Marketplace | Join code delivery, transactional |
| **Voice Input** | Browser Web Speech API | Free, client-side, no server cost |
| **Push Notifications** | Web Push API | Free, browser-native, covers v1 needs |
| **3D (Phase 9)** | React Three Fiber + Rapier + Mixamo assets | Only needed at Phase 9; free assets only |
| **Error Tracking** | Sentry (free tier) | Optional but recommended from Phase 2 onward |
| **Observability** | Vercel Observability (logs, Speed Insights, Web Analytics) | Built-in |

### 5.1 Auth & Role Model

- **One Clerk organization per program.** Program identity = Clerk org ID.
- **Coach roles inside each org:**
  - `head_coach` — full admin, can invite, delete, publish game plans, edit anything
  - `coordinator` — edit everything except roster destruction and org settings
  - `assistant` — view + comment, no publish/edit on the Board or Practice Builder
- **Players do NOT use Clerk orgs.** Players authenticate via a 6-character **join code** issued by the head coach. A join code creates a lightweight `players` row with optional `clerk_user_id` linkage. Player sessions are scoped to their program_id via a short-lived JWT.
- **Middleware enforces role boundaries** on every route. Coach routes require a coach role; player routes require a player session; admin routes require `head_coach`.
- **Role-checking is centralized** in `lib/auth/guards.ts` — no ad-hoc role checks in route handlers.

### 5.2 Tenancy Isolation via Postgres Row-Level Security (RLS)

**Critical invariant: cross-program data leaks must be structurally impossible, not discipline-dependent.**

- Every tenant-scoped table carries an explicit `program_id UUID NOT NULL` column. No exceptions.
- Every tenant-scoped table has an RLS policy:
  ```sql
  CREATE POLICY program_isolation ON plays
    USING (program_id = current_setting('app.program_id')::uuid);
  ```
- Every authenticated API request opens a DB connection and immediately runs:
  ```sql
  SET LOCAL app.program_id = '<verified Clerk org ID>';
  ```
  before any query executes. The `SET LOCAL` scopes it to the current transaction.
- Drizzle query builder wraps this in `withProgramContext(programId, async (tx) => ...)` so forgetting it is impossible — the wrapper is the only way to get a DB handle.
- A migration test verifies that cross-program reads return zero rows even when the query forgets the `where` clause.

**Forbidden pattern:** `db.select().from(plays)` — missing the program context. Should fail in a test before it ever ships.

### 5.3 Vision Ensemble Orchestration (Phase 4.5)

```
ingestion_workflow
    │
    ▼
┌───────────────────┐
│  ingest_film      │  (WDK workflow)
│  ┌─────────────┐  │
│  │ parse CSV   │  │
│  │ parse XML   │  │
│  │ validate    │  │
│  │ (§4a)       │  │
│  └─────┬───────┘  │
│        │          │
│        ▼          │
│  ┌─────────────┐  │
│  │ enqueue N   │  │  N = number of plays
│  │ clip jobs   │  │  → clip_split queue
│  └─────┬───────┘  │
└────────┼──────────┘
         │
         ▼
   ┌──────────────┐        For each play:
   │ clip_split   │ ──────▶ 1. ffmpeg extract segment from MP4
   │   worker     │         2. upload to Vercel Blob (private)
   └──────┬───────┘         3. enqueue cv_analyze job
          │
          ▼
   ┌──────────────┐        For each play:
   │ cv_analyze   │ ──────▶ Promise.all([
   │   worker     │           anthropicVision(frames, prompt),
   │              │           openaiVision(frames, prompt)
   │              │         ])
   │              │         → ensemble_vote()
   │              │         → if agree & confidence >= 0.90: write tag
   │              │         → else: discard, log to eval_bench table
   └──────────────┘

Concurrency controls:
  - Max 5 concurrent cv_analyze workers per program (rate limit)
  - Per-program daily spend cap via Vercel Queue middleware
  - Circuit breaker per vision provider: trip on 3 consecutive 5xx
  - Retry with exponential backoff: 1s, 4s, 16s, then dead-letter
```

**Why queued, not inline:**
- Serial execution of 720 vision calls per game ≈ 30 minutes of wall time. Unacceptable.
- Rate limits on Anthropic/OpenAI must be respected per-program.
- A failed play should retry, not take down the whole ingestion.
- Observability: every job is a tracked unit with status, retry count, latency.

### 5.4 Prompt Versioning

Every CV-generated tag row carries `prompt_version_id` and `model_id` alongside the tag value. Prompts live in a versioned table:

```sql
CREATE TABLE prompts (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,           -- 'coverage_shell', 'pressure_type', etc.
  version INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL,
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  UNIQUE (name, version)
);
```

- Only one row per `name` has `is_active = TRUE` at a time.
- Tendency queries always filter on the active prompt version: `WHERE prompt_version_id IN (SELECT id FROM prompts WHERE is_active)`.
- Reprocessing a film writes new rows alongside old rows with a new `prompt_version_id`. Old rows are retained for debugging.
- **Consequence: historical tendencies are stable over time.** An improvement to the coverage prompt tomorrow does not silently change what the Scouting Hub showed a coach yesterday.

### 5.5 Blob Delivery: Signed URLs, Not Function Proxy

Per-play clips are delivered via short-lived **signed URLs** from Vercel Blob directly to the browser, not proxied through a Function.

- Signed URL TTL: 10 minutes
- URL generation is cheap (one Blob SDK call per request)
- The Film Room's video player hits the signed URL directly — no Function invocation per clip view

**Cost delta:** on a coach watching 30 clips in a film review session, we save ~30 Function invocations and ~30 Fast Origin Transfer events versus the proxy approach. At scale this is significant.

### 5.6 Performance & Concurrency Controls

- **Composite indexes** on the `plays` table for the top tendency query shapes:
  ```
  (program_id, opponent_id, down, distance_bucket, quarter)
  (program_id, opponent_id, formation, personnel)
  (program_id, game_id, play_order)
  ```
- **Materialized tendency views** per game, refreshed on ingestion completion. Example: `game_tendency_rollup` stores precomputed blitz rates, formation frequencies, coverage shell distributions for a game.
- **Per-program rate limits** on vision calls (5 concurrent max), LLM reasoning calls (10 concurrent max), and storage ops (uses Vercel's native caps).
- **Per-program daily spend cap** in environment variable, enforced by the Queue middleware. If a program exceeds the cap, jobs are paused and an alert fires.
- **Circuit breakers** per external provider via the AI Gateway's fallback routing — already built in.

### 5.7 Ingestion CSV Validation

All Hudl CSV parsing runs through Zod schemas defined in `lib/ingestion/hudl-schemas.ts`. Every row is validated. Unknown columns are logged but do not fail validation (Hudl custom columns vary by program). Missing required columns (down, distance, formation, etc.) fail the upload with an explicit error naming the missing field and row number.

### 5.8 Central AI Schema Library

All Zod schemas and tool definitions for LLM touchpoints and vision ensemble tasks live in `lib/ai/schemas/`, one file per task (`command-bar.ts`, `play-suggester.ts`, `coverage-shell.ts`, etc.). Every AI call imports from there. No ad-hoc inline schemas in route handlers. This is also the eval harness's source of truth.

---

**Rejected choices and why:**
- React Native / Expo — no native mobile in v1
- Raw S3 — Vercel Blob is simpler and cheap enough
- Prisma — Drizzle is faster and has cleaner migrations
- NextAuth — Clerk's native Vercel integration is lower-friction
- Mux / Cloudflare Stream — Blob delivery is sufficient until we see real bandwidth pressure

---

## 6. AI Usage Map

AI (LLMs) is used in exactly these places, with these models:

| Feature | Model(s) | Purpose |
|---|---|---|
| Command bar parsing | Claude Haiku 4.5 | Parse NL → structured tool calls against tag DB |
| Play Suggester reasoning | Claude Sonnet 4.6 | Rank plays + generate plain-English rationale |
| Intelligence flag copywriting | Claude Sonnet 4.6 | Turn tendency SQL results into "Their MLB blitzes on..." cards |
| Scouting hub summary | Claude Sonnet 4.6 | 2–3 sentence opponent overview |
| Self-scout flag copywriting | Claude Sonnet 4.6 | Same as intelligence flags, pointed at your team |
| Play-name suggestions | Claude Haiku 4.5 | Generate descriptive names from tag rows |
| Practice Builder session generation | Claude Sonnet 4.6 | NL request → structured session |
| Player-app assignment translation | Claude Haiku 4.5 | Coach shorthand → player-readable language |
| Simulation outcome explanation | Claude Haiku 4.5 | "Why did this rep end this way" plain-English |
| Tag correction suggestions | Claude Haiku 4.5 | Pattern match over structured rows (admin/dev side only) |
| **Vision: coverage shell** | Claude Sonnet 4.6 + GPT-4o (ensemble) | Phase 4.5 |
| **Vision: pressure type/source** | Claude Sonnet 4.6 + GPT-4o (ensemble) | Phase 4.5 |
| **Vision: coverage disguise** | Claude Sonnet 4.6 + GPT-4o (ensemble) | Phase 4.5 |
| **Vision: alignment depth** | Claude Sonnet 4.6 + GPT-4o (ensemble) | Phase 4.5 |

**What AI is NOT doing:**
- Not processing every frame of every video (we target specific frames based on play timestamps)
- Not replacing Hudl's base tagging (formation, personnel, down/distance all come from Hudl Assist)
- Not running tendency math (SQL over structured tags)
- Not running the simulation (deterministic code with tendency weights)
- Not scoring Field reps (deterministic rules)
- Not indexing raw video for search (search hits the tag DB)

---

## 7. Cost Model

| Item | Per-coach/program per month | Notes |
|---|---|---|
| Vercel (Fluid Compute + hosting) | $0–5 | Free Hobby for dev, Pro ~$20 shared at launch |
| Neon Postgres | $0–3 | Free tier covers MVP, ~$19/mo Launch plan at scale |
| Vercel Blob (storage + bandwidth) | $3–6 | ~40GB/season typical, depends on replay volume |
| LLM costs (non-vision) — all 10 touchpoints from §6 | $2–4 | Haiku-heavy, with prompt caching |
| LLM costs (vision ensemble — Phase 4.5) | $6–16 | Two models per frame, targeted frames only |
| Clerk (auth) | $0 | Free tier covers 10k MAU |
| Resend (email) | $0 | Free tier covers 3k/month |
| **Total per program per month, v1** | **~$11–34** | |
| **Planning number: ~$20** | | |

At $50–200/program/month pricing, gross margin stays above 80%. AI and infra costs are not the bottleneck.

Development phase AI cost: ~$30–60 total, mostly covered by Vercel AI Gateway's $5/month free credit and Anthropic's signup credit.

---

## 8. Non-Negotiable Product Rules

These survive from the original spec and the architectural conversation. They are hard constraints on the code and the UI.

1. **Every AI insight links to the clips that generated it.** No unverifiable outputs. Ever.
2. **Every tendency shows sample size + confidence.** Never hide uncertainty.
3. **No coach correction loop.** The product saves coach time, does not shift manual labor from tagging to correcting. Silent filtering + ensemble voting + confidence thresholds do the quality work.
4. **Film search queries the tag DB, never raw video.** Sub-second results.
5. **Processing is always asynchronous.** Coach uploads and gets notified on completion.
6. **The command bar is always visible on the Coach Platform.** Never hidden, never collapsed.
7. **Every player can have multiple positions.** Position field is an array, not a scalar.
8. **Publishing the game plan is the only trigger for downstream outputs.** Nothing auto-publishes without explicit coach action.
9. **The simulation (when it ships in Phase 9) runs on real tendency weights, never developer-assigned values.**
10. **Player App shows only what the coach has pushed.** Players don't see the raw tag DB.

---

## 9. Not in Scope for v1

Explicitly deferred with one-line rationale each.

| Item | Why deferred |
|---|---|
| Native iOS / Android apps | Web-first eliminates App Store friction, one codebase, can ship now |
| CV pipeline to replace Hudl tagging | Hudl already does this; rebuilding is zero-unlock |
| Pre-snap stance / gaze / foot-position tracking | Accuracy ceiling on vision LLMs too low without training data; v2 with labeled corpus |
| Fatigue pattern detection | Requires real pose estimation pipeline; v2 |
| Route break-point timing at receiver granularity | Same reason; v2 |
| Walkthrough sync mode (multi-device live play call) | Nice but not blocking; v2 |
| Newsroom / opponent research scraping | v2 feature |
| MaxPreps stat export | v2 feature |
| Stripe billing | v2; v1 is free to early coaches for validation |
| All 8 position simulation modes | Phase 9 ships QB first; others added iteratively |
| 3D first-person helmet view | Phase 9 is 2D top-down; 3D is v2 with real asset budget |
| Practice film ingestion (vs game film) | Same pipeline will work but validation starts with game film |
| Hudl auto-import via OAuth | No public Hudl API for HS/college; manual export is the v1 path |

---

## 10. Success Criteria for v1

The MVP is "done" when:

1. A real HS coach can upload a Hudl breakdown CSV + XML + MP4 export and see per-play clips in the Film Room within 15 minutes of upload
2. The Tendency Engine surfaces at least 5 non-trivial intelligence flags from a single game film
3. The Phase 4.5 CV layer successfully tags coverage shell on ≥85% of plays with both models in agreement
4. The command bar correctly answers 10 out of 10 benchmark football queries
5. The game plan Board can be built and published in under 20 minutes of coach time
6. A player can log in via join code and see their position-specific assignments
7. A player can complete one Recognition Challenge session end-to-end
8. Total production AI + infra cost per program per month stays under $30
9. The Hub loads in under 1.5s, film search returns in under 1s
10. At least one real coach runs through the full flow and reports that the experience is useful

---

## 11. Environmental and Account Setup (founder's responsibility)

Before Phase 0 can execute, the founder needs to create:

1. **Vercel account** with a team set up
2. **GitHub account** with an empty repo for the project
3. **Anthropic Console account** with an API key (or rely on Vercel AI Gateway's free credits to start)
4. **Domain** (optional for Phase 0, required by Phase 10)

Everything else (Neon, Clerk, Resend, Blob, AI Gateway) provisions through Vercel Marketplace once the project is linked.

---

## 12. Engineering Preferences (review against these)

- DRY aggressively — flag repetition
- Tests are non-negotiable — prefer too many over too few
- Engineered enough — not fragile, not over-abstracted
- Prefer explicit over clever
- Minimal diff — achieve the goal with the fewest new abstractions
- Observability is not optional — new codepaths get logs and metrics
- Security is not optional — threat-model every new endpoint
- Deployments plan for partial states, rollbacks, feature flags
- ASCII diagrams in code for non-trivial flows
- Stale diagrams are worse than none

---

## 13. Open Questions for Eng Review (resolved 2026-04-11)

1. ~~Is the ingestion pipeline robust to mismatched CSV row counts vs XML segment counts?~~ **Resolved in §4a.** Hard-fail reconciliation algorithm, no partial ingestion.
2. ~~Are we handling the case where a coach queries tendencies on a game whose CV tags haven't computed yet?~~ **Resolved:** tendency queries filter on `status = 'ready'` only; in-flight games are not included in aggregates. A banner shows "N plays still processing."
3. ~~Queue strategy for Phase 4.5?~~ **Resolved in §5.3.** Vercel Queues + Workflow DevKit, one job per play, Promise.all both vision models, concurrency capped at 5 per program.
4. ~~How do we version prompts?~~ **Resolved in §5.4.** `prompt_version_id` on every CV tag row, prompts table with `is_active` flag, tendency queries filter on active version.
5. ~~Eval harness for Phase 4.5?~~ **Resolved in §14.** Labeled held-out set of ~100 plays per task, eval harness in `tests/evals/`, CI gate blocks on regression.
6. Schema evolution when v2 adds pre-snap tell tags — **deferred**. Will use a polymorphic `cv_tags` table with `tag_type` enum + JSONB payload. Revisit when we know the exact tag shapes.
7. ~~Tenancy isolation model?~~ **Resolved in §5.2.** Postgres RLS on every table, enforced via `SET LOCAL app.program_id`. Cross-program leaks are structurally impossible.
8. ~~Rollback plan for a bad prompt change?~~ **Resolved in §5.4.** Old prompt version rows are retained. Set `is_active = FALSE` on the bad version, set `TRUE` on the previous one. Tendency queries read the active version only.
9. Feature flag strategy for 4.5a/b/c/d/e — use **Vercel Flags SDK** with per-program flag targeting. Each CV task gated independently. Ship 4.5a to one coach, validate accuracy, enable for all. Lock in during Phase 0.
10. ~~Duplicate upload handling?~~ **Resolved in §4a.** Idempotency key = `sha256(mp4) + program_id + game_id`, duplicates return existing game status.

---

## 14. Testing Strategy

**Test review in `/plan-eng-review` flagged this as a critical gap. Full strategy now locked in.** The detailed test plan lives in `TEST-PLAN.md`; this section is the summary.

### 14.1 Test Stack

| Layer | Tool | Notes |
|---|---|---|
| Unit / integration | **Vitest** | Fast, Vite-native, good mocking, works with Next.js |
| E2E | **Playwright** | Industry standard, runs against Vercel preview deployments |
| DB tests | **Neon branching** | Each PR gets a branched DB, migrations run fresh, tests run in isolation |
| LLM evals | **Vitest + golden fixtures** | `tests/evals/` with frozen inputs and expected tool-call shapes |
| CV benchmarks | **Vitest + labeled play set** | ~100 hand-labeled plays per CV task, accuracy measured in CI |
| Load / perf | **k6** (optional, Phase 10) | Smoke-test the ingestion pipeline under burst load |
| Lint / types | **Biome + TypeScript strict** | Fast, one-config, pre-commit + CI |

### 14.2 Coverage Targets Per Phase

| Phase | Coverage target | Critical paths that MUST have tests |
|---|---|---|
| 0 | 100% scaffolding | Deploy pipeline smoke test |
| 1 | 100% auth middleware + RLS policies | Cross-program data leak test (should return 0 rows) |
| 2 | 100% reconciliation algorithm, 80% ffmpeg wrapper | Every rejection branch in §4a, idempotency test |
| 3 | E2E: upload → play grid → play clip | Video player works, filter chips work |
| 4 | 100% tendency SQL | Fixture-driven: known input → known tendency output |
| 4.5 | Eval suite ≥85% on labeled set | Per-task: coverage, pressure, source, disguise, depth |
| 5 | 100% command-bar tool-calling layer + 20 golden queries | Every tool schema exercised |
| 6 | E2E: build game plan → publish → verify assignments generated | Suggester reasoning evals |
| 7 | E2E: player join → view game plan → complete session | |
| 8 | E2E: coach builds session → player completes it | |
| 9 | Smoke: The Field loads, basic QB interaction works | |
| 10 | Full regression pass + manual coach walkthrough | |

### 14.3 Critical Fixtures (founder provides, blocks ingestion validation)

1. **One real Hudl export** (CSV + XML + MP4) from a real game, anonymized. Required to validate §4a.
2. **~100 labeled plays** for CV accuracy benchmarks. Each play needs a human-verified ground truth for: coverage shell, pressure type, pressure source, disguise presence, cushion depth range. Required before Phase 4.5 can claim ≥85% accuracy. **This is the single biggest blocker to Phase 4.5 shipping.**
3. **Synthetic good Hudl export** — generated in-tree for CI. Small MP4 with 10 known plays and matching CSV/XML.
4. **Synthetic bad Hudl exports** with common malformations — generated in-tree for CI: off-by-one row count, drifting timestamps, zero-duration segment, missing required column.

### 14.4 Non-Negotiable Gates

- **CI blocks on eval regressions.** If a prompt change drops command-bar accuracy below baseline, CI fails. No exceptions.
- **CI blocks on CV accuracy regressions.** If coverage-shell precision drops below 85% on the labeled set, CI fails.
- **RLS isolation tests run on every PR.** Cross-program read attempts must return 0 rows.
- **Type checking and lint are zero-tolerance.** No `any`, no `// @ts-expect-error` without a comment explaining why.

---

## 15. Engineering Review Findings (applied 2026-04-11)

All 14 findings from `/plan-eng-review` have been applied to this document. Summary of where each lives:

| # | Finding | Applied to |
|---|---|---|
| 1A | ffmpeg per-play via queue, not full-game | §5 (stack), §4a (algorithm), §5.3 (orchestration) |
| 1B | Vision ensemble one job per play, concurrency cap 5 | §5.3 |
| 1C | Hard-fail reconciliation algorithm | §4a |
| 1D | Postgres RLS tenancy isolation | §5.2 |
| 1E | `prompt_version_id` on CV tag rows | §5.4 |
| 1F | Vercel Queues + WDK in stack | §5 (stack table) |
| 1G | Signed URLs for Blob delivery, not function proxy | §5.5 |
| 1H | Clerk roles + separate player auth | §5.1 |
| 2A | Zod schemas on CSV ingestion | §5.7 |
| 2B | Centralized AI schema library | §5.8 |
| 2C | Prompt eval harness in Phase 0 | §14 |
| 3 | Full test strategy (critical gap) | §14 + `TEST-PLAN.md` |
| 4A | Composite indexes + materialized tendency views | §5.6 |
| 4B | Per-program concurrency + spend caps + circuit breakers | §5.6 |

**Open decisions deferred (not blocking Phase 0):**
- Schema for v2 pre-snap tell tags (polymorphic cv_tags table — revisit at Phase 4.5 completion)
- Vercel Flags per-program targeting config (locked into Phase 0 but detailed flag tree TBD)

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR (adapted, pre-plan) | Architecture A selected, HOLD SCOPE |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 14 findings applied, 1 critical gap fixed |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |
| Outside Voice | `/codex review` | Independent 2nd opinion | 0 | — | — |

**UNRESOLVED:** 0 blocking. 2 soft decisions deferred (polymorphic tag schema at Phase 4.5, detailed feature-flag tree at Phase 0).

**VERDICT:** ENG REVIEW CLEAR — ready to begin Phase 0 scaffolding. A fresh `/plan-design-review` will be valuable once UI mocks exist (recommended before Phase 3). CEO review is complete for the current scope; re-run only if scope shifts.

---

*End of plan.*
