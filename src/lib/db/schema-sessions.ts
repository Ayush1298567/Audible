/**
 * Practice session schema — training sessions assigned by coaches to players.
 *
 * Two session types in Phase 8:
 *   1. Film Review — coach-selected clips pushed to a position group
 *   2. Recognition Challenge — players ID coverages/formations from stills
 *
 * Each session tracks per-player completion and accuracy.
 */

import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { programs, players, plays } from './schema';

export const sessionTypeEnum = pgEnum('session_type', [
  'film_review',
  'recognition_challenge',
  'decision_drill',
  'walkthrough',
  'quiz',
]);

// ─── Scenarios (saved simulation setups) ──────────────────────

export const scenarios = pgTable(
  'scenarios',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    // Situation parameters
    down: integer('down').notNull(),
    distance: integer('distance').notNull(),
    yardLine: integer('yard_line').notNull(),
    formation: text('formation').notNull(),
    // Defense setup
    coverageShell: varchar('coverage_shell', { length: 20 }),
    pressureType: varchar('pressure_type', { length: 20 }),
    // Position mode this scenario targets
    positionMode: varchar('position_mode', { length: 10 }),
    // Opponent context (optional — for tendency-driven scenarios)
    opponentId: uuid('opponent_id'),
    // Access control
    accessLevel: varchar('access_level', { length: 10 }).notNull().default('open'), // open | assigned | locked
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('scenarios_program_idx').on(t.programId),
    index('scenarios_program_position_idx').on(t.programId, t.positionMode),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sessionType: sessionTypeEnum('session_type').notNull(),
    positionGroup: varchar('position_group', { length: 10 }).notNull(),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    estimatedMinutes: integer('estimated_minutes').default(10),
    isPublished: boolean('is_published').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('sessions_program_idx').on(t.programId),
    index('sessions_program_published_idx').on(t.programId, t.isPublished),
  ],
);

export const sessionPlays = pgTable(
  'session_plays',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    playId: uuid('play_id')
      .notNull()
      .references(() => plays.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    coachNote: text('coach_note'),
    // For recognition challenges: the correct answer the player must identify
    correctAnswer: text('correct_answer'),
    // For recognition challenges: the options presented
    answerOptions: jsonb('answer_options'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('session_plays_session_idx').on(t.sessionId),
  ],
);

export const playerSessionResults = pgTable(
  'player_session_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    completed: boolean('completed').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    // For recognition challenges
    totalQuestions: integer('total_questions').default(0),
    correctAnswers: integer('correct_answers').default(0),
    accuracy: real('accuracy'),
    averageDecisionTimeMs: integer('average_decision_time_ms'),
    // Per-question results
    questionResults: jsonb('question_results'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('player_session_results_session_idx').on(t.sessionId),
    index('player_session_results_player_idx').on(t.playerId),
  ],
);

// ─── Film Grades (1/0 per play per player) ────────────────────

export const filmGrades = pgTable(
  'film_grades',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    playId: uuid('play_id')
      .notNull()
      .references(() => plays.id, { onDelete: 'cascade' }),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    grade: integer('grade').notNull(), // 1 = did their job, 0 = didn't
    gradedBy: text('graded_by'), // coach clerk user ID
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('film_grades_program_play_idx').on(t.programId, t.playId),
    index('film_grades_player_idx').on(t.playerId),
  ],
);
