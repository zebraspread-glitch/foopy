-- Run this in the Supabase SQL editor to add XP to passes

-- Add xp column to both pass tables
ALTER TABLE public.user_player_passes
  ADD COLUMN IF NOT EXISTS xp integer NOT NULL DEFAULT 0;

ALTER TABLE public.user_team_passes
  ADD COLUMN IF NOT EXISTS xp integer NOT NULL DEFAULT 0;

-- RPC: deduct coins (returns false if insufficient)
CREATE OR REPLACE FUNCTION decrement_coins_checked(
  user_id_param uuid,
  amount_param  integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_coins integer;
BEGIN
  SELECT coins INTO current_coins FROM profiles WHERE id = user_id_param FOR UPDATE;
  IF current_coins IS NULL OR current_coins < amount_param THEN
    RETURN false;
  END IF;
  UPDATE profiles SET coins = coins - amount_param WHERE id = user_id_param;
  RETURN true;
END;
$$;

-- RPC: add XP to a player pass
CREATE OR REPLACE FUNCTION add_player_pass_xp(
  user_id_param    uuid,
  player_id_param  text,
  xp_param         integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.user_player_passes
  SET xp = COALESCE(xp, 0) + xp_param
  WHERE user_id  = user_id_param
    AND player_id = player_id_param
    AND active    = true;
END;
$$;

-- RPC: add XP to a team pass
CREATE OR REPLACE FUNCTION add_team_pass_xp(
  user_id_param    uuid,
  team_name_param  text,
  xp_param         integer
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.user_team_passes
  SET xp = COALESCE(xp, 0) + xp_param
  WHERE user_id   = user_id_param
    AND lower(team_name) = lower(team_name_param)
    AND active    = true;
END;
$$;
