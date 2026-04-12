/**
 * Audible — database schema (Drizzle)
 *
 * Every tenant-scoped table has an explicit `programId` column.
 * RLS policies defined in `drizzle/0001_rls.sql` enforce that
 * cross-program reads return zero rows.
 *
 * See PLAN.md §5.2 for the tenancy isolation contract.
 *
 * ASCII data model (Phase 1-4.5 core):
 *
 *   programs (1) ───< (M) seasons
 *       │                │
 *       │                └──< (M) games ───< (M) plays ───< (M) cv_tags
 *       │                         │                │
 *       │                         └──< (M) film_uploads
 *       │
 *       └───< (M) players
 *       └───< (M) playbook_plays
 *       └───< (M) opponents
 */

import { sql } from 'drizzle-orm';
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

// ─── Enums ──────────────────────────────────────────────────────

export const coachRoleEnum = pgEnum('coach_role', [
  'head_coach',
  'coordinator',
  'assistant',
]);

export const filmProcessingStatusEnum = pgEnum('film_processing_status', [
  'uploaded',
  'parsing',
  'splitting',
  'awaiting_cv',
  'ready',
  'failed',
]);

export const playStatusEnum = pgEnum('play_status', [
  'awaiting_clip',
  'awaiting_cv',
  'ready',
  'clip_failed',
  'cv_failed',
]);

export const cvTagTypeEnum = pgEnum('cv_tag_type', [
  // Defense
  'coverage_shell',
  'pressure_type',
  'pressure_source',
  'coverage_disguise',
  'cushion_depth_cb',
  'safety_depth',
  // Offense
  'blocking_scheme',
  'route_concept',
  'run_gap',
  'pass_depth_cv',
  // Per-player
  'player_positions',
]);

export const frameTypeEnum = pgEnum('frame_type', [
  'pre_snap',
  'snap',
  'post_snap',
]);

export const gamePlanPublishStatusEnum = pgEnum('game_plan_publish_status', [
  'draft',
  'published',
  'archived',
]);

// ─── Programs (tenant root) ─────────────────────────────────────

