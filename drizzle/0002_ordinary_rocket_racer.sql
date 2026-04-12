CREATE TABLE "game_plan_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"game_plan_id" uuid NOT NULL,
	"position_group" varchar(10) NOT NULL,
	"situation" varchar(30) NOT NULL,
	"assignment_text" text NOT NULL,
	"related_play_ids" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_plan_plays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"game_plan_id" uuid NOT NULL,
	"playbook_play_id" uuid,
	"situation" varchar(30) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"play_name" text NOT NULL,
	"formation" text,
	"play_type" varchar(20),
	"suggester_reasoning" text,
	"suggester_confidence" varchar(20),
	"attacks_tendency" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_plan_assignments" ADD CONSTRAINT "game_plan_assignments_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_plan_assignments" ADD CONSTRAINT "game_plan_assignments_game_plan_id_game_plans_id_fk" FOREIGN KEY ("game_plan_id") REFERENCES "public"."game_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_plan_plays" ADD CONSTRAINT "game_plan_plays_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_plan_plays" ADD CONSTRAINT "game_plan_plays_game_plan_id_game_plans_id_fk" FOREIGN KEY ("game_plan_id") REFERENCES "public"."game_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_plan_plays" ADD CONSTRAINT "game_plan_plays_playbook_play_id_playbook_plays_id_fk" FOREIGN KEY ("playbook_play_id") REFERENCES "public"."playbook_plays"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_plan_assignments_plan_idx" ON "game_plan_assignments" USING btree ("game_plan_id");--> statement-breakpoint
CREATE INDEX "game_plan_assignments_program_idx" ON "game_plan_assignments" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "game_plan_plays_plan_situation_idx" ON "game_plan_plays" USING btree ("game_plan_id","situation");--> statement-breakpoint
CREATE INDEX "game_plan_plays_program_idx" ON "game_plan_plays" USING btree ("program_id");