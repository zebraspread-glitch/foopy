create extension if not exists pgcrypto;

create table if not exists public.feed_event_reactions (
  id uuid primary key default gen_random_uuid(),
  game_id bigint not null,
  event_key text not null,
  visitor_id text not null,
  emoji text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feed_event_reactions_unique unique (game_id, event_key, visitor_id, emoji)
);

alter table public.feed_event_reactions
  drop constraint if exists feed_event_reactions_emoji_check;

alter table public.feed_event_reactions
  drop constraint if exists feed_event_reactions_unique;

alter table public.feed_event_reactions
  add constraint feed_event_reactions_unique unique (game_id, event_key, visitor_id, emoji);

create index if not exists feed_event_reactions_game_event_idx
  on public.feed_event_reactions (game_id, event_key);

alter table public.feed_event_reactions enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'feed_event_reactions'
      and policyname = 'Anyone can read event reactions'
  ) then
    create policy "Anyone can read event reactions"
      on public.feed_event_reactions
      for select
      using (true);
  end if;
end $$;

alter table public.feed_event_reactions replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'feed_event_reactions'
    ) then
      alter publication supabase_realtime add table public.feed_event_reactions;
  end if;
end $$;
