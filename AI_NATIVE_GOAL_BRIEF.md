# Audible AI-Native Goal Brief

This file is the plain-English operating brief for building Audible into a real
AI-native football intelligence product. It is meant to guide Codex `/goal` work.
It should be read with:

- `PROJECT_DEEP_TODO.md`
- `README.md`
- `../PLAN.md`
- `../TEST-PLAN.md`
- `../AUDIBLE-FULL-PLAN.md`
- `ACTION_ITEMS.md`

## North Star

Audible should help under-resourced football programs get useful, accurate game
planning intelligence without adding more manual work for coaches.

The product is not just a dashboard. It should be an AI-driven football staff:
it watches film, finds patterns, explains what matters, builds practice/game-plan
materials, trains players, and proves its claims with clip evidence.

The core promise:

> A coach should be able to give Audible film and roster context, then get a
> trustworthy scouting and preparation workflow that would normally take hours.

## Who This Is For

Primary users:

- High school head coaches and coordinators who teach full time.
- Small D2/D3 college staffs without analytics departments.
- Position coaches who need teachable clips and simple grading workflows.
- Players who need short, position-specific prep instead of long film sessions.

Design for people with limited time. A coach may only have 20 minutes between
classes or practice blocks. The product should reduce thinking load, not add UI
management work.

## What "AI-Native" Means Here

AI-native does not mean sprinkling a chatbot on normal software.

For Audible, AI-native means:

- The product uses models to extract football meaning from film and data.
- The product turns raw evidence into scouting, practice, and player learning.
- The product keeps an eval loop so accuracy can improve over time.
- The product knows when it is uncertain and hides weak claims.
- The product uses research agents, scraping, benchmarks, and experiments when a
  decision is unclear.
- The development loop itself is AI-assisted: agents should research, compare,
  test, measure, and update the plan continuously.

Use ML, RL, fine-tuning, embeddings, computer vision, synthetic data, or other
modeling approaches when they actually improve the product. Do not add ML just
because it sounds advanced. The correct bar is: does this make the football output
more accurate, faster, cheaper, or more useful?

## Product Value Rules

Every major feature should satisfy at least one of these:

- Save coach time.
- Find a pattern a coach would otherwise miss.
- Produce evidence-backed game-plan decisions.
- Help players prepare faster and remember more.
- Make a staff look more organized with less work.
- Improve accuracy through measurable evals.

If a feature is visually nice but does not improve one of these, it is secondary.

## Football Accuracy Rules

Accuracy matters more than coverage.

- Do not surface weak AI claims as truth.
- Every scouting claim should link to the plays or clips that support it.
- Every model-generated tag should carry confidence, source, and prompt/model version.
- If model disagreement exists, log it for evaluation instead of showing it to coaches.
- Prefer high precision and lower recall over noisy dashboards.
- Treat football terminology seriously. If unsure, research or ask a domain-focused agent.
- Separate coach tendencies, program tendencies, and player tendencies.
- Separate opponent film, self-scout film, practice film, and player training data.

For minors and high school players, be careful with data privacy. Do not scrape or
store unnecessary personal data.

## The Product Should Eventually Do This

### Film And Intelligence

- Import Hudl-style exports: CSV breakdown, XML timestamps, and video.
- Reconcile input files and fail clearly if counts/timestamps do not match.
- Split video into per-play clips.
- Detect or infer useful football tags that Hudl does not provide.
- Build tendency reports by down, distance, field zone, formation, personnel,
  motion, coverage, pressure, and sequence.
- Show the clips behind every claim.
- Allow coach annotation and saved clip collections.

### Scouting

- Generate opponent scouting reports that read like useful football documents.
- Explain offensive identity, defensive identity, best situations, weaknesses,
  pressure patterns, coverage tells, key players, and carryover from prior years.
- Avoid generic AI prose. Use concrete football evidence.
- Export useful PDFs for staff meetings.

### Game Planning

- Turn scouting evidence into Board/game-plan suggestions.
- Let coaches build and publish situation-based game plans.
- Generate wristbands, call sheets, scout team cards, and player assignments.
- Learn from dismissed suggestions without overfitting to one click.

### Player Experience

- Let players join with codes.
- Show assigned film, game-plan installs, and short mental-rep sessions.
- Track completion, accuracy, and decision speed.
- Keep the mobile experience simple and fast.

### Practice And Simulation

