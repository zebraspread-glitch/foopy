-- Run this in your Supabase SQL editor
-- Uses Australia/Melbourne timezone so Today/Week/Month reset at midnight Melbourne time

CREATE OR REPLACE FUNCTION get_aura_leaderboard(period text DEFAULT 'overall', limit_n integer DEFAULT 50)
RETURNS TABLE(
  user_id  uuid,
  username text,
  display_name text,
  avatar_url text,
  aura_total bigint,
  verified boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF period = 'overall' THEN
    RETURN QUERY
      SELECT p.id, p.username, p.display_name, p.avatar_url, COALESCE(p.aura, 0)::bigint, COALESCE(p.verified, false)
      FROM profiles p
      WHERE COALESCE(p.aura, 0) > 0
      ORDER BY p.aura DESC
      LIMIT limit_n;

  ELSIF period = 'day' THEN
    -- Since midnight today Melbourne time
    RETURN QUERY
      SELECT p.id, p.username, p.display_name, p.avatar_url, SUM(ae.amount)::bigint, COALESCE(p.verified, false)
      FROM aura_events ae JOIN profiles p ON p.id = ae.user_id
      WHERE ae.created_at >= DATE_TRUNC('day', NOW() AT TIME ZONE 'Australia/Melbourne') AT TIME ZONE 'Australia/Melbourne'
      GROUP BY p.id, p.username, p.display_name, p.avatar_url, p.verified
      ORDER BY SUM(ae.amount) DESC LIMIT limit_n;

  ELSIF period = 'week' THEN
    -- Since Monday this week Melbourne time
    RETURN QUERY
      SELECT p.id, p.username, p.display_name, p.avatar_url, SUM(ae.amount)::bigint, COALESCE(p.verified, false)
      FROM aura_events ae JOIN profiles p ON p.id = ae.user_id
      WHERE ae.created_at >= DATE_TRUNC('week', NOW() AT TIME ZONE 'Australia/Melbourne') AT TIME ZONE 'Australia/Melbourne'
      GROUP BY p.id, p.username, p.display_name, p.avatar_url, p.verified
      ORDER BY SUM(ae.amount) DESC LIMIT limit_n;

  ELSIF period = 'month' THEN
    -- Since the 1st of this month Melbourne time
    RETURN QUERY
      SELECT p.id, p.username, p.display_name, p.avatar_url, SUM(ae.amount)::bigint, COALESCE(p.verified, false)
      FROM aura_events ae JOIN profiles p ON p.id = ae.user_id
      WHERE ae.created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'Australia/Melbourne') AT TIME ZONE 'Australia/Melbourne'
      GROUP BY p.id, p.username, p.display_name, p.avatar_url, p.verified
      ORDER BY SUM(ae.amount) DESC LIMIT limit_n;
  END IF;
END;
$$;

-- Optional but recommended: index for fast overall leaderboard queries
CREATE INDEX IF NOT EXISTS profiles_aura_desc_idx ON profiles(aura DESC NULLS LAST);
