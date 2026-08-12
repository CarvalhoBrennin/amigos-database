CREATE INDEX "game_prices_game_region_observed_idx" ON "game_prices" USING btree ("game_id","region_code","observed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "room_participants_session_room_idx" ON "room_participants" USING btree ("guest_session_id","room_id");--> statement-breakpoint
CREATE INDEX "room_votes_room_participant_game_idx" ON "room_votes" USING btree ("room_id","participant_id","game_id");
