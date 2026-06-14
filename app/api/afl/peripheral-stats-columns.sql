-- Add tackles / marks / hitouts snapshot columns to live_game_feed.
-- These freeze each player's peripheral stats at the moment of the event, so the
-- feed box can show their standout stat (T / M / HO) without it drifting as the
-- game goes on — same treatment as player_disposals / player_goals.
-- Run this in the Supabase SQL editor BEFORE deploying the matching code.
ALTER TABLE live_game_feed ADD COLUMN IF NOT EXISTS player_tackles integer;
ALTER TABLE live_game_feed ADD COLUMN IF NOT EXISTS player_marks   integer;
ALTER TABLE live_game_feed ADD COLUMN IF NOT EXISTS player_hitouts integer;
