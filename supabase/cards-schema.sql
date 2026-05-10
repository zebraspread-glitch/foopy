-- ============================================================
-- Foopy Cards System — Run in Supabase SQL Editor
-- ============================================================

-- 1. USER CURRENCY (Coins)
-- ============================================================
create table if not exists public.user_currency (
  user_id      uuid    primary key references auth.users(id) on delete cascade,
  coins        integer not null default 1000,
  total_earned integer not null default 1000,
  updated_at   timestamptz not null default now()
);

alter table public.user_currency enable row level security;

create policy "Users can view own currency"
  on public.user_currency for select
  using (auth.uid() = user_id);

-- 2. USER CARDS COLLECTION
-- ============================================================
create table if not exists public.user_cards (
  id              uuid    primary key default gen_random_uuid(),
  user_id         uuid    not null references auth.users(id) on delete cascade,
  player_id       text    not null,
  player_name     text    not null,
  team            text    not null,
  team_logo       text    not null,
  rarity          text    not null check (rarity in ('bronze','silver','gold','diamond','mythic')),
  rating          integer not null,
  duplicate_count integer not null default 1,
  pack_type       text    not null,
  created_at      timestamptz not null default now(),
  constraint user_cards_unique unique (user_id, player_id, rarity)
);

alter table public.user_cards enable row level security;

create policy "Users can view own cards"
  on public.user_cards for select
  using (auth.uid() = user_id);

-- 3. PACK OPENINGS (purchase log)
-- ============================================================
create table if not exists public.pack_openings (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  pack_type      text not null check (pack_type in ('starter','general','mythical')),
  cost           integer not null,
  cards_received integer not null,
  created_at     timestamptz not null default now()
);

alter table public.pack_openings enable row level security;

create policy "Users can view own pack openings"
  on public.pack_openings for select
  using (auth.uid() = user_id);

-- 4. PACK OPENING CARDS (which cards each opening produced)
-- ============================================================
create table if not exists public.pack_opening_cards (
  id              uuid primary key default gen_random_uuid(),
  pack_opening_id uuid not null references public.pack_openings(id) on delete cascade,
  card_id         uuid not null references public.user_cards(id),
  rarity          text not null,
  player_name     text not null,
  is_new          boolean not null default true
);

alter table public.pack_opening_cards enable row level security;

create policy "Users can view own pack opening cards"
  on public.pack_opening_cards for select
  using (
    pack_opening_id in (
      select id from public.pack_openings where user_id = auth.uid()
    )
  );

-- 5. AUTO-INIT COINS FOR NEW USERS
-- ============================================================
create or replace function public.init_user_currency()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.user_currency (user_id, coins, total_earned)
  values (new.id, 1000, 1000)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Drop trigger if it already exists, then recreate
drop trigger if exists on_auth_user_created_give_coins on auth.users;

create trigger on_auth_user_created_give_coins
  after insert on auth.users
  for each row execute procedure public.init_user_currency();

-- ============================================================
-- Done! Existing users will get 1000 coins on their first
-- visit via the /api/cards/balance endpoint auto-init.
-- New users receive coins automatically via the trigger.
-- ============================================================
