# Audible — Football Intelligence Platform
## Complete Product Specification for Development

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Core Philosophy](#2-core-philosophy)
3. [Target Users](#3-target-users)
4. [Technical Architecture](#4-technical-architecture)
5. [The Intelligence Engine](#5-the-intelligence-engine)
6. [Coach Platform — Full Specification](#6-coach-platform--full-specification)
   - [Onboarding Flow](#61-onboarding-flow)
   - [The Command Bar](#62-the-command-bar)
   - [The Hub](#63-the-hub)
   - [The Film Room](#64-the-film-room)
   - [The Scouting Hub](#65-the-scouting-hub)
   - [Player Profiles](#66-player-profiles)
   - [The Field — Simulation](#67-the-field--simulation)
   - [The Board — Game Plan](#68-the-board--game-plan)
   - [Practice Builder](#69-practice-builder)
   - [The Roster](#610-the-roster)
   - [Analytics](#611-analytics)
7. [Player App — Full Specification](#7-player-app--full-specification)
   - [Home](#71-home)
   - [Film Tab](#72-film-tab)
   - [The Field (Player)](#73-the-field-player)
   - [My Game Plan](#74-my-game-plan)
   - [Progress](#75-progress)
8. [Position-Specific Simulation Modes](#8-position-specific-simulation-modes)
9. [The Intelligence Layer — What Gets Found Automatically](#9-the-intelligence-layer--what-gets-found-automatically)
10. [Data Flow — How Everything Connects](#10-data-flow--how-everything-connects)
11. [The Weekly Workflow](#11-the-weekly-workflow)
12. [Film Processing Pipeline](#12-film-processing-pipeline)
13. [Natural Language Command System](#13-natural-language-command-system)
14. [Newsroom / Schedule Intelligence](#14-newsroom--schedule-intelligence)
15. [Auto-Generated Outputs](#15-auto-generated-outputs)
16. [Design Principles](#16-design-principles)
17. [Database Schema Overview](#17-database-schema-overview)
18. [API Integrations](#18-api-integrations)
19. [Key Product Rules](#19-key-product-rules)

---

## 1. Product Overview

**Audible** is a football intelligence platform for high school and Division II/III college football programs. It is two connected applications — a **Coach Platform** (web/tablet) and a **Player App** (iOS/Android) — sharing one data layer.

The product ingests raw game and practice film, processes it automatically using computer vision, extracts structured intelligence from every snap, and surfaces insights that no human coach could find manually regardless of hours invested or staff size. It also provides an interactive simulation environment where coaches build game scenarios and players experience position-specific mental training against real opponent film data.

**What it is NOT:**
- Not a film storage or exchange tool (that's Hudl)
- Not a GPS/wearable tracker (that's Catapult)
- Not a play diagramming tool
- Not a play-call communication system (that's GoRout)
- Not a raw analytics dashboard

**What it IS:**
- An automated film intelligence system
- A position-specific mental training environment
- A game planning and scouting platform
- An opponent playbook extraction engine
- A weekly preparation operating system for football programs

---

## 2. Core Philosophy

### Evidence Over Assertion
Every AI-generated insight links directly to the specific film clips that generated it. A tendency flag always shows the clip count and confidence level. Coaches can tap any insight and watch the evidence. No black box outputs. No "trust us." If Audible says their corner gives a 7-yard cushion on 3rd and long, it shows all 11 plays proving it.

### Find What Humans Cannot
Audible's value is exclusively in intelligence that human film study cannot produce regardless of time invested. Pre-snap behavioral tells tracked across 22 players simultaneously. Fatigue-correlated performance degradation by quarter. Third-order situational tendencies that only emerge across 60 plays filtered on multiple contextual dimensions. These are computational tasks, not human ones.

### Simplicity Is The Product
The command bar handles 80% of daily coach actions in plain English. The Hub shows only what matters this week. The Field feels like a video game, not a coaching tool. Nothing requires navigation training. The target user is a high school coach who teaches full-time and has 20 minutes between third and fourth period.

### The Correction Loop
Every AI tag a coach corrects feeds back into the model as a training signal. The product gets smarter the more it's used. Over a full season, Audible's accuracy on a specific program's film is substantially higher than on the first upload.

---

## 3. Target Users

### Primary: High School Football Programs
- Head coach is typically also a full-time teacher
- Staff of 4–8 coaches, many volunteers or part-time
- Total tech budget often $1,000–$3,000/year
- Film already exists (Hudl) but analysis is entirely manual
- One person does all film breakdown — usually takes entire weekend
- No analytics staff, no graduate assistants
- Stat entry is manual and unreliable (MaxPreps, volunteer stat-keepers)

### Secondary: Division II / Division III College Programs
- 3–5 full-time coaches wearing multiple hats
- Head coach salary averaging $40,000–$70,000
- No dedicated analytics or quality control staff
- High desire for college-level preparation sophistication
- Recruiting obligations compound the time pressure
- More film available but same manual processing problem

### Tertiary: Players (via Player App)
- High school ages 14–18, college athletes 18–22
- Primarily smartphone users
- Short attention spans for academic-style content
- Respond to gamified, visual, immediate-feedback experiences
- Want to use film for personal highlight reels but can be redirected
- Self-directed study highly valuable for serious players

---

## 4. Technical Architecture

### Applications
```
Coach Platform (Web + Tablet)
  - React web application
  - Responsive for iPad primary use case
  - Offline capability for core film review functions

Player App (iOS + Android)
  - React Native or Flutter
  - Optimized for phone use, 10–15 minute sessions
  - Push notifications for assignments and coach messages
  - Syncs with Coach Platform data layer in real time
```

### Data Layer
```
Shared backend serving both applications:
- Film storage and CDN delivery
- Structured play tag database (the core intelligence store)
- Tendency calculation engine
- User/roster management
- Real-time sync between coach and player interfaces
```

### Film Processing Pipeline
```
Upload → Queue → Frame Extraction → Computer Vision Processing → Tag Generation → Tendency Calculation → Coach Notification
  
Runs asynchronously overnight for full game film
Real-time tagging available for short clips (single series)
```

### Supported Film Formats (v1)
- **Primary:** Hudl MP4 export (most common format at target level)
- Expansion planned: raw MP4, MOV, AVI from common cameras (GoPro, iPad)
- Each program uploads a roster CSV at season start — jersey numbers map to player names

---

## 5. The Intelligence Engine

This is the core technical differentiator. Everything below runs automatically when film is uploaded. No coach action required beyond uploading.

### 5.1 Automatic Play Tagging
Every snap gets tagged with:
- Formation (offensive: Singleback, Shotgun, Pistol, Under Center, etc.)
- Personnel grouping (11, 12, 21, 22, 10, etc.)
- Motion type (pre-snap motion direction, jet motion, orbit, etc.)
- Down and distance
- Hash mark position (left, middle, right)
- Field zone (own territory, midfield, red zone)
- Quarter and game situation
- Play type (run, pass, screen, RPO, etc.)
- Run direction (for run plays)
- Pass depth (short, intermediate, deep)
- Coverage shell (Cover 1, 2, 3, 4, Quarters, Man, etc.)
- Pressure type (no pressure, line stunt, DB blitz, LB blitz, etc.)
- Outcome (yards gained, success/failure by expected yards)
- Players involved (ball carrier, targeted receiver, primary blocker, etc.)

### 5.2 Player Identity Tracking
- Jersey OCR matches numbers to player names from uploaded roster
- Person re-identification models track the same player across frames when number is occluded
- Coach correction loop: one tap to flag a misidentified player, one tap to correct
- Each correction improves accuracy for future film from same program

### 5.3 Pre-Snap Behavioral Analysis
The engine tracks specific pre-snap behaviors for every player on every snap and correlates them with post-snap outcomes across the full film library.

**What it tracks:**
- Stance weight distribution (forward lean indicates pulling guard, pass blocking, run direction)
- Foot angle and width changes frame-by-frame pre-snap
- Head direction and gaze tracking (where QB is looking before snap)
- Hip alignment for defensive backs (zone vs. man tells)
- Depth alignment changes from play to play
- Pre-snap movement timing (when does player shift, how long before snap)
- Verbal/physical communication indicators between linemen
- Quarterback pre-snap routine variations (finger habits, foot placement)

**Correlation threshold:**
- Flags a tell when correlation reaches statistical significance (minimum 8 plays, escalating confidence levels shown)
- Shows confidence: "Based on 8 plays — Low confidence" through "Based on 47 plays — Very high confidence"
- Every flagged tell includes all clips showing the behavior highlighted in the video

### 5.4 Fatigue Pattern Detection
- Tracks individual player performance metrics snap-by-snap: reaction time to snap, first-step quickness, alignment depth consistency, break point timing
- Compares early-game metrics to late-game metrics across multiple processed games
- Flags statistically significant degradation patterns
- Works on both opponent film (exploit their fatigue) and your own film (address your team's conditioning)

### 5.5 Tendency Calculation Engine
Calculates tendency percentages for every filterable combination:
- Single-dimension: run rate on 1st and 10, blitz rate on 3rd and medium
- Multi-dimension: blitz rate on 3rd and 6–8 when leading by 7 or fewer in the second half
- Player-specific: individual corner's cushion depth by down and distance
- Formation-specific: what play comes out of each formation/motion combination
- Situation-specific: red zone tendencies, two-minute tendencies, backed-up tendencies

All tendency calculations expose the underlying play-by-play data and link each data point to its clip.

### 5.6 Opponent Playbook Extraction
From uploaded film, the system reconstructs the opponent's playbook:
- Groups all offensive plays by formation and concept
- Names play concepts based on detected routes, blocking schemes, and run fits
- Coach can rename any auto-generated play name
- Organizes into a browsable playbook structure
- Every play links to every clip showing that play run in film
- All extracted plays are available to load into simulation scenarios in The Field

### 5.7 Self-Scout Engine
Runs the same analysis on your own team's film that it runs on opponents:
- Surfaces your own formation frequency and play tendency patterns
- Flags high-confidence predictability (things a good defensive coordinator will find)
- Compares your tendencies against conference opponent tendencies to identify exploitation opportunities
- Generates season-long self-scout in minutes vs. weeks of manual charting

---

## 6. Coach Platform — Full Specification

### 6.1 Onboarding Flow

Three-step wizard runs on first login. Clean, fast, no unnecessary complexity.

**Step 1: Schedule**
- Season calendar view, blank
- Coach types or speaks opponent names and game dates directly
- Each opponent added instantly triggers background research (see Section 14)
- Can add/edit opponents anytime — not locked to onboarding
- Format: Opponent Name, Date, Home/Away, Location (city/state)

**Step 2: Roster Upload**
- CSV upload OR manual entry
- Required fields: Name, Jersey Number, Position, Grade/Year
- System auto-suggests positions based on jersey number ranges (1–19 skill, 50–79 interior linemen) — coach confirms or overrides
- Players can update their own profiles later through Player App using a unique join code
- Roster can be updated anytime — not locked to onboarding

**Step 3: Playbook Entry**
- Each play needs: Name, Formation (tap visual library), Play Type (Run/Pass/Screen/RPO), Situation tags (which downs/distances this play lives in)
- Visual formation library — tap a diagram rather than type a name
- Minimum viable: 5 plays to finish onboarding. Prompts to add more throughout season
- Import option for coaches with existing digital playbooks

After step 3, coach lands in the Hub. Onboarding complete.

---

### 6.2 The Command Bar

**Location:** Persistent at the top of every screen in the Coach Platform. Always visible. Always active.

**Input:** Text OR voice (microphone button on right side)

**Behavior:** Accepts natural language football commands. Processes immediately. For multi-step commands, shows a confirmation dialog before executing.

**Football vocabulary it understands natively:**
- Coverage names: Cover 1, Cover 2, Cover 3, Cover 4, Quarters, Tampa 2, Cover 6, Man Free, Man Under, etc.
- Defensive fronts: 4-3, 3-4, Nickel, Dime, 4-2-5, Bear, Okie, etc.
- Personnel groupings: 11, 12, 21, 22, 10, 13, etc.
- Play concepts: Power, Counter, Inside Zone, Outside Zone, Split Zone, RPO, Mesh, Levels, Four Verts, etc.
- Down/distance: 3rd and short, 2nd and long, etc.
- Positions: all standard football position names and abbreviations
- Program-specific terminology: learns each coach's vocabulary over time

**What it handles:**
- Film search queries → executes search in Film Room
- Player management commands → updates roster
- Game plan modifications → updates Board
- Practice session creation → builds and pushes session
- Data queries → returns inline visual answer below the bar
- Tag corrections → updates the most recently viewed play
- Bulk actions → "mark all defensive line assignments complete"

**Example commands:**
```
"Show me every play their linebacker blitzed on 3rd and short"
"Add Jackson to the slot receiver group and make him first team"
"Change the play on 2nd and long from Power to Counter"
"Build a coverage recognition session for the quarterbacks using their top 5 defensive looks and push it for Thursday"
"What's our completion rate against Cover 2 this season?"
"Flag that last play as a Cover 4, not Cover 3"
"Push Thursday's walkthrough to the offensive skill group"
"What tendencies has Audible found this week?"
"Generate the scout team card for this week"
"Show me where we're most predictable"
"Their running back's tendencies against odd fronts"
```

---

### 6.3 The Hub

**The Hub is what a coach sees every time they open Audible.** Everything on this screen answers one question: what needs my attention right now?

#### Layout (top to bottom):

**Command Bar** — always at top

**Game Week Panel** (top third of screen)
- Large: opponent name + game date + days until kickoff counter
- Left side: Newsroom Feed (see Section 14)
  - Live scrolling list of everything Audible has surfaced about the upcoming opponent
  - Each item: source tag, reliability indicator dot (green/yellow/red), one-line summary
  - Green dot: film-derived or verified news source
  - Yellow dot: MaxPreps or self-reported data — tap shows "Self-reported, verify against film"
  - Red dot: social media or unverified — "Unverified, treat as rumor"
  - Tapping any item expands full detail
- Right side: Quick intel summary — 3 bullet points from the AI about what to know about this opponent this week

**Intelligence Flags** (scrollable horizontal cards)
- Cards generated from overnight processing
- Each card: one insight + one action + confidence badge + link to clips
- Card types:
  - Pre-snap tell found (amber accent)
  - New tendency identified (blue accent)
  - Self-scout alert — your predictability (red accent)
  - Practice concern — technique degradation spotted (orange accent)
  - Missing game plan situation — nothing called for 2nd and long in red zone (gray accent)
  - Player preparation gap — 6 of 8 DBs failed Cover 4 recognition (purple accent)

**Status Cards** (four cards in a row)
- Film: plays tagged / any corrections needed
- Game Plan: percentage of situations filled
- Player Prep: percentage of this week's assignments completed
- Roster: number of players reporting limited or out

**Week Timeline**
- Visual Monday–Friday strip
- Each day shows what's built: film assignments pushed, practice sessions scheduled, game plan milestones
- Tap any day to see details or drag items to reschedule

**Bottom Navigation** — 5 icons always visible: Hub, Film Room, Field, Board, Roster

---

### 6.4 The Film Room

**The most-used screen in the product.** Where coaches search, review, correct, and package film.

#### Top Bar
- Command bar (persistent)
- Upload button (top right) — drag-and-drop or file picker
- Processing indicator when film is being processed

#### Main View (default: film library)
- Grid of game cards, one per uploaded game
- Each game card: opponent name, date, thumbnail, play count badge
- Tap a game card → expands to play grid

#### Play Grid
- Every play from that game as a thumbnail card
- Each card shows: still frame, down/distance badge, formation tag, outcome indicator
  - Green indicator: positive play outcome
  - Red indicator: negative play outcome
  - Gray: neutral/turnover on downs
- Grid filters (persistent chips above grid): Formation | Down | Distance | Personnel | Quarter | Hash | Outcome | Play Type

#### Film Player (right panel when a clip is selected)
- Video player takes up 65% of screen width
- Controls:
  - Play/pause
  - Scrub bar with thumbnail previews
  - Frame advance (◀◀ ◀ ▶ ▶▶)
  - Speed: 0.25x / 0.5x / 1x / 2x
  - Drawing tools: circle, arrow, line, highlight, eraser — all draw directly on playing video
  - Drawings save with the clip automatically
- Below video: Play data panel
  - All tags displayed as tappable chips
  - Tap any chip → pencil icon appears → tap to edit
  - Correction takes 2 taps: select wrong value, select correct value
  - Confirm correction → system updates, recalculates any affected tendencies, feeds model
- Right sidebar (actions):
  - Save to Collection
  - Push to Players
  - Add to Game Plan
  - Add to Scenario (sends to Field scenario builder)

#### Collections Panel (left sidebar, collapsible)
- Named clip packages: "Their blitz packages," "Our red zone looks," etc.
- Coach creates collections by typing a name
- Drag any clip into any collection
- Collections used for: building scouting packages, player film pushes, scenario building in The Field

#### Search Results View
- When command bar search is executed, play grid replaces library view with matching plays
- Shows match count and the query text
- All filter chips still apply on top of search results
- "Clear search" button returns to library

#### Opponent Playbook Tab
- Second tab at top of Film Room alongside the library
- Auto-generated from film processing
- Structure:
  - Formation tiles (tap to expand)
  - Under each formation: play cards with name, clip count, success rate, situation tags
  - Tap any play: clip reel of all instances
  - Coach can rename any auto-generated play name
  - Any play loadable into The Field with one tap
- Toggle: Offense / Defense (shows opponent's offensive or defensive playbook)

---

### 6.5 The Scouting Hub

Accessed from Film Room (tab) or Hub (tap opponent name). Full opponent analysis organized for coordinator prep.

#### Opponent Summary Card (top)
- Team name, record, conference
- Offensive and defensive tendency rating icons (run-heavy, pass-heavy, pressure-heavy, coverage-heavy — visual icons not numbers)
- 2–3 sentence plain-English AI summary: "This offense runs a spread RPO system favoring the run on early downs. Their QB is decisive but holds the ball under pressure. Most dangerous player: slot receiver, targeted on 34% of pass plays."

#### Tab Structure: Their Offense | Their Defense

**Their Offense Tab:**

Formation frequency chart
- Bar chart or visual layout of their formations
- Ordered by frequency
- Tap any formation → below updates to show all plays from that formation

Play library (under selected formation)
- Every detected play, grouped by run/pass
- Each play: auto-name, clip count, success rate, situation breakdown
- Tap any play → clip reel plays on right

Situation breakdown section
- Accordion by situation: 1st and 10 / 2nd and short / 2nd and long / 3rd and short / 3rd and medium / 3rd and long / Red Zone / Two-Minute
- Each situation: top 3–5 plays with clip counts

Motion and shifts section
- Every detected pre-snap motion
- Frequency and what they typically run after each motion
- Clip evidence for each motion type

Tendency flags section
- Highest-confidence patterns ranked by statistical strength
- Each flag: plain-English statement + confidence level + play count + link to clips

**Their Defense Tab:**

Coverage shell frequency
- How often they show each coverage pre-snap
- Disguise percentage: how often their pre-snap look differs from their actual post-snap coverage
- Tap any coverage → plays where they ran it

Pressure package library
- Every blitz they've shown
- By personnel, formation, down
- Simple top-down field diagram for each pressure
- Clip reel for each package

Front library
- Every defensive front against run situations
- Adjustments to different offensive formations

Same situation breakdown and tendency flags as offense tab, from defensive perspective

---

### 6.6 Player Profiles

Two sections accessible from a single screen: Opponent Roster | Your Roster

**Opponent Player Cards:**
Each opponent player has:
- Name, jersey number, position, physical attributes (from public data / film tracking)
- Film-derived tendency profile
  - Corner example: alignment tendency, cushion depth by down, press rate by formation, recovery ability, double move success rate against them
  - Linebacker example: pass rush move tendency, stunt rate, run fit tendency, coverage assignment frequency
- Every data point shows play count + confidence level
- Every data point links to clips
- AI plain-English summary: "This corner is aggressive in press against boundary receivers but gives significant cushion in slot alignment. Has struggled against double moves — 4 of 6 targeted double moves gained 15+ yards."
- Coach manual annotation field (private to staff, shows above AI profile)

**Your Roster Cards:**
Same card structure for your own players:
- Film-derived stats from own game film (targets, carries, yards, tackles, etc.)
- Mental rep completion rate from Player App
- Accuracy rate on coverage identification challenges
- Progress over season on mental rep metrics
- Status indicator (self-reported: Available / Limited / Day-to-Day / Out)
- Coach can tap any player → full profile → send message → adjust depth chart

---

### 6.7 The Field — Simulation

**The most visually distinctive feature of the product.** An interactive football simulation environment built from real opponent film data.

#### Coach View — Building Scenarios

**Field Display:**
- Top-down football field
- Full field visible — green turf, white yard lines, hash marks, end zone text, yard markers
- Players shown as colored circles with jersey numbers
  - Your team: primary team color
  - Opponent: secondary color / gray
- Smooth fluid animation when plays run
- Route lines trail behind receivers as they run
- Blocking assignments show as directional indicators from blocker to defender
- Run paths animate through the line

**Situation Bar (top of screen):**
- Down | Distance | Yard Line | Quarter | Score Differential
- All tappable and editable
- Changes what defensive personnel and tendency weights load

**Personnel Panel (left sidebar):**
- Two columns: your depth chart and opponent depth chart for the current situation
- Opponent personnel auto-loads based on their tendency for that situation/personnel grouping
- Coach can drag players from panel onto field to override

**Play Selector (bottom drawer — tap to expand):**
- Your playbook plays as visual thumbnail diagram cards
- Organized by formation
- Tap a play → routes and assignments appear on the field as overlays
- Coach can adjust pre-loaded play before running

**Running a Simulation:**
1. Coach taps Run
2. Defense moves to pre-snap alignment (tendency-based)
3. Ball snaps — offense executes the play
4. Defense reacts based on their tendency weights from film
5. Play completes
6. Result card appears:
   - Yards gained
   - Success/failure indicator
   - Plain-English reasoning: "Corner gave 6-yard cushion (his tendency on 3rd and long). Slant completed for 8 yards. Tap to see the 9 plays showing this cushion tendency."
   - Link to film clips
7. Run same play again → statistically varied result based on tendency distributions
8. After 10+ runs: distribution chart appears — "70% of runs gained 4+ yards / 20% gained 1–3 / 10% negative"

**Saving Scenarios:**
- Coach taps Save Scenario
- Names it: "Versus their base Cover 3," "Red zone dime package," etc.
- Scenario card shows defensive thumbnail + play name
- Scenario saved to program's permanent library

**Building Sessions:**
- Coach selects 8–15 saved scenarios
- Arranges them into a session (drag to reorder)
- Assigns session to a position group
- Schedules for a specific day
- Session pushed to all players in that group on that day

**Scout Team Card Generator:**
- Coach selects opponent plays from their extracted playbook
- System generates a formatted physical/digital card showing:
  - Every play to run in practice
  - Formation, motion, personnel for each play
  - Coach notes field
- Printed or displayed on iPad during practice by scout team coordinator

#### Walkthrough Mode

Coach taps "Start Walkthrough" on any play in The Field.

All players in the assigned position group get a push notification: "[Coach Name] has started a walkthrough. Join now."

**Multi-device synchronized experience:**
- Coach device: full top-down field view, sees all 22 players
- Player devices: their position-specific perspective
- Coach taps Play → animates simultaneously on every device
- Coach taps Pause → freezes on every device simultaneously
- Coach speaks to room — players tap their decision in app
- Coach sees response bubbles over each player's circle on their device
- Coach can: rewind, replay, advance to different play, push comprehension question to all devices
- Players can replay walkthrough independently afterward
- Absent players can complete asynchronously — same experience, same questions

**Self-Directed Walkthrough (Player-Initiated):**
- Play loads and pauses at key decision points
- At each pause: question appears ("What coverage is this?" / "Where's your first read?")
- Player answers from options
- Play resumes
- End: score + feedback on each decision point + film clips explaining correct answers

---

### 6.8 The Board — Game Plan

**Visual game plan interface. Looks like a whiteboard. Acts like one.**

#### Layout
- Horizontal scroll of situation columns
- Columns: Opening Script | 1st Down | 2nd and Short | 2nd and Long | 3rd and Short | 3rd and Medium | 3rd and Long | Red Zone | Two Minute | Four Minute | Backed Up | Two-Point Plays | Special

#### Play Cards
Inside each column, plays appear as visual cards:
- Play name
- Thumbnail formation diagram (simple X/O top-down)
- AI confidence badge (green/yellow/gray) — tap shows reasoning + clips
- Opponent tendency it's designed to attack (small text under card)

#### Adding Plays
- Drag from playbook drawer (slides in from right — all your plays as thumbnails)
- Type in command bar: "Add Power to 2nd and short"
- Accept Play Suggester recommendation (see below)

#### Play Suggester
Accessed via button in each situation column or via command bar.

For any selected situation:
- System shows top 3–5 play recommendations
- Each recommendation shows:
  - Play name + formation thumbnail
  - Confidence score (shown as bar, not percentage)
  - Plain-English reasoning: "Four verticals suggested — their Cover 3 safety rotates late on 9 of 14 snaps. There's a deep middle void. Click to see those 9 clips."
  - Clip reel of the tendency evidence

Dismissal flow:
- Coach taps Dismiss
- One-tap reason: "Already in plan" / "Don't like the matchup" / "Not in our system" / "Just no"
- Dismissed suggestions train engine — stops suggesting plays the coordinator consistently rejects

Auto-Generate Full Game Plan:
- One button at top of Board
- System populates its top recommendation for every situation
- Coordinator reviews and edits — reacts to a complete draft rather than building from scratch

#### Offense / Defense Toggle
- Top of Board — toggle switches entire view to defensive game plan
- Same column structure — defensive play calls (fronts, coverages, blitz packages)

#### Publishing
When coordinator locks and taps Publish:
1. Player app assignments push to each position group automatically
2. QB wristband card generates (formatted, ready to print)
3. Sideline call sheet generates (organized by situation)
4. Scout team card generates (opponent plays to run in practice)
5. Practice Builder pre-populates with game plan plays for walkthrough sessions

Published state: plays are locked, shown with lock icon, coordinator must unlock to edit

---

### 6.9 Practice Builder

Where coaches construct the week's mental prep assignments for the Player App.

#### Weekly Calendar View
- Monday–Friday strip at top
- Target session length per day (coach sets, typically 10–15 min)
- Each day shows sessions scheduled

#### Session Types
Five types of sessions:

**1. Film Review**
- Coach selects clips from the film library or collections
- Adds coaching context note to each clip
- Clips deliver to specified position group in order
- Players watch, react (thumbs up / question flag)

**2. Recognition Challenge**
- Coach selects plays from opponent extracted playbook or own film
- Players see formation, must identify: coverage / play type / formation name
- Settings: timer per play (3–10 seconds), disguised or full look, specific position focus
- Immediate feedback after each answer
- Score + breakdown at session end

**3. Decision Drill**
- Coach selects situation and decision type by position:
  - QB: identify coverage + choose first read
  - LB: diagnose run or pass + choose gap
  - DB: identify coverage + choose technique
  - OL: identify stunt + call protection
- Timer matches real game speed (2.5 seconds for QB decisions)
- Feedback shows correct answer + reasoning + clips

**4. Situational Quiz**
- Scenario-based: "It's 3rd and goal from the 7. Their dime package. What coverage are they most likely in?"
- Tests football IQ and situational awareness
- Can be assigned to whole team or specific groups

**5. Virtual Walk-Through**
- Pulls directly from published game plan
- Players go through their specific assignments step by step
- Position-specific: receiver sees their route vs. the coverage; linebacker sees their fit vs. the formation

#### Publishing Sessions
- Coach selects which position group(s) receive each session
- Sets the day it appears in players' apps
- Can build full week of sessions in one sitting on Sunday

#### Completion Tracking
- Real-time dashboard: who completed what, when
- Flag view: which players haven't started Tuesday's session by Wednesday morning
- Coach can send message to all incomplete players with one tap

---

### 6.10 The Roster

#### Main View: Visual Depth Chart
- Position group cards stacked vertically: QB, RB, WR, TE, OL, DL, LB, DB, Special Teams
- Each position: first team / second team / third team as stacked player cards
- Player card shows:
  - Name
  - Jersey number
  - Status dot: green (Available) / yellow (Limited) / orange (Day-to-Day) / red (Out)
  - This week's mental rep completion percentage (circle progress indicator)

#### Drag-and-Drop Depth Chart
- Drag any player card up or down within position to change depth
- Drag between positions to add secondary position
- All downstream updates on drop:
  - Game plan assignment priority
  - Simulation scenario loading
  - Scout team designation
  - Player app game plan view

#### Player Profile (tap any card)
- Photo (if uploaded by player in app)
- Positions listed (player can have multiple)
- Contact info
- Film-derived stats from season
- Mental rep history: accuracy trends, session completion, concepts owned vs. struggling
- Status field with notes
- Coach annotation field
- Message button (sends push notification)
- Depth chart assignment control

#### Player Enrollment
- Coach taps "Add Player"
- Enters name and jersey number
- System generates unique 6-character join code
- Coach gives code to player
- Player enters code in Player App → profile connects
- No email required. No complicated account creation.

#### Filter Bar
- Show: All / By Position / By Status / By Completion Rate
- Sort by completion rate → immediately see who needs a conversation before Wednesday practice

#### Team Message
- Button at top right: "Message Position Group"
- Selects group (or all), types message, sends push notification to all players in group

---

### 6.11 Analytics

Two views toggled at top: **Opponent Analytics** | **Your Team Analytics**

#### Opponent Analytics
- Formation frequency (pie/donut chart)
- Success rate by down and distance (heat map grid)
- Pressure rate by quarter (line chart)
- Target distribution by receiver (bar chart)
- Red zone efficiency by play type (bar chart)
- Historical view: if you've faced this opponent before, tendency evolution over time
- All charts tap through to the underlying clip evidence

#### Your Team Analytics (Self-Scout)
The most uncomfortable and most valuable part of the product.

- Run rate on 1st and 10 by field zone
- Pass rate by down and distance
- Formation frequency — how predictable is your formation → play call relationship
- Motion usage rate
- Red zone efficiency by play type
- Target distribution to your receivers
- Your own blitz rate and success rate by situation

**Predictability Flags:**
- High-confidence patterns you need to break
- "You have run the football on 78% of 1st and 10 snaps from your own territory — 42 plays. A good defensive coordinator will exploit this."
- Tap flag → watch all 42 plays back to back
- Coach decides whether to intentionally break the tendency

**MaxPreps / Stats Export:**
- Film-derived season stats formatted for external reporting
- Export formats: MaxPreps CSV, generic CSV, PDF summary
- One click — eliminates hours of weekly manual stat entry

---

## 7. Player App — Full Specification

### Design Principles for Player App
- Must work in 10–15 minutes
- Phone-first: everything functions one-handed
- No navigation confusion: one clear thing to do on every screen
- Immediate feedback on every interaction
- Gamified enough to build habit, not so gamified it feels childish

---

### 7.1 Home

**First screen on open. Shows exactly what the player needs to do today.**

#### Layout (top to bottom):

**Today's Session Card** (large, prominent, top third)
- Session type icon
- Session name: "Coverage Recognition — vs. Jefferson"
- Estimated time: "~12 minutes"
- Start button (full-width, prominent)
- If complete: green check, "Completed" + option to replay

**Weekly Progress Ring**
- Circular indicator showing overall week completion percentage
- Days of week shown as small dots below ring — green = day complete
- Completion streak counter: "🔥 4-day streak"

**One Opponent Intel Card**
- Single relevant piece of opponent intelligence
- "Their corner gave up 3 deep completions this season in Cover 3 — and you're running 4 verts on Friday."
- Coach-written or AI-generated, set by coach per position group

**Notification Feed**
- When coach pushes new film, new assignment, or sends a message
- Appears below intel card
- Tapping navigates to relevant tab

**Bottom Tab Bar:** Home | Film | Field | Game Plan | Progress

---

### 7.2 Film Tab

**Player-facing film library.**

#### Coach-Pushed Clips Feed
- Scrollable feed of clips pushed to their position group
- Each clip card: thumbnail, coaching note from coach, position relevance tag
- Tap → plays in fullscreen player
- Player controls: play/pause, scrub, 0.5x/1x/2x speed, rewind 10s, frame advance
- After watching: reaction selector
  - 👍 "Got it" — marks as reviewed, logged to coach dashboard
  - ❓ "Question" — flags to coach, shows in coach's Roster screen as a notification
- Watch count shown: if clip is rewatched, logged

#### Self-Directed Search
- Command bar available: player can search the full film library the coach has made available
- "Their corner versus outside receivers"
- "My routes from last game"
- Search results same as Film Room search but filtered to available film

#### Group Film Session Mode
- When coach starts a live session: push notification
- Player taps "Join" → app opens to sync view
- Their screen shows same clip as coach's screen in real time
- Synchronized play/pause/scrub
- Coach can push questions to everyone's screen mid-clip
- Player answers question → coach sees response live

---

### 7.3 The Field (Player)

**Same simulation engine as Coach Platform, filtered to player's position.**

#### Opening Screen
- Week's assigned sessions as a playlist
- Each session: name, type icon, progress ring, estimated time
- "Open Practice" section below: player can run free reps on their own

#### Running a Session

Session begins, plays load in order.

For each play:

**Pre-snap phase:**
- Field displays from player's position-specific perspective (see Section 8)
- Defense in pre-snap alignment
- Player makes pre-snap decisions (varies by position)

**Snap and play execution:**
- Animation runs in real time
- Player makes their decision via on-screen input (varies by position)
- Input locked to game-speed timer

**Result:**
- Play outcome shown
- Judgment: "Good read" / "Wrong read" / "Correct technique" / "Missed assignment"
- Explanation in plain English
- Film clip showing the opponent actually doing what was simulated
- "Next play" button

**Session End Screen:**
- Overall score (correct decisions / total)
- Time breakdown: average decision time per play
- Concept breakdown: which coverage types they nailed vs. missed
- Most missed concept highlighted with option to run extra reps on just that concept

#### Open Practice Mode
- Player selects their position
- Loads any available coverage/formation scenario
- Picks any play from the game plan
- Runs unlimited reps at any difficulty
- Not scored — practice, not assessment

---

### 7.4 My Game Plan

**Player's piece of the game plan. Delivered in plain language with clip context.**

When coach publishes the game plan, this screen populates automatically.

#### Layout
- Accordion cards by situation
- Each card: situation name + their assignment + one film clip as evidence

**Receiver example:**
```
Versus Cover 3 — Comeback at 12 yards
If corner bails early, convert to fade route.
[Clip: their corner in Cover 3, showing the bail]
```

**Linebacker example:**
```
Versus their 12 Personnel — WILL alignment at 4.5 yards
First key: TE's release. Inside release → rotate to hook. Outside → widen to curl-flat.
[Clip: most common play from their 12 personnel]
```

**Update handling:**
- If game plan changes after publish, their card updates automatically
- Push notification: "Your game plan has been updated — [situation] changed"

---

### 7.5 Progress

**Personal development record.**

#### Accuracy Trend
- Line chart: coverage recognition accuracy over the season
- Starts low, trends up (the arc should be visible and motivating)

#### Decision Time Trend
- Average decision time per play over the season
- Trend toward faster decisions is positive

#### Concept Breakdown
- Bar or badge grid showing concept-by-concept accuracy
- "Cover 3: 91% ✓ | Cover 4 disguised as Cover 2: 58% — needs work"
- Tap any concept → launches extra rep session on just that concept

#### Readiness Card (current week)
- "This week's preparation: 87% complete"
- Sessions completed, clips watched, accuracy on this week's specific content
- Visible to position coaches in Roster screen on Coach Platform

#### Season Record
- Total sessions completed
- Total clips watched
- Best weekly streak
- Season accuracy trend

---

## 8. Position-Specific Simulation Modes

Each position gets a unique camera perspective and decision interaction model that matches how that position actually processes the game.

---

### 8.1 Quarterback Mode

**Camera:** Behind-center elevated perspective, ~10 yards back and 15 feet elevated. Full offensive formation visible. Defense in pre-snap alignment visible. Enough field depth to read coverage.

**Pre-snap phase:**
- Defense shows pre-snap alignment (potentially disguised, per tendency data)
- Coverage identification: player taps coverage shell they think it is (Beginner: labeled options / Advanced: unlabeled)
- Protection check: player taps the most likely blitzer
  - Correct → protection holds
  - Incorrect → pressure comes free
- Optional: tap to audible to a different play

**Snap phase:**
- Pocket timer appears (progress bar filling over 2.5 seconds, faster if blitz got free)
- Coverage rotates post-snap per tendency
- Route paths animate in real time
- Player taps the receiver they want to throw to
  - Timing matters: throwing too early or too late affects result
  - First read option: tap the designated route in the play
  - Work progressions: tap secondary or checkdown receivers

**Scramble:**
- Tap scramble button when pocket collapses
- Choose direction (left/right scramble)
- Result calculated on defensive pursuit tendency

**Results:**
- Completion / incompletion / sack / interception
- For incompletions and interceptions: explains exactly why
- "Safety rotated earlier than his 0.7s average. You needed to throw by 1.2s. You held until 1.8s. Here are the 4 plays where he disguises his rotation."

---

### 8.2 Running Back Mode

**Camera:** Behind and above at the mesh point. Sees offensive line, defensive front, backfield action.

**Pre-snap:**
- Identify defensive front (Beginner: labeled / Advanced: not)
- Confirm gap assignment based on play call
- Choose gap: A / B / C / bounce outside

**Snap:**
- Line blocks animate
- Defenders react per their run tendency from film
- Cutback opportunity flash: visual indicator when cutback lane opens

**Decision:**
- Tap cut direction: hit the called gap / cut back / bounce outside
- Timing indicator: how early or late the cut was made
- Contact balance: broke tackle vs. went down first contact (calculated from own/opponent rating)

**Result:**
- Yards gained
- "You cut back correctly — their backside linebacker over-pursued the play-fake at his 40% tendency rate. Here are those plays."

---

### 8.3 Wide Receiver / Tight End Mode

**Camera:** Receiver's perspective at the line of scrimmage looking downfield.

**Pre-snap:**
- Identify technique on corner: press / off / bail
- Choose release based on coverage
- Release options: outside / inside / swim / rip
  - Against press who presses inside 70% of time, outside release is correct

**Route:**
- Route animates, coverage develops
- At break point: choose break — on time / early / late
  - Early break: lose separation from coverage
  - Late break: lose timing with QB
  - Correct: generate separation

**Target:**
- If QB targets this receiver: catch probability shown
- If not targeted: see full play result + whether they were the correct read

---

### 8.4 Offensive Line Mode

**Camera:** Lineman's perspective at the line of scrimmage. Wide enough to see assignment and adjacent gaps.

**Pre-snap:**
- Identify defensive front
- Confirm protection call (from the team's actual protection system)
- Identify the Mike linebacker (for QB to center call chain)
- Man assignment vs. zone assignment based on protection

**Snap:**
- Possible stunt: see defender's first movement
- Decision: follow the stunt (take your man) / pass off (pick up the looper)
- Correct decision based on that defender's stunt tendency

**Pass Pro:**
- Kick slide timing (vs. speed rusher)
- Hand placement timing (engage moment)
- Drive or anchor decision based on bull rush tendency

**Run Block:**
- Initial step direction (away from play / correct)
- Second-level release timing on combo blocks

---

### 8.5 Defensive Line Mode

**Camera:** D-lineman perspective looking at offensive line.

**Pre-snap:**
- Formation read: run or pass tendency, likely gap scheme, pull indicators from stance
- Alignment assignment (gap responsibility)

**Pass Rush:**
- Choose rush move: speed outside / inside counter / bull / spin / swim
- Offensive tackle's tendency determines correct answer
  - "This tackle sets wide on speed rush 70% of time — inside counter is the call"
- Move execution: timing of initial step, hand fighting result

**Run Defense:**
- Identify gap and fit
- Over-pursuit vs. gap integrity decision
- Backfield read key: run vs. pass set from backfield

---

### 8.6 Linebacker Mode

**Camera:** Elevated from linebacker's pre-snap depth. Sees full offensive formation.

**Pre-snap:**
- Alignment based on defensive call
- Identify key (near back / guard depending on technique)

**Post-snap:**
- Key read animation: guard movement, backfield action
- Diagnose: run this direction / run other direction / pass set
- React: move to gap / drop to coverage / pursue blitz

**Run Fit:**
- Gap responsibility choice
- Block type identification: down block / reach block / double team releasing to second level
- Fit decision affects outcome

**Coverage:**
- Hook zone / curl-flat / man on back / blitz lane
- Route recognition timing

---

### 8.7 Cornerback Mode

**Camera:** Corner's position at the line or depth based on coverage call.

**Pre-snap:**
- Coverage assignment technique: press man / off man / inside zone / outside zone
- Read keys at snap: receiver's release hip, receiver's stem direction, QB's eyes

**Press:**
- Jam timing slider (too early = illegal contact, too late = miss, correct = disruption)
- Hand placement choice

**Route Running:**
- Route unfolds in real time
- React to stem: inside stem vs. outside stem
- Double move recognition: don't break early
- Zone: correct leverage based on route combination developing

**Result:**
- Separation allowed
- Whether QB targeted this coverage
- Whether a play was made
- If beat: film clips of similar routes against similar technique to learn from

---

### 8.8 Safety Mode

**Camera:** Elevated, centered, shows full formation — widest field of view of any position.

**Pre-snap disguise phase:**
- Show a pre-snap look (potentially not their actual assignment)
- Choose how long to hold disguise
- Too early rotation → QB reads it → easy throw
- Hold until snap → coverage integrity maintained

**Post-snap rotation:**
- Rotate to actual coverage assignment
- Rotation angle and timing are the decisions
- Wrong angle → out of position for deep ball
- Correct angle → in position to make play

**Two-high responsibilities:**
- Deep half assignment
- When to break on the ball (vs. sitting on a double move)

---

## 9. The Intelligence Layer — What Gets Found Automatically

This section documents all the specific intelligence types Audible generates that human analysis cannot produce manually.

### 9.1 Pre-Snap Tells (Opponent)
Every flagged tell includes:
- Which player exhibits the behavior
- Description of the behavior
- What it predicts
- Correlation percentage
- Play count and confidence rating
- All clips with behavior highlighted

Example output format:
```
PRE-SNAP TELL IDENTIFIED — High Confidence (23 plays)

Player: #72 — LG Marcus Webb
Behavior: Shifts stance weight forward 0.3s before snap
Predicts: Pull play (left or right) 87% of the time
Confirmed: 23 of 26 pull plays show this behavior
Does NOT appear: On pass plays, inside zone plays

[Watch 23 clips] [Dismiss] [Add to Scouting Report]
```

### 9.2 Pre-Snap Tells (Your Own Team)
Same detection runs on your practice and game film. Surfaces your own tells.

Example:
```
SELF-SCOUT ALERT — Your Team

Player: Your QB (#7 — Jordan Smith)  
Behavior: Wider back foot before designed rollouts vs. drop-backs
Visible: 8 of 11 rollout plays this week in practice film
Risk: A prepared DC will find this in your exchanged film

[Watch clips] [Dismiss] [Fix in practice]
```

### 9.3 Fatigue Degradation (Opponent)
```
FATIGUE PATTERN — Opponent

Player: #91 — DE Terrell Jackson
Pattern: Pass rush pressure rate drops from 34% to 11% after snap 35
Typical snap count: 41 snaps per game
Recommendation: Target him late with your best pass concepts in Q3/Q4

[View snap-by-snap data] [See games analyzed]
```

### 9.4 Third-Order Situational Tendencies
```
SITUATIONAL TENDENCY — Very High Confidence

Coordinator Call Pattern: Middle linebacker blitz
Conditions: 3rd and 6–8 yards + red zone + leading by 7 or fewer + 2nd half
Frequency: 9 of 11 times across 4 games this season
Confidence: Very High

[Watch 9 clips] [Add to scouting report] [Counter in game plan]
```

### 9.5 Matchup-Specific Vulnerability
```
MATCHUP VULNERABILITY

Their FS (#21 — Darius Moore) vs. RBs out of the backfield:
- 8.1 yards per target allowed — 12 targets
- Compared to vs. TEs on seams: 2.3 yds/target

Your backs: Jackson and Williams both run the wheel route in your system
Recommendation: Wheel route + flat concepts against Moore's side

[See all 12 clips] [Find your wheel route in playbook]
```

### 9.6 Coverage Rotation Timing
```
COVERAGE ROTATION TIMING

Their FS (#21 — Darius Moore)
Average rotation time to Cover 3 assignment: 0.7s post-snap
At 0.7s: Cannot recover deep middle if ball thrown by 1.4s
Your four verticals: 1.2s throw window to deep crosser

This beats his rotation every time he's in base Cover 3.
[See timing data] [Load into simulation]
```

### 9.7 Play-Call Timing Tell
```
OFFENSIVE COORDINATOR TELL

Observation: When their QB takes >1.8s to reach the line post-huddle, they run on the next snap
Frequency: 21 of 23 instances
Theory: Run play communication requires longer pre-snap sequence

[Watch 21 clips] [Add to game plan notes]
```

### 9.8 Practice Film Intelligence
```
PRACTICE CONCERN

Metric: Left tackle pass set technique
Week progression: 87% clean Tuesday → 61% clean Thursday
Pattern: Kick slide width narrowing through the week (fatigue indicator)
Impact: Sets up their speed rush to the inside against your LT

Recommend: Address in Thursday individual period
[Watch Tuesday clips] [Watch Thursday clips] [Compare side by side]
```

---

## 10. Data Flow — How Everything Connects

```
FILM UPLOAD
    ↓
PROCESSING PIPELINE (overnight)
  - Frame extraction
  - Player detection + jersey OCR
  - Formation identification
  - Play tagging (all dimensions)
  - Pre-snap behavior tracking
  - Player re-identification across frames
    ↓
STRUCTURED TAG DATABASE
  - Every play as a structured data record
  - Every player tracked across every play
    ↓
INTELLIGENCE GENERATION ENGINE
  - Tendency calculations (all dimensions)
  - Pre-snap tell detection
  - Fatigue pattern analysis
  - Situational correlation mining
  - Self-scout pattern detection
    ↓
                    ┌─────────────────────────────────────┐
                    │                                     │
             HUB INTELLIGENCE FEED              SCOUTING HUB
             (top flags surfaced)               (full organized report)
                    │                                     │
             PLAYER PROFILES                   OPPONENT PLAYBOOK
             (individual tendency cards)       (extracted and organized)
                    │                                     │
             ANALYTICS                         PLAY SUGGESTER
             (opponent + self-scout)           (playbook × tendencies)
                    │                                     │
                    └──────────────┬──────────────────────┘
                                   │
                               THE BOARD
                            (game plan built)
                                   │
                              PUBLISHED
                    ┌──────────────┼──────────────┐
                    │              │              │
              PLAYER APP      QB WRISTBAND    SCOUT TEAM CARD
              ASSIGNMENTS     (generated)     (generated)
                    │
              THE FIELD
           (scenarios built from
            opponent playbook +
            tendency data)
                    │
           PLAYER APP SESSIONS
           (mental reps run)
                    │
           PLAYER PERFORMANCE DATA
           (accuracy, timing, completion)
                    │
           ROSTER SCREEN + ANALYTICS
           (coach sees who's prepared)
                    │
           COACH CORRECTIONS
           (feed back into model)
                    ↓
           MODEL IMPROVES
           (more accurate processing
            on this program's film)
```

---

## 11. The Weekly Workflow

### Sunday
- Coach uploads opponent film (Hudl MP4 export)
- Processing begins, runs overnight
- Season schedule shows next 4 opponents — background research running on all

### Monday
- Hub shows film processing complete
- Intelligence flags from overnight processing appear
- Coach reviews top 3 flags (90 seconds)
- Opens Scouting Hub — reviews auto-generated tendency report
- Makes corrections where AI was wrong — 2 taps per correction
- Annotates individual player profiles
- Evening: builds week's Player App sessions in Practice Builder
  - Film review session (game clips)
  - Tuesday recognition challenge (using opponent's top looks)
  - Wednesday decision drills (position-specific)
  - Thursday walkthrough session

### Tuesday
- Players open app → Film session available
- Players watch clips, react, flag questions
- Coach sees completion data updating in real time
- Afternoon: coordinator opens The Board
  - Play Suggester has pre-loaded recommendations
  - Coordinator reviews, adjusts, builds game plan in 20–40 minutes (not 3–4 hours)
- QB recognition session goes live
- Linemen run protection ID session

### Wednesday
- Coach checks Roster screen → sees who hasn't done Tuesday's session
- Sends message to incomplete players with one tap
- Physical practice runs from Scout Team Card (auto-generated)
- Practice film uploaded after practice → processes overnight
- Evening: live walkthrough session in The Field (coach conducts from their device, every player synced)

### Thursday
- Practice film intelligence arrives from Wednesday
  - Technique regression flags
  - Execution consistency report
  - Mental rep → physical rep transfer gaps
- Final game plan adjustments
- Game plan locked and published (all downstream outputs auto-generate)
- Thursday walkthrough: final game plan run-through
- Players have now mentally repped every key situation 20–30 times

### Friday (Game Day)
- Players complete final optional sessions
- Coach views roster readiness snapshot
- Game played with full intelligence foundation

### Post-Game (Saturday/Sunday)
- Game film uploaded
- Self-scout updates with new game data
- Opponent research begins for next week
- Cycle repeats

---

## 12. Film Processing Pipeline

### Upload Handling
- Accepts: Hudl MP4 export (v1)
- Roadmap: Raw MP4, MOV, AVI from GoPro/iPad
- Max file size: handle full-game film (~2–4GB typical)
- Chunked upload with progress indicator
- Upload can happen anytime — processing queues automatically
- Estimate shown: "Estimated processing time: ~6 hours" — notification on complete

### Frame Extraction
- Extract at key points: every snap + 2 seconds pre-snap
- Not every frame — sample strategically around play windows
- Snap detection: audio cue + motion pattern = snap moment identification

### Computer Vision Stack
- Player detection: YOLO/RT-DETR variant fine-tuned on football footage
- Jersey OCR: secondary pass on detected players to read jersey numbers
- Player re-identification: Re-ID model tracks same player across frames when number occluded
- Formation classification: spatial arrangement → formation category
- Play classification: formation + motion + outcome → play type
- Pre-snap behavior: temporal tracking of stance, position, gaze across pre-snap frames

### Tag Database Structure (per play)
```json
{
  "game_id": "uuid",
  "play_id": "uuid",
  "timestamp_start": 234.5,
  "timestamp_end": 241.2,
  "thumbnail_url": "cdn_url",
  "clip_url": "cdn_url",
  "down": 3,
  "distance": 7,
  "hash": "middle",
  "field_zone": "opponent_territory",
  "quarter": 2,
  "score_diff": -3,
  "formation": "shotgun_trips_right",
  "personnel_grouping": "11",
  "motion": "jet_motion_right",
  "play_type": "pass",
  "pass_depth": "intermediate",
  "coverage_shell": "cover_3",
  "pressure_type": "lb_blitz",
  "pressure_source": "weakside_lb",
  "outcome_yards": 12,
  "outcome_success": true,
  "ball_carrier": "player_id",
  "targeted_receiver": "player_id",
  "targeted_receiver_position": "slot",
  "completion": true,
  "pre_snap_behaviors": [
    {
      "player_id": "player_id",
      "behavior_type": "stance_weight_shift",
      "behavior_value": "forward",
      "confidence": 0.87,
      "frame_timestamp": 233.1
    }
  ],
  "players_on_field": ["player_id", ...],
  "coach_corrections": [],
  "confidence_scores": {
    "formation": 0.94,
    "coverage": 0.81,
    "play_type": 0.97
  }
}
```

### Quality Handling
- Low-quality film: lower confidence scores, flagged to coach
- Occluded players: re-ID fills gaps, remaining unknowns flagged
- No jersey visible: player tracked but unidentified until coach corrects
- Poor angle: note attached to clip ("Limited angle — some tags may be inaccurate")

---

## 13. Natural Language Command System

### Architecture
The command bar uses an LLM to parse natural language into structured actions.

### System prompt context includes:
- Full football terminology dictionary
- Program-specific vocabulary (learned over time from usage)
- Current context (which screen, what's selected, recent actions)
- Available actions and their parameters
- Roster data (player names, positions, jersey numbers)
- Playbook data (play names, formations, situations)

### Action categories the LLM maps to:
1. **Film search** → structured filter query on tag database
2. **Roster action** → player management API call
3. **Game plan action** → Board modification
4. **Session creation** → Practice Builder session build
5. **Data query** → Analytics query + inline visual response
6. **Tag correction** → Film Room correction on most recent play
7. **Navigation** → Route to specified screen
8. **Push/message** → Player App notification

### Ambiguity handling:
- If command is ambiguous, system asks one clarifying question
- Never executes a destructive action without showing a confirmation dialog
- Multi-step commands shown as a checklist before execution: "I'll do the following: [list]. Confirm?"

### Football vocabulary foundation:
The system must understand and correctly parse:
- All standard coverage names and abbreviations
- All standard defensive front names
- All personnel grouping codes (11, 12, 21, etc.)
- Run concept names (zone, gap, power, counter, trap, etc.)
- Pass concept names (verticals, mesh, spacing, stick, levels, etc.)
- Position names and abbreviations (all standard)
- Situational terms (backed up, two-minute, red zone, etc.)
- Coaching jargon (cutback, bracket, technique, fits, etc.)

---

## 14. Newsroom / Schedule Intelligence

When a coach enters their season schedule during onboarding, Audible begins automated research on every opponent. This runs continuously through the season.

### Data Sources (ordered by reliability):
1. **Film data** (highest reliability) — everything extracted from uploaded film
2. **Local newspaper game recaps** — verified first-hand accounts
3. **School athletic website** — official roster, schedule, announcements
4. **State athletic association records** — standings, playoff brackets, official results
5. **Hudl public film network** — any publicly available opponent film
6. **MaxPreps** (flagged as self-reported — low reliability)
7. **Social media** (flagged as unverified — lowest reliability)

### What Gets Surfaced:
- Injury reports (local newspaper: "Starting QB did not practice this week")
- Lineup changes ("They've moved their starting safety to corner")
- Recent game results with score
- Film availability notifications ("Their Week 4 film is now available on Hudl — tap to import")
- Coaching changes
- Notable statistical performances from recent games
- Weather for game day (in final 48 hours)

### Reliability Display:
Every item in the newsroom feed shows:
- Source name
- Source type
- Reliability indicator: Green (verified) / Yellow (self-reported) / Red (unverified)
- Timestamp

Yellow items (MaxPreps) always show: "Self-reported data. Verify against film before using in game plan."
Red items always show: "Unverified source. Treat as rumor until confirmed."

### Film Auto-Import:
When Audible detects available opponent film on the Hudl network, it shows an import button directly in the newsroom feed. One tap imports and queues for processing. Coach doesn't have to navigate to Hudl separately.

---

## 15. Auto-Generated Outputs

When the game plan is published, four documents generate automatically.

### 15.1 QB Wristband Card
- Standard wristband card format (fits physical wristband)
- Plays organized by situation code
- Abbreviated play names per program's terminology
- Color-coded by situation category
- PDF output: print-ready
- Digital version: displayed on QB's phone in Player App game plan view

### 15.2 Sideline Call Sheet
- Full-page call sheet organized by situation
- Each situation: top 5–8 plays
- Coach can annotate pre-publish
- PDF output: print-ready at standard call sheet dimensions
- Includes: opponent tendency notes per situation (from Scouting Hub)

### 15.3 Scout Team Card
- Generated from opponent's extracted playbook + coach's selections
- Shows: every play the scout team will run in practice
- For each play: formation diagram, motion if any, personnel grouping, play name, coach notes
- Designed to be run by scout team coordinator without explanation
- Can be displayed on iPad or printed

### 15.4 Player App Assignments
- Position-specific assignment delivery
- Each player gets only their position's relevant assignments
- Receiver: their routes by coverage, their release options, their assignments
- Lineman: protection calls, blocking assignments, key reads
- DB: coverage assignments, technique choices, their matchup intel

### 15.5 MaxPreps / Stats Export
- Generated independently of game plan publication
- Runs automatically after each game film is processed
- Film-derived stats: more accurate and more granular than manual entry
- Output formats: MaxPreps CSV, generic CSV, PDF summary sheet

---

## 16. Design Principles

### Visual and Interactive Over Text
- The product is primarily a visual experience
- Diagrams, animations, and video replace text wherever possible
- Text appears to explain context and evidence — never as the primary interface
- Every tendency should be accompanied by a visual

### Speed Above All
- Film search returns results in under 1 second (queries tags, not video)
- Play cards load thumbnails in under 200ms
- Video starts playing within 1 second of tap
- Command bar response in under 2 seconds for simple actions
- No loading spinners on core actions — skeleton screens only

### Progressive Disclosure
- The Hub shows 3–5 things that matter, never everything
- Drill down goes deeper — coaches go as deep as they need
- Level 1: Hub card (one sentence, one action)
- Level 2: Expanded view (key clips + confidence + basic reasoning)
- Level 3: Full analysis (every clip, every data point, full statistical breakdown)

### Mobile-First for Players
- Player App designed for one-handed phone use
- No scroll depth deeper than 3 taps from home
- Every session complete in 10–15 minutes
- Notifications are purposeful — never spammy
- Streak mechanics are low-pressure but visible

### Trust Through Transparency
- Confidence levels always shown
- Sample size always shown
- "Based on 6 plays — low confidence" is always better than hiding the sample size
- Every AI output shows its evidence
- Every correction is immediately confirmed

### Everything Visual on The Field
- The simulation must look like a video game, not a diagram
- Smooth animations — no teleporting players
- Route lines trail realistically
- Colors are consistent: your team always one color, opponent always another
- Position camera angles feel authentic to how that position sees the game

---

## 17. Database Schema Overview

### Core Tables

**programs** — teams using the platform

**seasons** — each team's season per year

**opponents** — teams faced (may be shared across programs)

**games** — game records linking program + opponent + season

**film_uploads** — each uploaded video file

**plays** — every tagged play (core table, heavily indexed)

**players** — player records linked to program + season

**player_game_appearances** — which players appeared in which games

**pre_snap_behaviors** — behavioral detections per player per play

**tendencies** — calculated tendency records (cached, recalculated on correction)

**tells** — identified pre-snap tells with clip evidence

**fatigue_patterns** — fatigue degradation records per player per game

**collections** — coach-created clip packages

**collection_plays** — plays within collections

**scenarios** — saved simulation scenarios

**sessions** — player app training sessions (assigned by coach)

**session_plays** — plays within sessions

**player_session_results** — player performance per session

**game_plans** — published game plans

**game_plan_plays** — plays within game plans by situation

**game_plan_assignments** — player-specific assignments from game plan

**newsroom_items** — researched intelligence items per opponent

**corrections** — log of all coach tag corrections (used for model training)

---

## 18. API Integrations

### Hudl
- Film import via Hudl exchange/export API
- One-click import of available opponent film
- Authentication: OAuth with Hudl account

### MaxPreps
- Stats export in MaxPreps CSV format
- No import from MaxPreps (data quality too low)

### Local news aggregation
- RSS/API from regional sports news sources
- Filtered by opponent school name, town, and associated coach/player names

### State Athletic Associations
- Schedule and standings data where APIs are available
- Fallback: web scraping for states without APIs

### PFF (Pro Football Focus) / ESPN
- Public stat data for stat supplementation where available
- Used to fill confidence gaps in small sample tendency data

---

## 19. Key Product Rules

These are non-negotiable rules that govern every part of the product.

1. **Every AI insight must link to the clips that generated it.** No unverifiable outputs. Ever.

2. **Every tendency always shows sample size and confidence level.** Never hide uncertainty.

3. **Coaches see all program data.** No role-based restrictions on the Coach Platform. Any coach can see anything the program has access to.

4. **The command bar is always visible on the Coach Platform.** It is never hidden, collapsed, or removed from any screen.

5. **Film search queries the tag database, never raw video.** This is what makes search instant.

6. **Processing is always asynchronous.** No coach waits for film to process. They upload, leave, get notified.

7. **Coach corrections always confirm immediately and update downstream.** Any tendency affected by a corrected tag recalculates and shows updated values within seconds.

8. **The Player App shows only what the coach has pushed.** Players don't see the full Coach Platform. They see their assignments, their position's film, and their own progress.

9. **Every player can have multiple positions.** The system handles position assignments as arrays, never single values.

10. **Publishing the game plan is the only trigger for downstream outputs.** Nothing auto-publishes without explicit coach action. The coach is always in control.

11. **The simulation runs on real tendency weights, not developer-assigned values.** Outcomes are statistically generated from film data every time a play runs.

12. **Every scenario a coach builds saves permanently to the program library.** Nothing gets deleted after game week.

13. **The correction loop is always the path of least resistance.** Correcting a tag should take exactly 2 taps and never more.

14. **MaxPreps data is always flagged as self-reported.** The UI never presents MaxPreps stats with the same confidence as film-derived data.

15. **The Player App must work in 10–15 minutes.** Sessions are capped at a length that respects players' time and builds a sustainable daily habit.

---

*End of Specification — Audible Football Intelligence Platform*

*Version 1.0 — Built for Claude Code handoff*
