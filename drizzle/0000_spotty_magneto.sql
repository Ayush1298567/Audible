CREATE TYPE "public"."coach_role" AS ENUM('head_coach', 'coordinator', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."cv_tag_type" AS ENUM('coverage_shell', 'pressure_type', 'pressure_source', 'coverage_disguise', 'cushion_depth_cb', 'safety_depth');--> statement-breakpoint
CREATE TYPE "public"."film_processing_status" AS ENUM('uploaded', 'parsing', 'splitting', 'awaiting_cv', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."game_plan_publish_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."play_status" AS ENUM('awaiting_clip', 'awaiting_cv', 'ready', 'clip_failed', 'cv_failed');--> statement-breakpoint
CREATE TABLE "coaches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"role" "coach_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cv_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"play_id" uuid NOT NULL,
	"tag_type" "cv_tag_type" NOT NULL,
	"value" jsonb NOT NULL,
	"prompt_id" uuid NOT NULL,
	"anthropic_confidence" real,
	"openai_confidence" real,
	"ensemble_confidence" real NOT NULL,
	"models_agreed" boolean NOT NULL,
	"is_surfaced" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_bench" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"play_id" uuid NOT NULL,
	"tag_type" "cv_tag_type" NOT NULL,
	"anthropic_value" jsonb,
	"openai_value" jsonb,
	"anthropic_confidence" real,
	"openai_confidence" real,
	"reason" text NOT NULL,
	"prompt_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "film_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"game_id" uuid,
	"idempotency_key" text NOT NULL,
	"csv_blob_key" text,
	"xml_blob_key" text,
	"mp4_blob_key" text,
	"csv_row_count" integer,
	"xml_segment_count" integer,
	"mp4_duration_seconds" real,
	"status" "film_processing_status" DEFAULT 'uploaded' NOT NULL,
	"error_message" text,
	"uploaded_by_clerk_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "film_uploads_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "game_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"opponent_id" uuid NOT NULL,
	"week_label" text NOT NULL,
	"publish_status" "game_plan_publish_status" DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"season_id" uuid,
	"opponent_id" uuid,
	"played_at" timestamp with time zone,
	"is_home" boolean,
	"our_score" integer,
	"opponent_score" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opponents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"state" varchar(2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playbook_plays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"name" text NOT NULL,
	"formation" text NOT NULL,
	"personnel" varchar(10),
	"play_type" varchar(20) NOT NULL,
	"situation_tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"diagram_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"clerk_user_id" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"jersey_number" integer NOT NULL,
	"positions" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"grade" varchar(10),
	"join_code" varchar(8),
	"join_code_expires_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'available' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "plays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"film_upload_id" uuid,
	"play_order" integer NOT NULL,
	"down" integer,
	"distance" integer,
	"distance_bucket" varchar(10),
	"hash" varchar(10),
	"yard_line" integer,
	"field_zone" varchar(30),
	"quarter" integer,
	"score_diff" integer,
	"formation" text,
	"personnel" varchar(10),
	"motion" text,
	"odk" varchar(10),
	"play_type" varchar(20),
	"play_direction" varchar(20),
	"gain_loss" integer,
	"result" text,
	"clip_start_seconds" real,
	"clip_end_seconds" real,
	"clip_blob_key" text,
	"thumbnail_blob_key" text,
	"status" "play_status" DEFAULT 'awaiting_clip' NOT NULL,
	"raw_csv_row" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_org_id" text NOT NULL,
	"name" text NOT NULL,
	"level" varchar(20) NOT NULL,
	"city" text,
	"state" varchar(2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programs_clerk_org_id_unique" UNIQUE("clerk_org_id")
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"system_prompt" text NOT NULL,
	"user_prompt_template" text NOT NULL,
	"model_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coaches" ADD CONSTRAINT "coaches_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_tags" ADD CONSTRAINT "cv_tags_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_tags" ADD CONSTRAINT "cv_tags_play_id_plays_id_fk" FOREIGN KEY ("play_id") REFERENCES "public"."plays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cv_tags" ADD CONSTRAINT "cv_tags_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_bench" ADD CONSTRAINT "eval_bench_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_bench" ADD CONSTRAINT "eval_bench_play_id_plays_id_fk" FOREIGN KEY ("play_id") REFERENCES "public"."plays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_bench" ADD CONSTRAINT "eval_bench_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "film_uploads" ADD CONSTRAINT "film_uploads_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "film_uploads" ADD CONSTRAINT "film_uploads_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_plans" ADD CONSTRAINT "game_plans_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_plans" ADD CONSTRAINT "game_plans_opponent_id_opponents_id_fk" FOREIGN KEY ("opponent_id") REFERENCES "public"."opponents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_opponent_id_opponents_id_fk" FOREIGN KEY ("opponent_id") REFERENCES "public"."opponents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opponents" ADD CONSTRAINT "opponents_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_plays" ADD CONSTRAINT "playbook_plays_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plays" ADD CONSTRAINT "plays_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plays" ADD CONSTRAINT "plays_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plays" ADD CONSTRAINT "plays_film_upload_id_film_uploads_id_fk" FOREIGN KEY ("film_upload_id") REFERENCES "public"."film_uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coaches_program_idx" ON "coaches" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "coaches_clerk_user_idx" ON "coaches" USING btree ("clerk_user_id");--> statement-breakpoint
CREATE INDEX "cv_tags_program_play_idx" ON "cv_tags" USING btree ("program_id","play_id");--> statement-breakpoint
CREATE INDEX "cv_tags_type_surfaced_idx" ON "cv_tags" USING btree ("tag_type","is_surfaced");--> statement-breakpoint
CREATE INDEX "eval_bench_program_idx" ON "eval_bench" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "film_uploads_program_idx" ON "film_uploads" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "film_uploads_status_idx" ON "film_uploads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "game_plans_program_opponent_idx" ON "game_plans" USING btree ("program_id","opponent_id");--> statement-breakpoint
CREATE INDEX "games_program_idx" ON "games" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "games_program_opponent_idx" ON "games" USING btree ("program_id","opponent_id");--> statement-breakpoint
CREATE INDEX "opponents_program_idx" ON "opponents" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "playbook_plays_program_idx" ON "playbook_plays" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "players_program_idx" ON "players" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "players_program_jersey_idx" ON "players" USING btree ("program_id","jersey_number");--> statement-breakpoint
CREATE INDEX "plays_program_game_order_idx" ON "plays" USING btree ("program_id","game_id","play_order");--> statement-breakpoint
CREATE INDEX "plays_program_opponent_situation_idx" ON "plays" USING btree ("program_id","game_id","down","distance_bucket","quarter");--> statement-breakpoint
CREATE INDEX "plays_program_formation_idx" ON "plays" USING btree ("program_id","formation","personnel");--> statement-breakpoint
CREATE INDEX "plays_status_idx" ON "plays" USING btree ("status");--> statement-breakpoint
CREATE INDEX "prompts_name_version_idx" ON "prompts" USING btree ("name","version");--> statement-breakpoint
CREATE INDEX "prompts_active_idx" ON "prompts" USING btree ("name","is_active");--> statement-breakpoint
CREATE INDEX "seasons_program_year_idx" ON "seasons" USING btree ("program_id","year");