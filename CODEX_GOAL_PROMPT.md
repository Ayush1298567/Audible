# Codex `/goal` Prompt

Paste this into Codex `/goal` from the `audible/` app directory.

```text
You are working in the Audible repo. Your goal is to turn this into a real AI-native football intelligence platform, not just a demo app.

Read these files first:

- AI_NATIVE_GOAL_BRIEF.md
- PROJECT_DEEP_TODO.md
- README.md
- ACTION_ITEMS.md
- ../PLAN.md
- ../TEST-PLAN.md
- ../AUDIBLE-FULL-PLAN.md

Important constraint: do not use the Vercel CLI right now. The user is not logged in. Do not run `vercel`, `vercel link`, `vercel env`, `vercel deploy`, `vercel --prod`, `bunx vercel`, or `npx vercel`. If Vercel work is needed, create or update `VERCEL_TODO.md` with exact later steps, commands, env vars, and verification.

The product goal:

Build Audible into an AI-driven football staff for high school and D2/D3 programs. It should ingest or import film/data, find accurate football patterns, generate evidence-backed scouting/game-plan/practice/player outputs, and improve through evals and research. The product should save real coach time and produce useful football value, not generic AI text.

How to operate:

1. Start by mapping the current working state of the app: product flows, APIs, DB/RLS, AI/CV, tests, env requirements, and known manual steps.
2. Choose the highest-value or highest-risk next slice from `PROJECT_DEEP_TODO.md` and `AI_NATIVE_GOAL_BRIEF.md`.
3. If a decision is unclear, research it before implementing. Research can include current model options, current free or no-cost GPU/server options, football terminology/workflows, cost controls, privacy constraints, and competing product behavior.
4. If the runtime supports parallel agents or researcher tasks, use them at logic gates. Examples: model choice, ML vs prompt vs rules, football concept uncertainty, cost risk, privacy/security risk, or product workflow uncertainty.
5. Write short research notes with sources and the decision. Keep them in repo files when they affect the product.
6. Implement iteratively. Each iteration should make the product more useful, more accurate, safer, cheaper, or easier to operate.
7. Prefer working product value over abstract architecture. Do not add ML/RL/fine-tuning unless there is a measured reason.
8. When AI/ML is useful, build the evaluation loop: golden fixtures, confidence thresholds, disagreement logs, source evidence, and cost tracking.
9. Keep football accuracy central. Every important scouting claim should link to evidence. Hide weak claims. Prefer precision over recall.
10. Keep student-athlete privacy and cross-program data isolation as hard constraints.
11. Run relevant verification after changes: typecheck, lint, unit tests, eval tests, build, DB tests when explicitly safe, and smoke checks when the dev server is relevant.
12. Update `PROJECT_DEEP_TODO.md` as you complete or discover work.

Product priorities:

- Make the coach setup and demo path reliable.
- Make film/scouting/game-plan/player flows complete enough to provide real value.
- Harden DB/RLS and auth before trusting multi-program data.
- Make AI outputs accurate, sourced, and evaluated.
- Keep cost low enough for high school programs.
- Document all manual Vercel/env/deployment steps instead of running them.

Definition of done for this goal:

- The app can complete a meaningful coach-to-player workflow locally or with clearly documented external setup.
- The app produces at least one valuable evidence-backed football output.
- RLS/auth/migration risks are either fixed or explicitly documented with next actions.
- AI behavior has clear evals or confidence gates where it affects user trust.
- The project has an updated TODO, research notes where needed, and verification evidence.
- Any Vercel-only work is in `VERCEL_TODO.md`, not attempted through CLI.

Work until you hit a true blocker. If blocked, write the blocker, what you tried, what decision is needed, and the next best step.
```
