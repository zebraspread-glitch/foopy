-- Add player_fp column to live_game_feed
-- Run this in the Supabase SQL editor.
ALTER TABLE live_game_feed ADD COLUMN IF NOT EXISTS player_fp integer;
