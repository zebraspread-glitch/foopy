-- Run in Supabase SQL Editor — adds name_color to the aura leaderboard so
-- equipped username colours show on the leaderboard too.

-- Must drop first: Postgres can't change a function's return columns via
-- CREATE OR REPLACE.
DROP FUNCTION IF EXISTS get_aura_leaderboard(text, integer);

CREATE FUNCTION get_aura_leaderboard(period text DEFAULT 'overall', limit_n integer DEFAULT 50)
RETURNS TABLE(
  user_id  uuid,
  username text,
  display_name text,
  avatar_url text,
  aura_total bigint,
  verified boolean,
  name_color text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF period = 'overall' THEN
    RETURN QUERY
      SELECT p.id, p.username, p.display_name, p.avatar_url, COALESCE(p.aura, 0)::bigint, COALESCE(p.verified, false), p.name_color
      FROM profiles p
      WHERE COALESCE(p.aura, 0) > 0
      ORDER BY p.aura DESC
      LIMIT limit_n;

  ELSIF period = 'day' THEN
    RETURN QUERY
      SELECT p.id, p.username, p.display_name, p.avatar_url, SUM(ae.amount)::bigint, COALESCE(p.verified, false), p.name_color
      FROM aura_events ae JOIN profiles p ON p.id = ae.user_id
      WHERE ae.created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'Australia/Melbourne') AT TIME ZONE 'Australia/Melbourne'
      GROUP BY p.id, p.username, p.display_name, p.avatar_url, p.verified, p.name_color
      ORDER BY SUM(ae.amount) DESC LIMIT limit_n;

  ELSIF period = 'week' THEN
    RETURN QUERY
      SELECT p.id, p.username, p.display_name, p.avatar_url, SUM(ae.amount)::bigint, COALESCE(p.verified, false), p.name_color
      FROM aura_events ae JOIN profiles p ON p.id = ae.user_id
      WHERE ae.created_at >= DATE_TRUNC('week', NOW() AT TIME ZONE 'Australia/Melbourne') AT TIME ZONE 'Australia/Melbourne'
      GROUP BY p.id, p.username, p.display_name, p.avatar_url, p.verified, p.name_color
      ORDER BY SUM(ae.amount) DESC LIMIT limit_n;

  ELSIF period = 'month' THEN
    RETURN QUERY
      SELECT p.id, p.username, p.display_name, p.avatar_url, SUM(ae.amount)::bigint, COALESCE(p.verified, false), p.name_color
      FROM aura_events ae JOIN profiles p ON p.id = ae.user_id
      WHERE ae.created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'Australia/Melbourne') AT TIME ZONE 'Australia/Melbourne'
      GROUP BY p.id, p.username, p.display_name, p.avatar_url, p.verified, p.name_color
      ORDER BY SUM(ae.amount) DESC LIMIT limit_n;
  END IF;
END;
$$;

-- Re-grant execute (dropping the function can reset call permissions).
GRANT EXECUTE ON FUNCTION get_aura_leaderboard(text, integer) TO anon, authenticated;
