-- Adds streak (signed), best streak, and total points to the duel leaderboard.
-- Run once in the Supabase SQL editor.
--
--   streak       : current run — positive for a win streak, negative for a
--                  losing streak (e.g. 3 = won last 3, -2 = lost last 2).
--   best_streak  : longest run of consecutive wins ever.
--   total_points : sum of the player's duel scores across all completed duels.

-- ── Signed current streak ────────────────────────────────────────────────────
create or replace function public.get_duel_signed_streak(p_user_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  streak integer := 0;
  rec record;
  mode text := null; -- 'win' or 'loss'
begin
  for rec in
    select winner_id, is_draw
    from public.duels
    where status = 'complete'
      and (challenger_id = p_user_id or opponent_id = p_user_id)
    order by completed_at desc
  loop
    if rec.is_draw then
      exit;                                   -- a draw ends the streak
    elsif rec.winner_id = p_user_id then
      if mode = 'loss' then exit; end if;     -- streak direction changed
      mode := 'win';
      streak := streak + 1;
    elsif rec.winner_id is not null then
      if mode = 'win' then exit; end if;      -- streak direction changed
      mode := 'loss';
      streak := streak - 1;
    else
      exit;                                   -- unknown outcome
    end if;
  end loop;
  return streak;
end;
$$;

-- ── Best (longest) win streak ────────────────────────────────────────────────
create or replace function public.get_duel_best_streak(p_user_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  best integer := 0;
  cur  integer := 0;
  rec  record;
begin
  for rec in
    select winner_id, is_draw
    from public.duels
    where status = 'complete'
      and (challenger_id = p_user_id or opponent_id = p_user_id)
    order by completed_at asc
  loop
    if not rec.is_draw and rec.winner_id = p_user_id then
      cur := cur + 1;
      if cur > best then best := cur; end if;
    else
      cur := 0;
    end if;
  end loop;
  return best;
end;
$$;

-- ── Leaderboard (now with streak, best_streak, total_points) ─────────────────
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
  streak       integer,
  best_streak  integer,
  total_points bigint
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
    public.get_duel_signed_streak(p.id)                                   as streak,
    public.get_duel_best_streak(p.id)                                     as best_streak,
    coalesce(sum(
      case when d.challenger_id = p.id then coalesce(d.challenger_score, 0)
           else coalesce(d.opponent_score, 0) end
    ), 0)::bigint                                                         as total_points
  from public.profiles p
  join public.duels d
    on d.status = 'complete'
    and (d.challenger_id = p.id or d.opponent_id = p.id)
  join public.duel_games dg on dg.id = d.duel_game_id
  where (p_season is null or dg.season = p_season)
    and (p_round  is null or dg.round  = p_round)
  group by p.id, p.username, p.display_name, p.avatar_url
  order by wins desc, win_rate desc, total_points desc
  limit p_limit;
end;
$$;
