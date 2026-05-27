-- Migration: allow up to MAX_TEAM_PASSES (3) active team passes per user
-- Previously: UNIQUE INDEX on (user_id) WHERE active = true  → only 1 active pass
-- After:      UNIQUE INDEX on (user_id, team_name) WHERE active = true → 1 per team, many teams

-- Drop the old single-active-pass constraint
DROP INDEX IF EXISTS user_team_passes_one_active;

-- New constraint: a user can't have two active passes for the same team,
-- but can hold passes for up to MAX_TEAM_PASSES different teams at once.
CREATE UNIQUE INDEX IF NOT EXISTS user_team_passes_one_active_per_team
  ON user_team_passes (user_id, team_name)
  WHERE active = true;
