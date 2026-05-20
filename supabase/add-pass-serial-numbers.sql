-- ============================================================
-- Migration: add serial_number to pass tables
-- Run this once in the Supabase SQL Editor
-- ============================================================

-- 1. Add serial_number column to both tables
ALTER TABLE public.user_player_passes
  ADD COLUMN IF NOT EXISTS serial_number integer;

ALTER TABLE public.user_team_passes
  ADD COLUMN IF NOT EXISTS serial_number integer;

-- 2. Trigger function: assign serial number for player passes
--    Counts ALL existing passes for that player_id (across all users)
--    so the first buyer globally gets #1, second gets #2, etc.
CREATE OR REPLACE FUNCTION public.assign_player_pass_serial()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT COUNT(*) + 1 INTO NEW.serial_number
  FROM public.user_player_passes
  WHERE player_id = NEW.player_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_player_pass_serial ON public.user_player_passes;
CREATE TRIGGER trg_player_pass_serial
  BEFORE INSERT ON public.user_player_passes
  FOR EACH ROW EXECUTE FUNCTION public.assign_player_pass_serial();

-- 3. Trigger function: assign serial number for team passes
CREATE OR REPLACE FUNCTION public.assign_team_pass_serial()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  SELECT COUNT(*) + 1 INTO NEW.serial_number
  FROM public.user_team_passes
  WHERE team_name = NEW.team_name;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_team_pass_serial ON public.user_team_passes;
CREATE TRIGGER trg_team_pass_serial
  BEFORE INSERT ON public.user_team_passes
  FOR EACH ROW EXECUTE FUNCTION public.assign_team_pass_serial();

-- 4. Back-fill serial numbers for any existing passes
--    (assigns them in created_at order — earliest buyer gets the lowest number)
WITH ranked_player AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY created_at ASC) AS rn
  FROM public.user_player_passes
)
UPDATE public.user_player_passes p
SET serial_number = r.rn
FROM ranked_player r
WHERE p.id = r.id AND p.serial_number IS NULL;

WITH ranked_team AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY team_name ORDER BY created_at ASC) AS rn
  FROM public.user_team_passes
)
UPDATE public.user_team_passes t
SET serial_number = r.rn
FROM ranked_team r
WHERE t.id = r.id AND t.serial_number IS NULL;
