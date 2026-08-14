ALTER TABLE "admin_audit_log"
    DROP CONSTRAINT "admin_audit_log_admin_user_id_admin_users_id_fk";
--> statement-breakpoint
ALTER TABLE "admin_audit_log"
    ADD CONSTRAINT "admin_audit_log_admin_user_id_admin_users_id_fk"
    FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id")
    ON DELETE restrict ON UPDATE no action;
