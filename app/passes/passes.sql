-- ============================================================
-- Foopy Passes System — run this in your Supabase SQL editor
-- ============================================================

-- ── 1. user_team_passes ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_team_passes (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_name  text        NOT NULL,
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Only one active team pass per user at a time
CREATE UNIQUE INDEX IF NOT EXISTS user_team_passes_one_active
  ON user_team_passes (user_id)
  WHERE active = true;

ALTER TABLE user_team_passes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_passes_select" ON user_team_passes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "team_passes_insert" ON user_team_passes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "team_passes_update" ON user_team_passes
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "team_passes_delete" ON user_team_passes
  FOR DELETE USING (auth.uid() = user_id);

-- ── 2. user_player_passes ────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_player_passes (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_id   text        NOT NULL,   -- slug from players.json
  player_name text        NOT NULL,
  team_name   text        NOT NULL,
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- One active pass per player per user
  UNIQUE (user_id, player_id)
);

ALTER TABLE user_player_passes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player_passes_select" ON user_player_passes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "player_passes_insert" ON user_player_passes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "player_passes_update" ON user_player_passes
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "player_passes_delete" ON user_player_passes
  FOR DELETE USING (auth.uid() = user_id);

-- ── 3. pass_rewards ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pass_rewards (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pass_type   text        NOT NULL CHECK (pass_type IN ('team', 'player')),
  pass_id     uuid        NOT NULL,
  match_id    text        NOT NULL,   -- Squiggle game id (string)
  aura_reward integer     NOT NULL DEFAULT 0,
  coin_reward integer     NOT NULL DEFAULT 0,
  claimed_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Prevents any duplicate claims
  UNIQUE (user_id, pass_type, pass_id, match_id)
);

ALTER TABLE pass_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pass_rewards_select" ON pass_rewards
  FOR SELECT USING (auth.uid() = user_id);
-- Inserts only via service role (API routes) — no direct client insert

-- ── 4. increment_coins RPC ───────────────────────────────────
-- Similar to increment_aura used by the existing aura system
CREATE OR REPLACE FUNCTION increment_coins(
  user_id_param uuid,
  amount_param  integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE profiles
  SET    coins = COALESCE(coins, 0) + amount_param
  WHERE  id = user_id_param;
END;
$$;

-- ── 5. Ensure profiles has coins column ─────────────────────
-- (no-op if it already exists)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS coins integer NOT NULL DEFAULT 0;
