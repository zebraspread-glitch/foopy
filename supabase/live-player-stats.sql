-- Live player stats cache, fed by the sync-round-stats 15s polling loop.
-- One row per (match_id, player_id), upserted in place (no duplicates).
-- Run this in the Supabase SQL editor BEFORE deploying the matching code.

create table if not exists live_player_stats (
  match_id      text not null,
  player_id     integer not null,
  team_id       integer,
  player_name   text,
  goals         integer default 0,
  goal_assists  integer default 0,
  behinds       integer default 0,
  kicks         integer default 0,
  handballs     integer default 0,
  disposals     integer default 0,
  marks         integer default 0,
  tackles       integer default 0,
  hitouts       integer default 0,
  clearances    integer default 0,
  inside50s     integer default 0,
  rebound50s    integer default 0,
  clangers      integer default 0,
  frees_for     integer default 0,
  frees_against integer default 0,
  fp            numeric,
  foopy         numeric,
  updated_at    timestamptz not null default now(),
  primary key (match_id, player_id)
);

create index if not exists live_player_stats_match_id_idx on live_player_stats (match_id);

alter table live_player_stats enable row level security;

drop policy if exists "Public read access" on live_player_stats;
create policy "Public read access" on live_player_stats
  for select using (true);

-- Writes only ever come from the service role (server-side cron), which
-- bypasses RLS, so no insert/update policy is needed for anon/authenticated.

alter publication supabase_realtime add table live_player_stats;

-- Single-row TTL lock so only one sync-round-stats invocation's 15s live
-- loop can run at a time, even if two cron ticks overlap. Internal-only —
-- only the service role (cron) ever touches it, so RLS is enabled with no
-- policies at all: anon/authenticated get zero access, service role still
-- works because it bypasses RLS entirely.
create table if not exists live_loop_lock (
  id smallint primary key,
  locked_until timestamptz not null default now()
);

alter table live_loop_lock enable row level security;

insert into live_loop_lock (id, locked_until)
values (1, now())
on conflict (id) do nothing;
