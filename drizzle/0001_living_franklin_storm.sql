CREATE TYPE "public"."frame_type" AS ENUM('pre_snap', 'snap', 'post_snap');--> statement-breakpoint
ALTER TYPE "public"."cv_tag_type" ADD VALUE 'blocking_scheme';--> statement-breakpoint
ALTER TYPE "public"."cv_tag_type" ADD VALUE 'route_concept';--> statement-breakpoint
ALTER TYPE "public"."cv_tag_type" ADD VALUE 'run_gap';--> statement-breakpoint
ALTER TYPE "public"."cv_tag_type" ADD VALUE 'pass_depth_cv';--> statement-breakpoint
ALTER TYPE "public"."cv_tag_type" ADD VALUE 'player_positions';--> statement-breakpoint
CREATE TABLE "player_detections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"play_id" uuid NOT NULL,
	"frame_type" "frame_type" NOT NULL,
	"team" varchar(10) NOT NULL,
	"jersey_number" integer,
	"position_estimate" varchar(10),
	"x_yards" real,
	"y_yards" real,
	"depth_yards" real,
	"alignment_notes" text,
	"prompt_id" uuid,
	"ensemble_confidence" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "player_detections" ADD CONSTRAINT "player_detections_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_detections" ADD CONSTRAINT "player_detections_play_id_plays_id_fk" FOREIGN KEY ("play_id") REFERENCES "public"."plays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_detections" ADD CONSTRAINT "player_detections_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "player_detections_program_play_idx" ON "player_detections" USING btree ("program_id","play_id");--> statement-breakpoint
CREATE INDEX "player_detections_team_position_idx" ON "player_detections" USING btree ("team","position_estimate");