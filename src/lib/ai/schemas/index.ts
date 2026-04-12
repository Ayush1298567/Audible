/**
 * Central AI schema library.
 *
 * Every LLM touchpoint in the product imports its schema from here,
 * not from an inline definition. When we improve a prompt or shape,
 * we update it in exactly one place and every caller gets it. The
 * eval harness also reads from here — there is one source of truth.
 *
 * See PLAN.md §5.8 and finding 2B in the engineering review.
 */

export * from './coverage-shell';
export * from './pressure';

// Future schemas (to be added during their respective phases):
//
// Phase 4.5:
//   export * from './coverage-disguise';
//   export * from './alignment-depth';
//
// Phase 5:
//   export * from './command-bar';
//
// Phase 6:
//   export * from './play-suggester';
//   export * from './intelligence-flags';
//   export * from './scouting-summary';
//   export * from './self-scout-flags';
//
// Phase 7:
//   export * from './assignment-translation';
//
// Phase 8:
//   export * from './practice-session-generation';
//
// Phase 9:
//   export * from './simulation-result-explanation';
