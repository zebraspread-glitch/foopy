-- Adds a win_streak column to the duel leaderboard so the leaderboard can show
-- each player's current win streak alongside W / L / Win%.
-- Run once in the Supabase SQL editor.

-- The return shape changes, so the old function must be dropped first.
drop function if exists public.get_duel_leaderboard(integer, integer, integer);

create or replace function public.get_duel_leaderboard(
  p_season integer default null,
  p_round  integer default null,
  p_limit  integer default 50
)
returns table (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text,
  wins         bigint,
  losses       bigint,
  draws        bigint,
  total_duels  bigint,
  win_rate     numeric,
  win_streak   integer
)
language plpgsql
security definer
as $$
begin
  return query
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    count(*) filter (where d.winner_id = p.id)                           as wins,
    count(*) filter (
      where d.status = 'complete'
        and d.winner_id is not null
        and d.winner_id != p.id
    )                                                                     as losses,
    count(*) filter (where d.status = 'complete' and d.is_draw = true)   as draws,
    count(*) filter (where d.status = 'complete')                         as total_duels,
    case
      when count(*) filter (where d.status = 'complete' and d.winner_id is not null) > 0
      then round(
        count(*) filter (where d.winner_id = p.id)::numeric /
        count(*) filter (where d.status = 'complete' and d.winner_id is not null)::numeric * 100
      )
      else 0
    end                                                                   as win_rate,
    public.get_duel_win_streak(p.id)                                      as win_streak
  from public.profiles p
  join public.duels d
    on d.status = 'complete'
    and (d.challenger_id = p.id or d.opponent_id = p.id)
  join public.duel_games dg on dg.id = d.duel_game_id
  where (p_season is null or dg.season = p_season)
    and (p_round  is null or dg.round  = p_round)
  group by p.id, p.username, p.display_name, p.avatar_url
  order by wins desc, win_rate desc
  limit p_limit;
end;
$$;
