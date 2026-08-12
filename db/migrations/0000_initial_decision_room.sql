CREATE TABLE "game_decision_profiles" (
	"game_id" varchar(64) PRIMARY KEY NOT NULL,
	"min_online_players" integer,
	"max_online_players" integer,
	"min_session_minutes" integer,
	"max_session_minutes" integer,
	"install_size_mb" integer,
	"min_pc_tier" varchar(8),
	"free_to_play" boolean DEFAULT false NOT NULL,
	"communication" smallint,
	"skill" smallint,
	"chaos" smallint,
	"strategy" smallint,
	"story" smallint,
	"difficulty_code" varchar(16),
	"data_status" varchar(16) NOT NULL,
	"source_type" varchar(32),
	"source_url" text,
	"last_verified_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_network_pool_platforms" (
	"network_pool_id" uuid NOT NULL,
	"platform_code" varchar(40) NOT NULL,
	CONSTRAINT "game_network_pool_platforms_network_pool_id_platform_code_pk" PRIMARY KEY("network_pool_id","platform_code")
);
--> statement-breakpoint
CREATE TABLE "game_network_pools" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_id" varchar(64) NOT NULL,
	"pool_code" varchar(80) NOT NULL,
	"region_code" char(2),
	"source_type" varchar(32) NOT NULL,
	"source_url" text,
	"verification_status" varchar(16) NOT NULL,
	"last_verified_at" timestamp with time zone,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "game_platform_offerings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_id" varchar(64) NOT NULL,
	"platform_code" varchar(40) NOT NULL,
	"region_code" char(2),
	"online_supported" boolean NOT NULL,
	"free_to_play" boolean DEFAULT false NOT NULL,
	"requires_paid_online_subscription" boolean,
	"online_requirement_verification_status" varchar(16) NOT NULL,
	"source_type" varchar(32) NOT NULL,
	"source_url" text,
	"verification_status" varchar(16) NOT NULL,
	"last_verified_at" timestamp with time zone,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "game_prices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_id" varchar(64) NOT NULL,
	"platform_code" varchar(40) NOT NULL,
	"region_code" char(2) NOT NULL,
	"store_code" varchar(64) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"regular_amount_minor" bigint,
	"quality" varchar(24) NOT NULL,
	"source_url" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "game_subscription_availability" (
	"id" uuid PRIMARY KEY NOT NULL,
	"game_id" varchar(64) NOT NULL,
	"subscription_plan_id" uuid NOT NULL,
	"platform_code" varchar(40) NOT NULL,
	"region_code" char(2) NOT NULL,
	"access_type" varchar(24) NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"verification_status" varchar(16) NOT NULL,
	"source_type" varchar(32) NOT NULL,
	"source_url" text,
	"last_verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "guest_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "guest_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"guest_session_id" uuid NOT NULL,
	"operation" varchar(80) NOT NULL,
	"key_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participant_owned_games" (
	"id" uuid PRIMARY KEY NOT NULL,
	"participant_id" uuid NOT NULL,
	"game_id" varchar(64) NOT NULL,
	"platform_code" varchar(40),
	"ownership_source" varchar(24) NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participant_platforms" (
	"participant_id" uuid NOT NULL,
	"platform_code" varchar(40) NOT NULL,
	CONSTRAINT "participant_platforms_participant_id_platform_code_pk" PRIMARY KEY("participant_id","platform_code")
);
--> statement-breakpoint
CREATE TABLE "participant_subscriptions" (
	"participant_id" uuid NOT NULL,
	"subscription_plan_id" uuid NOT NULL,
	"self_reported" boolean DEFAULT true NOT NULL,
	"declared_at" timestamp with time zone NOT NULL,
	CONSTRAINT "participant_subscriptions_participant_id_subscription_plan_id_pk" PRIMARY KEY("participant_id","subscription_plan_id")
);
--> statement-breakpoint
CREATE TABLE "platform_references" (
	"code" varchar(40) PRIMARY KEY NOT NULL,
	"family" varchar(20) NOT NULL,
	"display_name" varchar(80) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_candidates" (
	"room_id" uuid NOT NULL,
	"game_id" varchar(64) NOT NULL,
	"base_score" numeric(5, 2) NOT NULL,
	"rank_seed" bigint NOT NULL,
	"evaluation" jsonb NOT NULL,
	"data_snapshot_version" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "room_candidates_room_id_game_id_pk" PRIMARY KEY("room_id","game_id")
);
--> statement-breakpoint
CREATE TABLE "room_decisions" (
	"room_id" uuid PRIMARY KEY NOT NULL,
	"game_id" varchar(64) NOT NULL,
	"selected_by_participant_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_game_history" (
	"room_id" uuid NOT NULL,
	"game_id" varchar(64) NOT NULL,
	"disposition" varchar(16) NOT NULL,
	"created_by_participant_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "room_game_history_room_id_game_id_pk" PRIMARY KEY("room_id","game_id")
);
--> statement-breakpoint
CREATE TABLE "room_matches" (
	"room_id" uuid NOT NULL,
	"game_id" varchar(64) NOT NULL,
	"kind" varchar(8) NOT NULL,
	"match_score" numeric(5, 2) NOT NULL,
	"vote_summary" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "room_matches_room_id_game_id_pk" PRIMARY KEY("room_id","game_id")
);
--> statement-breakpoint
CREATE TABLE "room_participants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"room_id" uuid NOT NULL,
	"guest_session_id" uuid NOT NULL,
	"nickname" varchar(40) NOT NULL,
	"nickname_normalized" varchar(80) NOT NULL,
	"role" varchar(8) NOT NULL,
	"status" varchar(16) NOT NULL,
	"preferences" jsonb NOT NULL,
	"preferences_schema_version" integer NOT NULL,
	"pc_tier" varchar(8),
	"joined_at" timestamp with time zone NOT NULL,
	"left_at" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_round_participants" (
	"room_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	CONSTRAINT "room_round_participants_room_id_participant_id_pk" PRIMARY KEY("room_id","participant_id")
);
--> statement-breakpoint
CREATE TABLE "room_votes" (
	"room_id" uuid NOT NULL,
	"game_id" varchar(64) NOT NULL,
	"participant_id" uuid NOT NULL,
	"value" varchar(8) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "room_votes_room_id_game_id_participant_id_pk" PRIMARY KEY("room_id","game_id","participant_id")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(12) NOT NULL,
	"host_guest_session_id" uuid NOT NULL,
	"status" varchar(16) NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"region_code" char(2) NOT NULL,
	"constraints" jsonb NOT NULL,
	"constraints_schema_version" integer NOT NULL,
	"invite_token_hash" text NOT NULL,
	"prefilter_summary" jsonb,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rooms_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "subscription_plan_regions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"subscription_plan_id" uuid NOT NULL,
	"region_code" char(2) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"capabilities" jsonb NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_until" timestamp with time zone,
	"source_url" text,
	"last_verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"service_id" uuid NOT NULL,
	"code" varchar(80) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "subscription_plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "subscription_services" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(64) NOT NULL,
	"display_name" varchar(80) NOT NULL,
	"publisher" varchar(80) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "subscription_services_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "game_network_pool_platforms" ADD CONSTRAINT "game_network_pool_platforms_network_pool_id_game_network_pools_id_fk" FOREIGN KEY ("network_pool_id") REFERENCES "public"."game_network_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_network_pool_platforms" ADD CONSTRAINT "game_network_pool_platforms_platform_code_platform_references_code_fk" FOREIGN KEY ("platform_code") REFERENCES "public"."platform_references"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_platform_offerings" ADD CONSTRAINT "game_platform_offerings_platform_code_platform_references_code_fk" FOREIGN KEY ("platform_code") REFERENCES "public"."platform_references"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_prices" ADD CONSTRAINT "game_prices_platform_code_platform_references_code_fk" FOREIGN KEY ("platform_code") REFERENCES "public"."platform_references"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_subscription_availability" ADD CONSTRAINT "game_subscription_availability_subscription_plan_id_subscription_plans_id_fk" FOREIGN KEY ("subscription_plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_subscription_availability" ADD CONSTRAINT "game_subscription_availability_platform_code_platform_references_code_fk" FOREIGN KEY ("platform_code") REFERENCES "public"."platform_references"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_guest_session_id_guest_sessions_id_fk" FOREIGN KEY ("guest_session_id") REFERENCES "public"."guest_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_owned_games" ADD CONSTRAINT "participant_owned_games_participant_id_room_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."room_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_owned_games" ADD CONSTRAINT "participant_owned_games_platform_code_platform_references_code_fk" FOREIGN KEY ("platform_code") REFERENCES "public"."platform_references"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_platforms" ADD CONSTRAINT "participant_platforms_participant_id_room_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."room_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_platforms" ADD CONSTRAINT "participant_platforms_platform_code_platform_references_code_fk" FOREIGN KEY ("platform_code") REFERENCES "public"."platform_references"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_subscriptions" ADD CONSTRAINT "participant_subscriptions_participant_id_room_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."room_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_subscriptions" ADD CONSTRAINT "participant_subscriptions_subscription_plan_id_subscription_plans_id_fk" FOREIGN KEY ("subscription_plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_candidates" ADD CONSTRAINT "room_candidates_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_decisions" ADD CONSTRAINT "room_decisions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_decisions" ADD CONSTRAINT "room_decisions_selected_by_participant_id_room_participants_id_fk" FOREIGN KEY ("selected_by_participant_id") REFERENCES "public"."room_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_game_history" ADD CONSTRAINT "room_game_history_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_game_history" ADD CONSTRAINT "room_game_history_created_by_participant_id_room_participants_id_fk" FOREIGN KEY ("created_by_participant_id") REFERENCES "public"."room_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_matches" ADD CONSTRAINT "room_matches_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_participants" ADD CONSTRAINT "room_participants_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_participants" ADD CONSTRAINT "room_participants_guest_session_id_guest_sessions_id_fk" FOREIGN KEY ("guest_session_id") REFERENCES "public"."guest_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_round_participants" ADD CONSTRAINT "room_round_participants_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_round_participants" ADD CONSTRAINT "room_round_participants_participant_id_room_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."room_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_votes" ADD CONSTRAINT "room_votes_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_votes" ADD CONSTRAINT "room_votes_participant_id_room_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."room_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_host_guest_session_id_guest_sessions_id_fk" FOREIGN KEY ("host_guest_session_id") REFERENCES "public"."guest_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_plan_regions" ADD CONSTRAINT "subscription_plan_regions_subscription_plan_id_subscription_plans_id_fk" FOREIGN KEY ("subscription_plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_plans" ADD CONSTRAINT "subscription_plans_service_id_subscription_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."subscription_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_network_pools_lookup_idx" ON "game_network_pools" USING btree ("game_id","region_code");--> statement-breakpoint
CREATE INDEX "game_platform_offerings_lookup_idx" ON "game_platform_offerings" USING btree ("game_id","region_code");--> statement-breakpoint
CREATE INDEX "game_prices_latest_idx" ON "game_prices" USING btree ("game_id","platform_code","region_code","observed_at");--> statement-breakpoint
CREATE INDEX "game_subscription_availability_game_region_idx" ON "game_subscription_availability" USING btree ("game_id","region_code");--> statement-breakpoint
CREATE INDEX "game_subscription_availability_plan_region_idx" ON "game_subscription_availability" USING btree ("subscription_plan_id","region_code");--> statement-breakpoint
CREATE INDEX "game_subscription_availability_valid_until_idx" ON "game_subscription_availability" USING btree ("valid_until");--> statement-breakpoint
CREATE INDEX "guest_sessions_expires_at_idx" ON "guest_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_session_operation_key_uq" ON "idempotency_keys" USING btree ("guest_session_id","operation","key_hash");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "participant_owned_games_participant_idx" ON "participant_owned_games" USING btree ("participant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "room_participants_room_session_uq" ON "room_participants" USING btree ("room_id","guest_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "room_participants_room_nickname_uq" ON "room_participants" USING btree ("room_id","nickname_normalized");--> statement-breakpoint
CREATE INDEX "room_participants_room_status_idx" ON "room_participants" USING btree ("room_id","status");--> statement-breakpoint
CREATE INDEX "room_votes_room_game_idx" ON "room_votes" USING btree ("room_id","game_id");--> statement-breakpoint
CREATE INDEX "rooms_expires_at_idx" ON "rooms" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "rooms_status_expires_at_idx" ON "rooms" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "rooms_host_guest_session_idx" ON "rooms" USING btree ("host_guest_session_id");--> statement-breakpoint
CREATE INDEX "subscription_plan_regions_lookup_idx" ON "subscription_plan_regions" USING btree ("subscription_plan_id","region_code","active");