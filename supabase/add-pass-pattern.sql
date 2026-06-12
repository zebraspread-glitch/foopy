-- ============================================================
-- Migration: add per-pass background pattern column
-- Run this once in the Supabase SQL Editor (after seed-pass-backgrounds.sql)
-- ============================================================
-- `pattern` stores the equipped pattern KEY (e.g. "stripes", "dots") for
-- this specific Player Pass / Team Pass card. NULL = no pattern equipped,
-- card uses its plain level gradient.
-- ============================================================

ALTER TABLE public.user_player_passes
  ADD COLUMN IF NOT EXISTS pattern text;

ALTER TABLE public.user_team_passes
  ADD COLUMN IF NOT EXISTS pattern text;
