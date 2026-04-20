/**
 * Central AI schema library.
 *
 * Every LLM touchpoint imports its schema from here. One source of truth.
 * See PLAN.md §5.8.
 */

// Defense
export * from './coverage-shell';
export * from './pressure';
export * from './coverage-disguise';
export * from './alignment-depth';

// Offense
export * from './offense';

// Per-player tracking
export * from './player-positions';
