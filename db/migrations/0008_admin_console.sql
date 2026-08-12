CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(254) NOT NULL,
	"display_name" varchar(80) NOT NULL,
	"password_hash" text NOT NULL,
	"role" varchar(16) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"password_changed_at" timestamp with time zone NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "admin_users_email_uq" UNIQUE("email"),
	CONSTRAINT "admin_users_email_normalized_check" CHECK ("admin_users"."email" = lower("admin_users"."email")),
	CONSTRAINT "admin_users_role_check" CHECK ("admin_users"."role" IN ('SUPER_ADMIN', 'EDITOR', 'VIEWER')),
	CONSTRAINT "admin_users_failed_login_attempts_check" CHECK ("admin_users"."failed_login_attempts" >= 0)
);
--> statement-breakpoint
CREATE INDEX "admin_users_active_role_idx" ON "admin_users" USING btree ("active", "role");
--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip_hash" text,
	"user_agent_hash" text,
	CONSTRAINT "admin_sessions_token_hash_uq" UNIQUE("token_hash"),
	CONSTRAINT "admin_sessions_expiry_check" CHECK ("admin_sessions"."expires_at" > "admin_sessions"."created_at")
);
--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "admin_sessions_user_active_idx" ON "admin_sessions" USING btree ("admin_user_id", "expires_at") WHERE "revoked_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions" USING btree ("expires_at");
--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"admin_user_id" uuid,
	"action" varchar(80) NOT NULL,
	"entity_type" varchar(80) NOT NULL,
	"entity_id" varchar(128),
	"request_id" varchar(128) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "admin_audit_log_metadata_check" CHECK (jsonb_typeof("admin_audit_log"."metadata") = 'object')
);
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "admin_audit_log_created_at_idx" ON "admin_audit_log" USING btree ("created_at" DESC);
--> statement-breakpoint
CREATE INDEX "admin_audit_log_actor_created_idx" ON "admin_audit_log" USING btree ("admin_user_id", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "admin_audit_log_entity_created_idx" ON "admin_audit_log" USING btree ("entity_type", "entity_id", "created_at" DESC);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_admin_audit_log_mutation()
RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'admin_audit_log is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "admin_audit_log_immutable_update"
BEFORE UPDATE ON "admin_audit_log"
FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_log_mutation();
--> statement-breakpoint
CREATE TRIGGER "admin_audit_log_immutable_delete"
BEFORE DELETE ON "admin_audit_log"
FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_log_mutation();