export const programs = pgTable('programs', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkOrgId: text('clerk_org_id').notNull().unique(),
  name: text('name').notNull(),
  level: varchar('level', { length: 20 }).notNull(), // 'hs' | 'd2' | 'd3'
  city: text('city'),
  state: varchar('state', { length: 2 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Coaches (per-program memberships) ──────────────────────────

export const coaches = pgTable(
  'coaches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    clerkUserId: text('clerk_user_id').notNull(),
    email: text('email').notNull(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    role: coachRoleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('coaches_program_idx').on(t.programId),
    index('coaches_clerk_user_idx').on(t.clerkUserId),
  ],
);

// ─── Players ─────────────────────────────────────────────────────

export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    clerkUserId: text('clerk_user_id'),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    jerseyNumber: integer('jersey_number').notNull(),
    // Array — every player can have multiple positions (spec §19 rule 7)
    positions: text('positions').array().notNull().default(sql`ARRAY[]::text[]`),
    grade: varchar('grade', { length: 10 }),
    joinCode: varchar('join_code', { length: 8 }).unique(),
    joinCodeExpiresAt: timestamp('join_code_expires_at', { withTimezone: true }),
    status: varchar('status', { length: 20 }).notNull().default('available'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('players_program_idx').on(t.programId),
    index('players_program_jersey_idx').on(t.programId, t.jerseyNumber),
  ],
);

// ─── Opponents ──────────────────────────────────────────────────

export const opponents = pgTable(
  'opponents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    city: text('city'),
    state: varchar('state', { length: 2 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('opponents_program_idx').on(t.programId)],
);

// ─── Seasons ─────────────────────────────────────────────────────

export const seasons = pgTable(
  'seasons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    year: integer('year').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('seasons_program_year_idx').on(t.programId, t.year)],
);

// ─── Games ───────────────────────────────────────────────────────

export const games = pgTable(
  'games',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    seasonId: uuid('season_id').references(() => seasons.id, { onDelete: 'set null' }),
    opponentId: uuid('opponent_id').references(() => opponents.id, { onDelete: 'set null' }),
    playedAt: timestamp('played_at', { withTimezone: true }),
    isHome: boolean('is_home'),
    ourScore: integer('our_score'),
    opponentScore: integer('opponent_score'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('games_program_idx').on(t.programId),
    index('games_program_opponent_idx').on(t.programId, t.opponentId),
  ],
);

// ─── Film uploads (ingestion unit) ──────────────────────────────

export const filmUploads = pgTable(
  'film_uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    gameId: uuid('game_id').references(() => games.id, { onDelete: 'set null' }),
    // Idempotency key: sha256(mp4) + programId + gameId
    idempotencyKey: text('idempotency_key').notNull().unique(),
    csvBlobKey: text('csv_blob_key'),
    xmlBlobKey: text('xml_blob_key'),
    mp4BlobKey: text('mp4_blob_key'),
    csvRowCount: integer('csv_row_count'),
    xmlSegmentCount: integer('xml_segment_count'),
    mp4DurationSeconds: real('mp4_duration_seconds'),
    status: filmProcessingStatusEnum('status').notNull().default('uploaded'),
    errorMessage: text('error_message'),
    uploadedByClerkUserId: text('uploaded_by_clerk_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    index('film_uploads_program_idx').on(t.programId),
    index('film_uploads_status_idx').on(t.status),
  ],
);

// ─── Plays (the core tag DB, heavily indexed) ──────────────────

export const plays = pgTable(
  'plays',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    gameId: uuid('game_id')
      .notNull()
      .references(() => games.id, { onDelete: 'cascade' }),
    filmUploadId: uuid('film_upload_id').references(() => filmUploads.id, {
      onDelete: 'set null',
    }),
    // Play ordering within the game, matches CSV row order
    playOrder: integer('play_order').notNull(),

    // ── From Hudl (base tags) ────────────────────────────────
    down: integer('down'),
    distance: integer('distance'),
    distanceBucket: varchar('distance_bucket', { length: 10 }), // short/medium/long
    hash: varchar('hash', { length: 10 }), // left/middle/right
    yardLine: integer('yard_line'),
    fieldZone: varchar('field_zone', { length: 30 }),
    quarter: integer('quarter'),
    scoreDiff: integer('score_diff'),
    formation: text('formation'),
    personnel: varchar('personnel', { length: 10 }), // '11', '12', '21'...
    motion: text('motion'),
    odk: varchar('odk', { length: 10 }), // offense/defense/kick
    playType: varchar('play_type', { length: 20 }),
    playDirection: varchar('play_direction', { length: 20 }),
    gainLoss: integer('gain_loss'),
    result: text('result'),

    // ── Clip data ────────────────────────────────────────────
    clipStartSeconds: real('clip_start_seconds'),
    clipEndSeconds: real('clip_end_seconds'),
    clipBlobKey: text('clip_blob_key'),
    thumbnailBlobKey: text('thumbnail_blob_key'),

    // ── Processing state ─────────────────────────────────────
    status: playStatusEnum('status').notNull().default('awaiting_clip'),

    // ── Raw Hudl CSV row (for debugging / schema evolution) ──
    rawCsvRow: jsonb('raw_csv_row'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Composite indexes for the top tendency query shapes (PLAN.md §5.6)
    index('plays_program_game_order_idx').on(t.programId, t.gameId, t.playOrder),
    index('plays_program_opponent_situation_idx').on(
      t.programId,
      t.gameId,
      t.down,
      t.distanceBucket,
      t.quarter,
    ),
    index('plays_program_formation_idx').on(t.programId, t.formation, t.personnel),
    index('plays_status_idx').on(t.status),
  ],
);

// ─── Prompts (versioned LLM prompts for CV + reasoning) ────────

export const prompts = pgTable(
  'prompts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(), // 'coverage_shell', 'play_suggester', etc.
    version: integer('version').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    systemPrompt: text('system_prompt').notNull(),
    userPromptTemplate: text('user_prompt_template').notNull(),
    modelId: text('model_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('prompts_name_version_idx').on(t.name, t.version),
    index('prompts_active_idx').on(t.name, t.isActive),
  ],
);

// ─── CV tags (vision ensemble output) ──────────────────────────

export const cvTags = pgTable(
  'cv_tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    playId: uuid('play_id')
      .notNull()
      .references(() => plays.id, { onDelete: 'cascade' }),
    tagType: cvTagTypeEnum('tag_type').notNull(),
    // Structured tag payload — schema varies per tagType, validated at write time
    value: jsonb('value').notNull(),
    // Which prompt produced this tag — PLAN.md §5.4
    promptId: uuid('prompt_id')
      .notNull()
      .references(() => prompts.id),
    // Ensemble metadata
    anthropicConfidence: real('anthropic_confidence'),
    openaiConfidence: real('openai_confidence'),
    ensembleConfidence: real('ensemble_confidence').notNull(),
    modelsAgreed: boolean('models_agreed').notNull(),
    // Surface gate — only tags above threshold are shown in UI
    isSurfaced: boolean('is_surfaced').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('cv_tags_program_play_idx').on(t.programId, t.playId),
    index('cv_tags_type_surfaced_idx').on(t.tagType, t.isSurfaced),
  ],
);

// ─── Eval bench (discarded ensemble disagreements for future training) ──

export const evalBench = pgTable(
  'eval_bench',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    playId: uuid('play_id')
      .notNull()
      .references(() => plays.id, { onDelete: 'cascade' }),
    tagType: cvTagTypeEnum('tag_type').notNull(),
    anthropicValue: jsonb('anthropic_value'),
    openaiValue: jsonb('openai_value'),
    anthropicConfidence: real('anthropic_confidence'),
    openaiConfidence: real('openai_confidence'),
    reason: text('reason').notNull(), // 'disagreement' | 'below_threshold'
    promptId: uuid('prompt_id')
      .notNull()
      .references(() => prompts.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('eval_bench_program_idx').on(t.programId)],
);

// ─── Player detections (per-player positions from CV) ───────────
//
// One row per player per frame. A single play with 2 frames and 22
// visible players produces ~44 rows. At 60 plays/game × 10 games/season
// = ~26k rows/program/season. Postgres handles this easily.

export const playerDetections = pgTable(
  'player_detections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    playId: uuid('play_id')
      .notNull()
      .references(() => plays.id, { onDelete: 'cascade' }),
    frameType: frameTypeEnum('frame_type').notNull(),
    // Which side of the ball
    team: varchar('team', { length: 10 }).notNull(), // 'offense' | 'defense'
    // Jersey number if readable by the vision model
    jerseyNumber: integer('jersey_number'),
    // Position estimate from the vision model
    positionEstimate: varchar('position_estimate', { length: 10 }),
    // Approximate field coordinates
    // x = yard line (0-100, 0 = own end zone, 100 = opponent end zone)
    // y = lateral position (0-53.3, 0 = near sideline, 53.3 = far sideline)
    xYards: real('x_yards'),
    yYards: real('y_yards'),
    // Depth from line of scrimmage (positive = off the ball, negative = in backfield)
    depthYards: real('depth_yards'),
    // Alignment notes from the vision model
    alignmentNotes: text('alignment_notes'),
    // Prompt/model tracking
    promptId: uuid('prompt_id').references(() => prompts.id),
    ensembleConfidence: real('ensemble_confidence'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('player_detections_program_play_idx').on(t.programId, t.playId),
    index('player_detections_team_position_idx').on(t.team, t.positionEstimate),
  ],
);

// ─── Playbook plays (coach's own plays) ─────────────────────────

export const playbookPlays = pgTable(
  'playbook_plays',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    formation: text('formation').notNull(),
    personnel: varchar('personnel', { length: 10 }),
    playType: varchar('play_type', { length: 20 }).notNull(),
    situationTags: text('situation_tags').array().notNull().default(sql`ARRAY[]::text[]`),
    diagramJson: jsonb('diagram_json'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('playbook_plays_program_idx').on(t.programId)],
);

// ─── Game plans ─────────────────────────────────────────────────

export const gamePlans = pgTable(
  'game_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    opponentId: uuid('opponent_id')
      .notNull()
      .references(() => opponents.id, { onDelete: 'cascade' }),
    weekLabel: text('week_label').notNull(),
    publishStatus: gamePlanPublishStatusEnum('publish_status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('game_plans_program_opponent_idx').on(t.programId, t.opponentId)],
);

// Re-export game plan extension tables
export { gamePlanPlays, gamePlanAssignments } from './schema-gameplan';
