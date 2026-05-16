# Audible — Complete Product & Engineering Plan

> This is the full plan for Audible. Not an MVP. The complete product.
> Based on: original spec, coaching research, founder feedback across multiple sessions.
> Written April 2026.

---

## WHAT AUDIBLE IS

A football intelligence platform that replaces the 8-hour manual film breakdown with automated analysis, generates D1-quality scouting reports, builds game plans backed by real tendency data, and trains players through position-specific simulation — all in one integrated tool.

**For:** High school coaches (who teach full-time) and D2/D3 college coaches (who wear every hat).

**Not:** A film storage tool (that's Hudl). Not a play diagrammer. Not a GPS tracker. Not a chat wrapper. Audible is the THINKING layer that sits on top of existing film.

---

## CORE PRINCIPLES

1. **The play is the unit of action.** Intelligence is organized by play concept × defensive look, not player vs player in isolation.
2. **Show, don't tell.** Every insight has visual film evidence with annotations drawn on the frame. Coaches trust eyes, not numbers.
3. **Coach tendencies ≠ program tendencies ≠ player tendencies.** The system separates these three layers and tracks them independently.
4. **Replace data entry, not coaching.** Audible does the 8 hours of charting. The coach does the 1 hour of thinking.
5. **One tool, not six.** Film + scouting + game plan + player prep + communication = one platform.
6. **Speak football.** Formations, not categories. Snaps, not data points. Tendencies, not metrics.
7. **20-minute windows.** A HS coach between classes needs value in 20 minutes, not an hour.

---

## USERS & THEIR WORKFLOWS

### The Head Coach (often also OC or DC)
- Teaches 5-6 classes/day. Coaching starts at 3:30pm.
- 65-75 hour weeks during season (teaching + coaching combined).
- Makes final game plan decisions. Calls plays or delegates to OC.
- Needs: the scouting report ready when he arrives at 7am Monday. Quick access from phone between classes.

### The Offensive Coordinator
- Breaks down opponent defense: fronts, pressures, coverages.
- Builds the call sheet organized by situation.
- Scripts the opening 10-15 plays.
- Needs: formation-to-play tendency charts, coverage analysis, play suggestions backed by data.

### The Defensive Coordinator
- Breaks down opponent offense: formations, concepts, tells.
- Builds the defensive game plan: fronts, coverages, blitz packages.
- Needs: formation frequency, run/pass tendencies by D&D, individual player tells, motion analysis.

### Position Coaches (4-6 of them, many volunteers)
- Grade their position group (1 or 0 per play, target 80%).
- Teach film sessions (15-30 min, projector in a classroom).
- Build scout team cards for their side of the ball.
- Needs: curated clips with teaching context, printable scout cards, player grade tracking.

### Players (14-22 years old)
- Watch film on phones via Hudl currently.
- Attend position meetings where coach shows film on projector.
- Need: 10-15 minute daily sessions, not hour-long film study. Position-specific. Interactive.

---

## THE COMPLETE FEATURE SET

### ═══════════════════════════════════════
### SECTION A: FILM & INTELLIGENCE
### ═══════════════════════════════════════

#### A1. Film Import & Processing
- **Hudl export import:** Coach exports breakdown CSV + SportsCode XML + concatenated MP4 from Hudl (3 clicks on their end). Drops all three into Audible.
- **Processing pipeline:** Parse CSV → tag rows, parse XML → timestamps, ffmpeg splits MP4 → per-play clips uploaded to Blob. All queued via Vercel Queues, one job per play.
- **Reconciliation:** Hard-fail if CSV rows ≠ XML segments ≠ MP4 duration. No partial imports.
- **Idempotency:** sha256(mp4) + programId + gameId prevents duplicate uploads.
- **Multi-year support:** Upload film from previous years against the same opponent. System separates "last year" from "this year" with clear callouts about what changed (new starters, scheme shifts, coordinator changes).
- **Practice film (optional):** Same upload flow. Tagged as practice, not game. Used for technique tracking and game plan execution comparison. Not all coaches have this.
- **Drone/overhead support:** Different camera angles accepted. CV pipeline adapts to angle.

#### A2. Computer Vision Layer
- **Ensemble voting:** Claude Sonnet 4.6 + GPT-5 analyze targeted frames. Only tags where both models agree AND confidence ≥ 90% are surfaced.
- **Defense detection:** Coverage shell (Cover 1/2/3/4/Quarters/Man), pressure type + source + gap, coverage disguise (pre-snap ≠ post-snap).
- **Offense detection:** Blocking scheme (zone/power/counter/trap/draw/screen), route concepts (mesh/levels/flood/etc.), run gap identification.
- **Per-player tracking:** Every visible player's x,y field coordinates, jersey number, depth from LOS, alignment notes (cushion depth, safety depth, OL splits, receiver splits).
- **Silent filtering:** Wrong tags never shown to coaches. Confidence threshold gates everything. No correction loop burden.
- **Eval bench:** Disagreements and low-confidence results logged for future model improvement.

#### A3. Tendency Engine
- **Three-layer separation:**
  - **Coordinator tendencies:** Play-calling patterns (what they call in each situation, how they sequence drives, halftime adjustments)
  - **Program tendencies:** Scheme DNA (base formations, personnel packages, offensive/defensive identity)
  - **Player tendencies:** Individual habits (CB bail rate, OL stance tells, QB stare-downs, DE rush moves)
- **Play-concept-based:** Tendencies organized by play concept × defensive look. "When you run Mesh out of Trips Right against their Cover 3, here's what happens."
- **Situation dimensions:** Down, distance bucket, field zone, quarter, score differential, personnel, formation, motion.
- **Drive-sequence analysis:** How the coordinator calls plays in sequence. What they do after a big gain. What they do after a 3-and-out. Opening drive patterns. Halftime adjustment patterns.
- **Confidence + sample size always shown.** Every number links to the clips that generated it.
- **Self-scout runs continuously.** Every time your own film is uploaded, Audible checks your predictability.

#### A4. Scouting Report Generator
- **AI-generated structured document** that reads like a D1 quality control report. Not a dashboard.
- **Sections:** Offensive identity, run game (primary + secondary concepts with blocking tells), pass game (favorite concepts by situation, QB tendencies, hot routes), RPO/screen game, red zone, situational (3rd down, 2-minute, backed up, after turnovers), key players with individual profiles, coaching tendencies, carryover from previous years.
- **Every claim links to annotated clips.** "Their LG tips pull plays 23 of 26 times" → tap → watch 23 clips with the LG circled and his stance highlighted.
- **Exportable as PDF.** Coaches can print it, hand it out in position meetings.

#### A5. Visual Film Annotations
- **SVG/canvas overlay on the video player** synchronized to playback.
- **Annotation types:** Player circles/highlights, distance measurement lines (cushion, depth), movement arrows (bail direction, blitz path, route stem), zone shading (coverage zones color-coded), heat zones (where a player tends to align across multiple plays).
- **Generated by the CV pipeline.** When the system detects "CB at 7-yard cushion," it draws the circle + measurement line automatically.
- **Coach can draw manually too.** Circle, arrow, line, highlight, eraser — draw directly on playing video. Drawings save with the clip.
- **This is the "I've never seen this before" feature.** The clip plays, and the AI's observations are visually overlaid on the frame so the coach can SEE what the data says.

#### A6. Opponent Playbook Extraction
- **Auto-groups opponent plays by formation + concept.**
- **Names each play** (auto-generated, coach can rename). "Inside Zone Left from Shotgun," "Mesh from Trips Right."
- **Browsable playbook structure:** Formation tiles → play cards with clip count, success rate, situation tags.
- **Offense AND defense:** Their offensive playbook (what they run) + their defensive playbook (fronts, coverages, blitz packages).
- **Every play loadable into The Field** for simulation.
- **Connected to the scouting report** — the playbook IS the evidence for the report.

### ═══════════════════════════════════════
### SECTION B: GAME PLANNING
### ═══════════════════════════════════════

#### B1. The Board (Game Plan Builder)
- **Visual whiteboard with situation columns:** Opening Script, 1st Down, 2nd & Short, 2nd & Long, 3rd & Short, 3rd & Medium, 3rd & Long, Red Zone, Two Minute, Four Minute, Backed Up, Two-Point, Goal Line, Special.
- **Offense AND defense toggle.** Offensive game plan (plays to call) + defensive game plan (fronts, coverages, blitz packages).
- **Play cards are visual:** Each card shows formation diagram (X's and O's thumbnail), play name, and the opponent tendency it attacks.
- **Drag from playbook drawer.** Coach's own playbook plays as visual cards, organized by formation.
- **Play Suggester:** Per-situation AI recommendations. "Run Mesh because their hook defenders drop too deep — here's the film evidence." Uses real tendency data, not hallucination.
- **Auto-Generate Full Game Plan:** One button. System fills every situation with its top recommendation. Coordinator reacts to a draft instead of building from scratch.
- **Dismissal training:** When coach dismisses a suggestion ("not in our system", "don't like the matchup"), the engine learns and stops suggesting that pattern.
- **Opening script builder:** Separate section for the first 10-15 plays. Designed to test the defense, get the QB in rhythm, and attack known weaknesses.

#### B2. Play Recommendations
- **Play concept × defensive look.** Not player vs player.
- "When you run Power out of I-Form and they're in a 4-3 Over front, your pulling guard kicks out their C-gap defender. They spill 60% of the time. When they spill, your RB bounces for 6+ yards on 8 of 12 plays."
- **Each recommendation includes:** play name + formation diagram, confidence level, plain-English reasoning referencing real tendency numbers, all supporting clips with visual annotations, risk assessment ("they blitz 14% of the time from this look — have a hot route").

#### B3. Publishing & Downstream Outputs
When the coordinator locks and publishes:
1. **QB Wristband Card** — formatted PDF, fits physical wristband sleeve. 20-40 plays organized by situation code, color-coded, abbreviated in the program's terminology.
2. **Sideline Call Sheet** — full-page PDF organized by situation. Includes opponent tendency notes per situation from the scouting report. Opening script on the front.
3. **Scout Team Cards** — formatted cards showing every opponent play to run in practice. Formation diagrams in color with jersey numbers. Coach notes field. Printable or displayable on iPad.
4. **Player Assignments** — auto-pushed to the Player App by position group. Each player sees only their position's relevant information.
5. **Practice Builder pre-populates** with game plan plays for walkthrough sessions.

### ═══════════════════════════════════════
### SECTION C: THE FIELD (SIMULATION)
### ═══════════════════════════════════════

#### C1. Coach View — Scenario Builder
- **Top-down football field** with yard lines, hash marks, end zones.
- **22 players** rendered as colored circles with jersey numbers. Your team in primary color, opponent in gray/secondary.
- **Situation bar:** Down, distance, yard line, quarter, score differential — all editable. Changes what defensive look loads.
- **Personnel panel:** Your depth chart + opponent depth chart. Opponent auto-loads based on tendency for that situation.
- **Play selector:** Your playbook as visual formation thumbnails. Tap → routes and assignments appear as overlays.
- **Run simulation:** Defense moves to tendency-based pre-snap alignment → ball snaps → offense executes → defense reacts based on real tendency weights → result with reasoning + film evidence.
- **Stochastic variance:** Same play run 10 times gives 10 different results weighted by tendency distributions. After 10+ runs, distribution chart appears.
- **Save scenarios.** Name them. Build into sessions. Assign to position groups.

#### C2. All 8 Position Modes (Player View)
Each position has a distinct camera perspective and decision interaction model:

**QB Mode:**
- Camera: behind-center elevated. Sees full formation + defense.
- Pre-snap: ID coverage → protection call → optional audible.
- Post-snap: pocket timer (2.5s, faster if blitz gets free) → read progressions → throw to receiver.
- Teaching: "You said Cover 2 but it's Cover 3. Look at the safety — single high. In Cover 3, your first read is the deep crosser." + film clip of the opponent running that coverage.

**RB Mode:**
- Camera: behind at mesh point. Sees OL, defensive front, backfield.
- Pre-snap: ID front → confirm gap assignment.
- Post-snap: blocks animate → read the hole → cut decision (called gap / cutback / bounce).
- Teaching: "You bounced but the B-gap was open because their DT got double-teamed."

**WR/TE Mode:**
- Camera: receiver's perspective at LOS.
- Pre-snap: ID defender technique (press / off / bail) → choose release.
- Route: stem + break point timing (early = lose separation, late = lose timing, correct = open).

**OL Mode:**
- Camera: lineman's view at LOS.
- Pre-snap: ID front → confirm protection → ID Mike.
- Post-snap: stunt recognition → pass off or follow man. Run: initial step direction + combo block release.

**DL Mode:**
- Camera: D-lineman looking at OL.
- Pre-snap: formation read (run/pass tendency).
- Post-snap: choose rush move (speed / counter / bull / spin) or run fit.

**LB Mode:**
- Camera: elevated from LB depth. Full offensive formation visible.
- Pre-snap: alignment + key identification.
- Post-snap: key read → diagnose run/pass → fit gap or drop to coverage.

**CB Mode:**
- Camera: corner's position at line or depth.
- Pre-snap: coverage technique assignment.
- Post-snap: receiver release read → route recognition → break on ball timing.

**Safety Mode:**
- Camera: elevated, centered, widest view.
- Pre-snap: disguise timing (hold look, don't rotate early).
- Post-snap: rotation angle + timing → deep responsibility.

#### C3. Sim as a Teaching Tool
- Wrong answers get explained with actual film: "The safety rotated earlier than his 0.7s average. You needed to throw by 1.2s. Here are 4 clips where he disguises his rotation."
- Each rep connects back to the real opponent's behavior.
- Session scoring: accuracy, decision time, concept mastery.
- Coach controls access: OPEN (free reps anytime), ASSIGNED (specific scenarios pushed with due date), or LOCKED (only assigned content).

#### C4. Walkthrough Mode
- Coach starts walkthrough on their device.
- All players in the position group get a notification and join.
- Multi-device synchronized: coach sees top-down, players see their position perspective.
- Coach controls play/pause/rewind for everyone simultaneously.
- At pause points, coach pushes comprehension questions to all devices.
- Coach sees response bubbles over each player's position on their device.
- Absent players complete asynchronously — same experience, same questions.

### ═══════════════════════════════════════
### SECTION D: PRACTICE & PLAYER PREP
### ═══════════════════════════════════════

#### D1. Practice Builder
**Five session types:**
1. **Film Review** — curated clips with teaching context per clip ("Watch the safety. Where is he pre-snap? What does that tell you about the coverage?")
2. **Recognition Challenge** — see a pre-snap look, ID the coverage/front/blitz under a timer at game speed.
3. **Decision Drill** — position-specific timed decisions. QB reads progressions. LB diagnoses run/pass. CB chooses technique. Timer matches real game speed (2.5s for QB).
4. **Situational Quiz** — "It's 3rd and goal from the 7. Their dime package. What coverage are they most likely in?" Tests football IQ.
5. **Virtual Walk-Through** — step through your specific assignment from the published game plan. Position-specific: receiver sees route vs coverage, linebacker sees fit vs formation.

#### D2. Auto Practice Planning
- Coach can ask Audible to BUILD the practice plan.
- "Build Tuesday's session for the DB group focusing on Cover 3 recognition against Jefferson's passing concepts."
- Audible selects clips, generates questions, sets timers, creates the session.
- Coach reviews and publishes.
- Connected to the game plan: practice content comes directly from what the coordinator built on The Board.

#### D3. Scout Team Card Generator
- Coach selects opponent plays from the extracted playbook.
- System generates formatted cards: formation diagram (in color with jersey numbers), motion if any, personnel grouping, play name, coach notes field.
- Printable as PDF. Displayable on iPad at practice.
- "Their number one job is to look like the team you are about to play" — the cards make this possible even with JV players who don't understand the opponent's scheme.

#### D4. Film Grading (Post-Game)
- Position coaches grade their group: 1 (did their job) or 0 (didn't) per play.
- Grading done by watching own game film in the Film Room.
- Target: 80% individual, 75% team average.
- Grade sheets visible to players.
- Weekly awards auto-calculated from grades.
- Trends tracked over the season.

### ═══════════════════════════════════════
### SECTION E: PLAYER EXPERIENCE
### ═══════════════════════════════════════

#### E1. Player Home
- **Today's assignment front and center.** "Coverage Recognition vs Jefferson — ~12 min." Big start button.
- **Weekly progress ring.** Circular indicator of completion.
- **One opponent intel card.** Single relevant piece of opponent intelligence from the coach.
- **Notification feed.** New film pushed, new assignment, coach messages.

#### E2. Film Tab
- Coach-pushed clips with teaching context per clip.
- Player controls: play/pause, scrub, frame advance, 0.5x/1x/2x speed.
- Reaction: 👍 "Got it" or ❓ "Question" — visible to coach on their dashboard.
- Self-directed search available (search film the coach has made available).

#### E3. The Field (Player)
- Position-specific simulation (Section C2 above).
- Assigned sessions from coach OR open practice (if coach allows).
- Session scoring: accuracy, decision time, concept breakdown.
- "Most missed concept" highlighted with option to run extra reps.

#### E4. My Game Plan
- Published game plan filtered to their position.
- Per-situation assignments in plain language with clip evidence.
- "Versus Cover 3 — run the comeback at 12 yards. If the corner bails, convert to fade. [Clip: their corner in Cover 3, showing the bail]"

#### E5. Progress
- Accuracy trend (line chart over the season).
- Decision time trend.
- Concept-by-concept breakdown: "Cover 3: 91% ✓ | Cover 4 disguised as Cover 2: 58% — needs work."
- Weekly readiness card visible to coaches.
- Light gamification: streak counter, weekly completion ring, position group completion leaderboard (peer pressure, not individual ranking).

### ═══════════════════════════════════════
### SECTION F: ROSTER & COMMUNICATION
### ═══════════════════════════════════════

#### F1. Roster
- Drag-and-drop depth chart by position.
- Player profiles: film-derived stats, sim accuracy trends, session completion, status (available/limited/day-to-day/out).
- Multi-position support (arrays, not scalars).
- CSV import for initial roster or update.
- Join codes for player access (6-character, no email required).
- Scout team assignments (separate from depth chart).

#### F2. Games & Schedule
- Season schedule with opponent management.
- Multi-year history: add last year's film to this year's opponent record.
- System separates analysis: "Last year vs this year" with callouts about returning vs new players, coordinator changes, scheme shifts.
- Post-game self-scout auto-runs after own game film upload.
- Game results tracking (score, film-derived stats).

#### F3. Communication
- **In-app notifications:** Film processing complete, new intelligence flags, player session completion, game plan published.
- **Coach → position group messages:** Send a push notification to all players in a group. "Watch clips 4-7 before practice tomorrow."
- **No coach-to-coach chat.** They already text each other. Don't build a messaging app inside a coaching tool.
- **Player reactions on clips:** 👍 or ❓ visible to coaches. Coaches see who watched what.

### ═══════════════════════════════════════
### SECTION G: PUBLIC PAGES
### ═══════════════════════════════════════

#### G1. Landing Page
- Hero: "The Intelligence Layer for Football"
- Features grid, How It Works (Upload → Analyze → Win), social proof, CTAs
- No dashboard links. Only → /setup (Get Started) and /join (Player Login).

#### G2. Pricing Page (future)
- Tiers TBD. Likely per-program per-season ($200-500).

#### G3. Auth
- Coach: Clerk (email + Google sign-in). Multi-coach programs with invites and roles (head_coach, coordinator, assistant).
- Player: Join code (6-character, no email). Lightweight session.

### ═══════════════════════════════════════
### SECTION H: ANALYTICS & OUTPUTS
### ═══════════════════════════════════════

#### H1. Opponent Analytics
- Formation frequency chart.
- Success rate by down and distance (heat map grid).
- Pressure rate by quarter.
- Target distribution by receiver.
- Red zone efficiency by play type.
- Historical comparison (multi-year if available).
- Every chart taps through to clips.

#### H2. Self-Scout Analytics
- Run rate on 1st & 10 by field zone.
- Formation → play call predictability.
- Motion usage rate.
- Your blitz rate and success rate by situation.
- Predictability flags: "You've run the ball 78% on 1st and 10 from your own territory — 42 plays."

#### H3. Stat Export
- Film-derived stats formatted for MaxPreps CSV.
- Generic CSV export.
- PDF summary sheet.
- Eliminates hours of manual stat entry.

---

## TECH STACK

| Layer | Technology | Why |
|---|---|---|
| **Framework** | Next.js 16 (App Router, Server Components) | Vercel-native, modern React, good DX |
| **Hosting** | Vercel (Fluid Compute) | CI/CD, preview URLs, serverless |
| **Database** | Neon Postgres (Vercel Marketplace) | Serverless, cheap, branching for preview |
| **ORM** | Drizzle | TypeScript-native, fast migrations |
| **Auth** | Clerk (Vercel Marketplace) | Multi-org, roles, invites, join codes |
| **Object Storage** | Vercel Blob | Film clips, thumbnails, PDFs |
| **Job Queue** | Vercel Queues + Workflow DevKit | Durable async for ingestion + CV |
| **LLM Routing** | Vercel AI Gateway | Zero markup, provider fallback, observability |
| **LLM (fast/cheap)** | Claude Haiku 4.5 | Command bar, tag corrections, player assignments |
| **LLM (reasoning)** | Claude Sonnet 4.6 | Scouting reports, play suggestions, intelligence flags |
| **Vision (ensemble)** | Claude Sonnet 4.6 + GPT-5 | CV frame analysis, dual-model voting |
| **AI SDK** | Vercel AI SDK v6 | Tool calling, structured outputs, streaming |
| **Styling** | Tailwind CSS v4 + shadcn/ui | Dark theme design system |
| **Video Processing** | ffmpeg (per-play via queued jobs) | Clip splitting, frame extraction |
| **Canvas/Sim** | HTML5 Canvas (2D), React Three Fiber (3D future) | Field rendering, player animation |
| **Film Annotations** | SVG overlay synchronized to video playback | Visual CV annotations on clips |
| **Validation** | Zod | Runtime type safety, LLM response validation |
| **Testing** | Vitest + Playwright | Unit/integration/E2E |
| **Email** | Resend (Vercel Marketplace) | Join codes, notifications |
| **Notifications** | Web Push API | Browser-native, free |
| **Error Tracking** | Sentry | Production error visibility |
| **Observability** | Vercel Analytics + Speed Insights + structured logging | Performance + usage |
| **CI** | GitHub Actions | Typecheck, lint, test gates |

---

## DATABASE ARCHITECTURE

### Core tables (RLS-enforced):
- **programs** — tenant root (one per football program)
- **coaches** — program members with roles
- **players** — roster with multi-position, join codes, status
- **opponents** — teams faced (with multi-year support)
- **seasons** — program seasons by year
- **games** — game records linked to season + opponent
- **film_uploads** — each uploaded video file with processing status
- **plays** — the core tag DB (every play as a structured record, heavily indexed)
- **cv_tags** — vision ensemble output with prompt versioning
- **player_detections** — per-player positions from CV (x,y coordinates per frame)
- **eval_bench** — discarded CV disagreements for future training
- **prompts** — versioned LLM prompts (active version gates tendency queries)
- **tendencies** — cached tendency calculations (refreshed on ingestion)
- **collections** — coach-created clip packages
- **scenarios** — saved simulation scenarios
- **sessions** — training sessions (5 types)
- **session_plays** — plays within sessions
- **player_session_results** — per-player performance data
- **game_plans** — published game plans
- **game_plan_plays** — plays within game plans by situation
- **game_plan_assignments** — per-position deliverables
- **corrections** — coach tag corrections (feedback loop)
- **player_grades** — 1/0 grades per player per play
- **playbook_plays** — coach's own plays with formations

### Tenancy: Postgres Row-Level Security on every table. `withProgramContext(programId, fn)` is the only way to query tenant-scoped data.

---

## NON-NEGOTIABLE RULES

1. Every AI insight links to the clips that generated it.
2. Every tendency shows sample size + confidence.
3. The command bar is always visible on the Coach Platform.
4. Film search queries the tag DB, never raw video.
5. Processing is always asynchronous.
6. Coach corrections confirm immediately and update downstream.
7. Player App shows only what the coach has pushed.
8. Every player can have multiple positions (array).
9. Publishing is the only trigger for downstream outputs.
10. Simulation runs on real tendency weights, never developer-assigned values.
11. Scenarios save permanently to the program library.
12. Correcting a tag takes exactly 2 taps.
13. No coach correction loop for CV. Silent filtering only.
14. The intelligence thinks in play concepts × defensive looks, not player vs player.
15. Coach, program, and player tendencies are tracked separately.

---

## BUILD SEQUENCE

### Phase 1: Foundation Rebuild
- [ ] Clerk auth (multi-coach programs, invites, roles)
- [ ] Proper onboarding wizard (account → program → roster CSV → schedule → first film upload)
- [ ] Film Room with drawing tools on video player
- [ ] 2-tap tag correction with downstream recalculation
- [ ] Collections (named clip packages)

### Phase 2: Intelligence Upgrade
- [ ] Scouting report generator (AI-written, football-specific, PDF-exportable)
- [ ] Visual film annotations (SVG overlays on clips from CV data)
- [ ] Three-layer tendency separation (coordinator / program / player)
- [ ] Drive-sequence analysis (how they call plays in order)
- [ ] Opponent playbook extraction (auto-grouped by formation + concept)
- [ ] Play-concept-based intelligence (play × defensive look, not isolated stats)

### Phase 3: Game Planning
- [ ] Board with offense/defense toggle
- [ ] Play Suggester with play-concept reasoning and film evidence
- [ ] Auto-generate full game plan (one button)
- [ ] Opening script builder
- [ ] Dismissal training (suggestions learn from coach rejections)
- [ ] Publishing pipeline: wristband card, call sheet, scout team cards, player assignments

### Phase 4: The Field (Full Simulation)
- [ ] All 8 position modes with distinct cameras and decision models
- [ ] Teaching mode: wrong answers explained with actual film clips
- [ ] Session builder: coach creates 8-15 scenario sessions
- [ ] Walkthrough mode: multi-device synchronized
- [ ] Coach controls: OPEN / ASSIGNED / LOCKED access
- [ ] Scenario library (saves permanently)

### Phase 5: Practice & Player Prep
- [ ] All 5 session types (film review, recognition, decision drill, quiz, walk-through)
- [ ] Auto practice planning (AI builds sessions from game plan + opponent data)
- [ ] Scout team card generator (printable PDF with formation diagrams)
- [ ] Film grading system (1/0 per play, position coach workflow)
- [ ] Player progress tracking (accuracy trends, decision time, concept mastery)
- [ ] Light gamification (streaks, completion rings, position group leaderboard)

### Phase 6: Polish & Ship
- [ ] Full responsive design (desktop + tablet + phone)
- [ ] PDF export for all outputs (scouting report, call sheet, wristband, scout cards, stats)
- [ ] MaxPreps stat export
- [ ] Multi-year opponent history
- [ ] Self-scout continuous monitoring
- [ ] Performance optimization (sub-1s film search, sub-1.5s Hub load)
- [ ] Comprehensive test suite
- [ ] Error handling and edge cases
- [ ] First real coach walkthrough

---

## WHAT WE'RE NOT BUILDING (YET)

- Native mobile apps (web-first, responsive, mobile later)
- Pre-snap stance/gaze/foot tracking (needs custom CV training data, future)
- Fatigue pattern detection (needs pose estimation, future)
- Hudl OAuth direct integration (no public API for HS/college)
- Newsroom / opponent news scraping (future)
- In-game halftime analysis (future — process first-half film during halftime)
- Coach-to-coach messaging (they use text/group chat already)
- Stripe billing (after product validation)
- 3D simulation view (start with 2D canvas, upgrade later)
- GPS/wearable integration

---

## SUCCESS CRITERIA

The product is ready to put in front of a real coach when:

1. A coach can upload a Hudl export and receive a complete AI-generated scouting report with annotated film clips within an hour of upload.
2. The scouting report is specific enough that the OC can build a game plan from it without watching additional film.
3. The game plan Board can be built and published in under 30 minutes, with AI recommendations accepted or dismissed per situation.
4. Publishing generates a printable wristband card, call sheet, and scout team cards.
5. Players can join via code, watch teaching-contextualized clips, run position-specific sim reps, and complete recognition challenges — all in 10-15 minutes on their phone.
6. The simulation teaches: wrong answers are explained with real film evidence from the opponent.
7. A returning opponent's multi-year data shows what changed and what carried over.
8. A coach between classes can open the app, check who completed their sessions, send a message to the DB group, and close the app in under 3 minutes.

---

## ENG REVIEW DECISIONS (April 2026)

Decisions locked in during `/plan-eng-review`:

1. **PartyKit** for walkthrough real-time sync (Vercel-native WebSocket rooms)
2. **@react-pdf/renderer** for all PDF outputs (wristband, call sheet, scout cards, scouting report)
3. **Phase 1 split:** 1a = Clerk auth + onboarding + DRY cleanup. 1b = Film Room depth (drawing, corrections, collections). 1b can run parallel with Phase 2 start.
4. **Three-layer tendency schema** designed before Phase 2 implementation (coordinator_id, multi-year player linking)
5. **Frame-anchored annotations** — annotated still frames shown alongside video, not overlaid on video (avoids homography problem)
6. **Full 3D simulation** from the start using React Three Fiber. All 8 position cameras in 3D. No 2D fallback.
7. **Claude Sonnet 4.6** for scouting report generation (~$0.10-0.30 per report)
8. **DRY cleanup** in Phase 1a: extract `useApiQuery` hook, `apiHandler` wrapper, shared empty/loading state components
9. **Tests ship with each phase.** Phase 1a backfills simulation engine + tendency engine tests. No phase ships without tests.
10. **Formation diagram renderer** (`components/field/formation-diagram.tsx`) built as shared component early in Phase 2
11. **Critical gaps to address:** scouting report error handling + PDF generation fallback behavior

### Parallelization strategy:
```
Lane A: 1a → 2a (scouting report + annotations) → 3 (game planning)
Lane B: 1b → 2b (three-layer tendencies + drive analysis) → 4 (simulation)
Lane C: 2c (playbook extraction, after 2b)
Lane D: 5 (practice + player prep, after 3)
Phase 6: sequential after all lanes complete
```

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR (adapted) | Architecture A selected, HOLD SCOPE |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | CLEAR | 8 issues, 2 critical gaps, 9 decisions |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |
| Outside Voice | `/codex review` | Independent 2nd opinion | 0 | — | — |

**VERDICT:** ENG REVIEW CLEAR — ready to begin Phase 1a implementation.

---

*End of plan. This is the full product. Build it right.*
