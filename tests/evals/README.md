# LLM Eval Harness

Every LLM touchpoint in the product has an eval test here. When we change a prompt or a model, CI runs these evals and compares outputs against frozen golden fixtures. Regressions fail CI.

## Structure

Each subdirectory corresponds to one LLM touchpoint:

```
tests/evals/
├── coverage-shell/           Phase 4.5 vision task
│   ├── golden-frames.jsonl   Frozen test inputs with ground truth
│   └── run.test.ts           Vitest harness
├── pressure/                 Phase 4.5 vision task
├── command-bar/              Phase 5
├── play-suggester/           Phase 6
└── scouting-summary/         Phase 6
```

## Running

```bash
# Run all evals (hits real model APIs, costs $)
bun run test:evals

# Run a single eval
bun run test:evals tests/evals/coverage-shell
```

## Rules

1. **Golden fixtures are frozen.** When you add a new fixture, it should be a real example you've verified manually, not AI-generated.
2. **Tests assert on schema shape, not exact text.** We care that the model returns valid JSON with the right enum values, not that its `reasoning` field says a specific sentence.
3. **Tests assert on accuracy percentage, not single outputs.** "90% of coverage shell cases correct" is a valid assertion; "this one specific case must return cover_3" is not (models are stochastic).
4. **Tests run against the currently active prompt version** from the prompts table. Changing a prompt means bumping the version and re-running the evals.
5. **CI gates on regressions.** If a test suite's accuracy drops below its threshold, CI fails. Baselines are updated manually with an explicit commit message.

## Cost budget

Target: under $1 per full eval suite run. Current touchpoints are all Haiku or Sonnet with small prompts, so a full run should be well under $0.50.
