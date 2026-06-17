-- ============================================================
-- Foopy scale indexes — run once in the Supabase SQL editor.
-- These back the hot-path queries that get linearly slower as the
-- tables grow. Without them, those queries are sequential scans:
-- fine at a few hundred rows, a problem at tens of thousands.
-- All are CREATE INDEX IF NOT EXISTS, so this is safe to re-run.
-- ============================================================

-- ── Leaderboards: ORDER BY xp DESC WHERE active ──────────────
-- /api/passes/global-leaderboard sorts active passes by xp. A partial
-- index on active rows, descending by xp, makes the top-N a cheap scan
-- of the index head instead of sorting the whole table every request.
CREATE INDEX IF NOT EXISTS user_player_passes_active_xp_idx
  ON public.user_player_passes (xp DESC)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS user_team_passes_active_xp_idx
  ON public.user_team_passes (xp DESC)
  WHERE active = true;

-- ── Duel matchmaking: find the oldest WAITING duel for a game ─
-- /api/duels/enter looks up (duel_game_id, status='waiting') ordered by
-- created_at. This index serves both the lookup and the ordering, so
-- claiming a match stays O(1)-ish no matter how many duels exist.
CREATE INDEX IF NOT EXISTS duels_matchmaking_idx
  ON public.duels (duel_game_id, status, created_at);

-- ── Duel leaderboard / stats: complete duels per participant ──
-- get_duel_leaderboard and the duel_stats view filter on status='complete'
-- and join on challenger_id OR opponent_id. An OR can't use a single
-- composite index, so we give it one partial index per side.
CREATE INDEX IF NOT EXISTS duels_complete_challenger_idx
  ON public.duels (challenger_id)
  WHERE status = 'complete';

CREATE INDEX IF NOT EXISTS duels_complete_opponent_idx
  ON public.duels (opponent_id)
  WHERE status = 'complete';

-- ── "Already entered this duel game?" check in /api/duels/enter ─
-- Filters duels by duel_game_id + the current user on either side.
CREATE INDEX IF NOT EXISTS duels_game_challenger_idx
  ON public.duels (duel_game_id, challenger_id);

CREATE INDEX IF NOT EXISTS duels_game_opponent_idx
  ON public.duels (duel_game_id, opponent_id);

-- Note: user_cards already has UNIQUE (user_id, player_id, rarity), whose
-- leading columns cover the open-pack existing-cards lookup, so no extra
-- index is needed there.
