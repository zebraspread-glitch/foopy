-- Records when a duel game was first detected complete, so the resolver can
-- wait a settle period (for AFL player stats to finalise) before locking in
-- duel results. Run once in the Supabase SQL editor.

alter table public.duel_games
  add column if not exists completed_at timestamptz;