- Build practice scripts from the week plan and opponent tendencies.
- Generate recognition challenges and position-specific questions.
- Eventually provide The Field: a football simulation/training surface grounded
  in real opponent tendencies, not random animation.

## AI And ML Direction

Start with the simplest reliable approach, then move deeper only when evidence
shows it is needed.

Recommended progression:

1. Structured prompts with schemas.
2. Multi-model agreement for vision/scouting claims.
3. Golden evals and regression tests.
4. Embeddings/search over plays, clips, reports, and notes.
5. Active-learning logs for uncertain or disagreed cases.
6. Small supervised classifiers where enough labeled data exists.
7. Fine-tuning when it beats prompting on a measured benchmark.
8. RL or bandit-style learning only for bounded recommendation loops, such as
   ranking game-plan suggestions after explicit coach feedback.

Do not jump straight to RL. Use it only if the problem has a clear reward signal,
safe exploration, and offline evaluation.

## Research Expectations

When the right answer is unclear, `/goal` should research before building.

Research areas include:

- Current model choices for video understanding, structured reasoning, and vision.
- Current low-cost or no-cost GPU/notebook/server options accessible from terminal.
- Football terminology, scouting-report formats, and coaching workflows.
- Best practices for high-confidence computer vision pipelines.
- Cost controls for AI-heavy products.
- Privacy and safety expectations for student-athlete data.
- Product comparisons: Hudl, GoArmy Edge-style tools, scouting report workflows,
  call-sheet tools, and player training platforms.

Research should produce short written notes with sources and a decision. If the
research affects architecture, update the relevant project TODO or design note.

If remote compute is needed:

- Prefer no-cost local or cloud options first.
- Verify current access, quotas, and terms before using anything.
- Do not use paid GPU/server resources without explicit user approval.
- Keep credentials out of the repo and chat.
- Create a setup note if manual signup/login is required.

## Agent And Researcher Behavior

If a logic gate appears, do not guess. Examples of logic gates:

- Which model/provider is best for a task?
- Whether to use prompting, fine-tuning, embeddings, CV, or classical logic.
- Whether the football concept is being interpreted correctly.
- Whether cost will be too high at one game, ten games, or a full season.
- Whether a route can leak data across programs.
- Whether a player-facing feature is safe for minors.

At a logic gate:

- Split the question into research tasks.
- Use parallel researchers or scraping when the tool/runtime supports it.
- Compare options using accuracy, cost, implementation complexity, risk, and fit
  for the coach workflow.
- Write the conclusion into a local note or the TODO file.
- Then implement the chosen path.

## Cost Rules

This product is for programs with limited budgets. Cost matters.

Track cost at these levels:

- Cost per imported game.
- Cost per CV-analyzed play.
- Cost per scouting report.
- Cost per player assignment/session.
- Monthly cost per program.

Prefer:

- Caching.
- Prompt/model versioning.
- Batch processing.
- High-confidence filtering.
- Eval-driven model choice.
- Cheap models for simple extraction.
- Expensive models only where they clearly improve football value.

## No Vercel CLI For Now

Do not run Vercel CLI commands in this phase. The user is not logged in.

Do not run:

- `vercel`
- `vercel link`
- `vercel env`
- `vercel deploy`
- `vercel --prod`
- `bunx vercel ...`
- `npx vercel ...`

If Vercel work is needed, write it into `VERCEL_TODO.md` with:

- What needs to be done.
- Why it matters.
- Exact commands to run later.
- Which environment variables are needed.
- How to verify after the user logs in.

## Definition Of Done

The project is not done when it merely builds.

It is done when:

- A coach can create or access a program.
- A coach can bring in realistic film data.
- The app produces at least one valuable, evidence-backed scouting output.
- The app produces usable game-plan or practice outputs.
- A player can join and see useful assigned content.
- Cross-program data isolation is tested and trusted.
- AI outputs have evals, confidence handling, and source evidence.
- Cost is understood and bounded.
- Local verification passes.
- Manual deployment steps are documented if Vercel login is needed.

## Working Style

Work in loops:

1. Understand the current product state.
2. Identify the highest-risk or highest-value gap.
3. Research if needed.
4. Implement the smallest complete version that delivers value.
5. Add tests/evals where the risk justifies it.
6. Run verification.
7. Update the TODO with what changed and what remains.

Do not spend days designing future systems while the current app cannot complete
the basic coach/player workflow. Build toward real use.
