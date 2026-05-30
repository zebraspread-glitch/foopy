-- Run this in your Supabase SQL editor to enable per-game and per-team aura leaderboards.

-- ── Per-game aura leaderboard ────────────────────────────────────────────────
-- Returns top aura earners for a specific game, combining:
--   • live_game_view events (related_id = game_id)
--   • poll_correct events for polls belonging to that game

CREATE OR REPLACE FUNCTION get_game_aura_leaderboard(
  p_game_id bigint,
  limit_n   integer DEFAULT 20
)
RETURNS TABLE(
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text,
  aura_total   bigint
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
    SELECT
      p.id,
      p.username,
      p.display_name,
      p.avatar_url,
      SUM(ae.amount)::bigint AS aura_total
    FROM aura_events ae
    JOIN profiles p ON p.id = ae.user_id
    WHERE
      (ae.event_type = 'live_game_view' AND ae.related_id = p_game_id::text)
      OR
      (ae.event_type = 'poll_correct' AND ae.related_id IN (
        SELECT 'poll_' || mp.id::text
        FROM match_polls mp
        WHERE mp.game_id = p_game_id
      ))
    GROUP BY p.id, p.username, p.display_name, p.avatar_url
    HAVING SUM(ae.amount) > 0
    ORDER BY SUM(ae.amount) DESC
    LIMIT limit_n;
END;
$$;

-- ── Per-team supporter aura leaderboard ──────────────────────────────────────
-- Returns the top aura holders who have an active pass for the given team.

CREATE OR REPLACE FUNCTION get_team_aura_leaderboard(
  p_team_name text,
  limit_n     integer DEFAULT 20
)
RETURNS TABLE(
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text,
  aura_total   bigint
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
    SELECT
      p.id,
      p.username,
      p.display_name,
      p.avatar_url,
      COALESCE(p.aura, 0)::bigint AS aura_total
    FROM profiles p
    WHERE p.id IN (
      SELECT DISTINCT user_id
      FROM user_team_passes
      WHERE team_name ILIKE p_team_name
        AND active = true
    )
    ORDER BY p.aura DESC NULLS LAST
    LIMIT limit_n;
END;
$$;
