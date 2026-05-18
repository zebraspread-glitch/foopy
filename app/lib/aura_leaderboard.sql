-- Run this in your Supabase SQL editor

CREATE OR REPLACE FUNCTION get_aura_leaderboard(period text DEFAULT 'overall', limit_n integer DEFAULT 50)
RETURNS TABLE(
  user_id  uuid,
  username text,
  display_name text,
  avatar_url text,
  aura_total bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF period = 'overall' THEN
    RETURN QUERY
      SELECT p.id, p.username, p.display_name, p.avatar_url, COALESCE(p.aura, 0)::bigint
      FROM profiles p
      WHERE COALESCE(p.aura, 0) > 0
      ORDER BY p.aura DESC
      LIMIT limit_n;

  ELSIF period = 'day' THEN
    RETURN QUERY
      SELECT p.id, p.username, p.display_name, p.avatar_url, SUM(ae.amount)::bigint
      FROM aura_events ae JOIN profiles p ON p.id = ae.user_id
      WHERE ae.created_at >= NOW() - INTERVAL '1 day'
      GROUP BY p.id, p.username, p.display_name, p.avatar_url
      ORDER BY SUM(ae.amount) DESC LIMIT limit_n;

  ELSIF period = 'week' THEN
    RETURN QUERY
      SELECT p.id, p.username, p.display_name, p.avatar_url, SUM(ae.amount)::bigint
      FROM aura_events ae JOIN profiles p ON p.id = ae.user_id
      WHERE ae.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY p.id, p.username, p.display_name, p.avatar_url
      ORDER BY SUM(ae.amount) DESC LIMIT limit_n;

  ELSIF period = 'month' THEN
    RETURN QUERY
      SELECT p.id, p.username, p.display_name, p.avatar_url, SUM(ae.amount)::bigint
      FROM aura_events ae JOIN profiles p ON p.id = ae.user_id
      WHERE ae.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY p.id, p.username, p.display_name, p.avatar_url
      ORDER BY SUM(ae.amount) DESC LIMIT limit_n;
  END IF;
END;
$$;

-- Optional but recommended: index for fast overall leaderboard queries
CREATE INDEX IF NOT EXISTS profiles_aura_desc_idx ON profiles(aura DESC NULLS LAST);
