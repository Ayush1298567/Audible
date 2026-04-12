CREATE TYPE "public"."session_type" AS ENUM('film_review', 'recognition_challenge');--> statement-breakpoint
CREATE TABLE "player_session_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"total_questions" integer DEFAULT 0,
	"correct_answers" integer DEFAULT 0,
	"accuracy" real,
	"average_decision_time_ms" integer,
	"question_results" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_plays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"play_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"coach_note" text,
	"correct_answer" text,
	"answer_options" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"name" text NOT NULL,
	"session_type" "session_type" NOT NULL,
	"position_group" varchar(10) NOT NULL,
	"scheduled_for" timestamp with time zone,
	"estimated_minutes" integer DEFAULT 10,
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "player_session_results" ADD CONSTRAINT "player_session_results_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_session_results" ADD CONSTRAINT "player_session_results_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_session_results" ADD CONSTRAINT "player_session_results_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plays" ADD CONSTRAINT "session_plays_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plays" ADD CONSTRAINT "session_plays_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plays" ADD CONSTRAINT "session_plays_play_id_plays_id_fk" FOREIGN KEY ("play_id") REFERENCES "public"."plays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_session_results_session_idx" ON "player_session_results" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "player_session_results_player_idx" ON "player_session_results" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX "session_plays_session_idx" ON "session_plays" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "sessions_program_idx" ON "sessions" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "sessions_program_published_idx" ON "sessions" USING btree ("program_id","is_published");