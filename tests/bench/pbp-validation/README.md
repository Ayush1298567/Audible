# PBP validation bench

Runs the play-call aggregators against real NFL play-by-play data and checks the output against known scouting-truth invariants. This is the Tier 2 feedback loop — no CV, no tracking, just the analytics math on real football data.

## One-time setup

Download the 2023 NFL PBP CSV (~95MB, gitignored):

```bash
cd tests/bench/pbp-validation
curl -sL -o pbp_2023.csv \
  "https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2023.csv"
```

## Run

```bash
bun run bench:pbp             # default KC (Chiefs 2023)
bun run bench:pbp SF          # 49ers
bun run bench:pbp BAL         # Ravens
```

The bench prints:

- **By play type** — run/pass/QB-run split
- **By quarter** — progression of pass rate, explosive rate through the game
- **By situation** — every down × distance bucket, pass/run mix, avg yards
- **Sanity checks** — invariants vs. scouting truth (e.g. "3rd & long ≥ 70% pass on every NFL team")

## What this validates

| Aggregator | Covered? |
|---|---|
| `aggregateByPlayType` | ✅ |
| `aggregateQuarterTendencies` | ✅ |
| `computeSituationalTendencies` | ✅ (pass/run mix only — no coverage/rotation columns in PBP) |
| `aggregatePersonnelTendencies` | ❌ (PBP has `shotgun`/`no_huddle` but not personnel groupings) |
| `aggregateMotionTendencies` | ❌ (motion not labeled in PBP) |
| `aggregateRouteVsCoverage` | ❌ (route concept not labeled; coverage not labeled) |

For the ❌ rows we'd need Big Data Bowl tracking (Kaggle, auth-walled) or PFF charting (paid).

## Why this matters

Our walkthrough aggregators need to produce scouting-truth output. This bench points them at a team whose tendencies are well-documented (Chiefs throw 90% on 3rd-and-long, Ravens run 50%+ on 1st down under Lamar, etc.) and asserts that our math reproduces those truths. If it doesn't, the math is wrong.
