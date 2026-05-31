-- ============================================================
-- Foopy Duels System — Run in Supabase SQL Editor
-- ============================================================

-- 1. DUEL GAMES (admin-enabled games with duels)
-- ============================================================
create table if not exists public.duel_games (
  id          uuid        primary key default gen_random_uuid(),
  game_id     integer     not null,
  round       integer     not null,
  season      integer     not null,
  home_team   text        not null,
  away_team   text        not null,
  game_date   timestamptz not null,
  status      text        not null default 'open' check (status in ('open','locked','complete')),
  created_at  timestamptz not null default now()
);

alter table public.duel_games enable row level security;

create policy "Anyone can read duel games"
  on public.duel_games for select using (true);

-- 2. DUEL QUESTIONS (10 normal + 1 tiebreaker per duel game)
-- ============================================================
create table if not exists public.duel_questions (
  id             uuid    primary key default gen_random_uuid(),
  duel_game_id   uuid    not null references public.duel_games(id) on delete cascade,
  question_order integer not null,
  is_tiebreaker  boolean not null default false,
  question_text  text    not null,
  option_a       text    not null,
  option_b       text    not null,
  correct_answer text    check (correct_answer in ('a','b')),
  correct_margin text,
  created_at     timestamptz not null default now(),
  unique (duel_game_id, question_order)
);

alter table public.duel_questions enable row level security;

create policy "Anyone can read duel questions"
  on public.duel_questions for select using (true);

-- 3. DUELS (individual matchups)
-- ============================================================
create table if not exists public.duels (
  id                   uuid    primary key default gen_random_uuid(),
  duel_game_id         uuid    not null references public.duel_games(id) on delete cascade,
  challenger_id        uuid    not null references auth.users(id) on delete cascade,
  opponent_id          uuid    references auth.users(id) on delete set null,
  status               text    not null default 'waiting' check (status in ('waiting','active','complete','cancelled')),
  challenger_score     integer,
  opponent_score       integer,
  winner_id            uuid    references auth.users(id),
  is_draw              boolean not null default false,
  challenger_perfect   boolean not null default false,
  opponent_perfect     boolean not null default false,
  challenger_forfeited boolean not null default false,
  opponent_forfeited   boolean not null default false,
  aura_awarded_challenger  integer not null default 0,
  coins_awarded_challenger integer not null default 0,
  aura_awarded_opponent    integer not null default 0,
  coins_awarded_opponent   integer not null default 0,
  created_at           timestamptz not null default now(),
  completed_at         timestamptz
);

alter table public.duels enable row level security;

create policy "Users can read own duels"
  on public.duels for select
  using (auth.uid() = challenger_id or auth.uid() = opponent_id);

create policy "Users can insert duels as challenger"
  on public.duels for insert
  with check (auth.uid() = challenger_id);

-- 4. DUEL PICKS (each user's answers per duel)
-- ============================================================
create table if not exists public.duel_picks (
  id           uuid    primary key default gen_random_uuid(),
  duel_id      uuid    not null references public.duels(id) on delete cascade,
  user_id      uuid    not null references auth.users(id) on delete cascade,
  question_id  uuid    not null references public.duel_questions(id) on delete cascade,
  pick         text    not null check (pick in ('a','b')),
  pick_margin  text,
  is_correct   boolean,
  created_at   timestamptz not null default now(),
  unique (duel_id, user_id, question_id)
);

alter table public.duel_picks enable row level security;

-- Participants can see all picks for their duels (needed for result screen)
create policy "Duel participants can read picks"
  on public.duel_picks for select
  using (
    exists (
      select 1 from public.duels d
      where d.id = duel_id
        and (d.challenger_id = auth.uid() or d.opponent_id = auth.uid())
    )
  );

create policy "Users can insert own picks"
  on public.duel_picks for insert
  with check (auth.uid() = user_id);

-- 5. DUEL STATS VIEW (for leaderboards and profiles)
-- ============================================================
create or replace view public.duel_stats as
select
  u.id                                                       as user_id,
  p.username,
  p.display_name,
  p.avatar_url,
  count(*) filter (where d.status = 'complete')              as total_duels,
  count(*) filter (where d.winner_id = u.id)                 as wins,
  count(*) filter (
    where d.status = 'complete'
      and d.winner_id is null
      and not d.is_draw = false
      and d.is_draw = true
  )                                                          as draws,
  count(*) filter (
    where d.status = 'complete'
      and d.winner_id is not null
      and d.winner_id != u.id
  )                                                          as losses,
  case
    when count(*) filter (where d.status = 'complete' and d.winner_id is not null) > 0
    then round(
      count(*) filter (where d.winner_id = u.id)::numeric /
      count(*) filter (where d.status = 'complete' and d.winner_id is not null)::numeric * 100
    )
    else 0
  end                                                        as win_rate
from auth.users u
join public.profiles p on p.id = u.id
left join public.duels d
  on d.status = 'complete'
  and (d.challenger_id = u.id or d.opponent_id = u.id)
group by u.id, p.username, p.display_name, p.avatar_url;

-- 6. HELPER FUNCTION: get win streak for a user
-- ============================================================
create or replace function public.get_duel_win_streak(p_user_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  streak integer := 0;
  rec record;
begin
  for rec in
    select winner_id, is_draw
    from public.duels
    where status = 'complete'
      and (challenger_id = p_user_id or opponent_id = p_user_id)
    order by completed_at desc
  loop
    if rec.winner_id = p_user_id then
      streak := streak + 1;
    else
      exit;
    end if;
  end loop;
  return streak;
end;
$$;

-- 7. SEASON LEADERBOARD FUNCTION
-- ============================================================
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
  win_rate     numeric
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
    end                                                                   as win_rate
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
