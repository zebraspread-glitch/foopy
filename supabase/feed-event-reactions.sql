create extension if not exists pgcrypto;

create table if not exists public.feed_event_reactions (
  id uuid primary key default gen_random_uuid(),
  game_id bigint not null,
  event_key text not null,
  visitor_id text not null,
  emoji text not null check (emoji in ('🔥', '👏', '😂', '😮', '😭', '❤️')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feed_event_reactions_unique unique (game_id, event_key, visitor_id)
);

create index if not exists feed_event_reactions_game_event_idx
  on public.feed_event_reactions (game_id, event_key);

alter table public.feed_event_reactions enable row level security;
