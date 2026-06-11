-- ============================================================
-- Foopy Tokens + Cosmetics — run in Supabase SQL Editor
-- ============================================================
-- Foopy Tokens = premium currency, bought with real money (Apple IAP later).
-- Spent ONLY on cosmetics — purely visual, never affects gameplay.
-- This migration does NOT touch Coins or Aura.
-- ============================================================

-- 1. TOKEN BALANCE + EQUIPPED LOADOUT (on profiles)
-- ============================================================
alter table public.profiles
  add column if not exists tokens integer not null default 0;

-- Active cosmetics as { slot: cosmetic_id }, e.g. { "profile_frame": "uuid", "card_back": "uuid" }
alter table public.profiles
  add column if not exists equipped_cosmetics jsonb not null default '{}'::jsonb;

-- 2. COSMETICS CATALOG
-- ============================================================
create table if not exists public.cosmetics (
  id              uuid primary key default gen_random_uuid(),
  key             text not null unique,                 -- stable code slug, e.g. "frame_gold"
  name            text not null,
  description     text,
  category        text not null check (category in ('profile','card','app','social')),
  slot            text,                                 -- equip slot (one active per slot); null = owned-only unlock (e.g. sticker pack)
  token_price     integer not null check (token_price >= 0),
  asset           text,                                 -- image url / css value / icon id the client renders
  rarity          text check (rarity in ('common','rare','epic','legendary')),
  is_active       boolean not null default true,        -- shown/purchasable in the shop
  is_limited      boolean not null default false,       -- limited-time / seasonal drop
  available_from  timestamptz,                          -- null = available as soon as active
  available_until timestamptz,                          -- null = never expires
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

alter table public.cosmetics enable row level security;

-- Catalog is public read-only; all writes happen via service role in API routes.
create policy "Cosmetics are publicly readable"
  on public.cosmetics for select
  using (true);

create index if not exists cosmetics_category_idx on public.cosmetics (category, sort_order);

-- 3. USER COSMETICS (ownership — who owns what)
-- ============================================================
create table if not exists public.user_cosmetics (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  cosmetic_id  uuid not null references public.cosmetics(id) on delete cascade,
  acquired_at  timestamptz not null default now(),
  unique (user_id, cosmetic_id)                         -- can't own the same cosmetic twice
);

alter table public.user_cosmetics enable row level security;

create policy "Users can view own cosmetics"
  on public.user_cosmetics for select
  using (auth.uid() = user_id);

create index if not exists user_cosmetics_user_idx on public.user_cosmetics (user_id);

-- 4. TOKEN TRANSACTIONS (ledger: purchases, grants, spends, refunds)
-- ============================================================
create table if not exists public.token_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  amount        integer not null,                       -- +credit (purchase/grant), -debit (spend)
  balance_after integer,                                -- balance snapshot after this tx
  reason        text not null check (reason in ('purchase','grant','spend','refund','admin')),
  reference     text,                                   -- IAP transaction id, cosmetic key, admin note…
  created_at    timestamptz not null default now()
);

alter table public.token_transactions enable row level security;

create policy "Users can view own token transactions"
  on public.token_transactions for select
  using (auth.uid() = user_id);

create index if not exists token_transactions_user_idx on public.token_transactions (user_id, created_at desc);

-- ============================================================
-- Done. Balances default to 0. Grant test tokens via
-- POST /api/admin/grant-tokens (admin only).
-- ============================================================
