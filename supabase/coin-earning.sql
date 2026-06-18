-- ============================================================
-- Coin-earning mechanics: milestones, winner picks, poll
-- leaderboards, and referrals.
-- Run once in the Supabase SQL editor.
-- ------------------------------------------------------------
-- Mirrors the aura system: a dedup ledger (coin_events) plus a
-- SECURITY DEFINER RPC (award_coins_event) that inserts the event
-- and increments profiles.coins atomically, returning TRUE only when
-- the event is new. This makes every coin faucet safe to retry /
-- re-run without double-paying.
-- ============================================================

-- ── 1. Coin event ledger (dedup) ────────────────────────────
create table if not exists public.coin_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  event_type  text not null,
  related_id  text not null,
  amount      integer not null,
  created_at  timestamptz not null default now(),
  unique (user_id, event_type, related_id)
);

create index if not exists idx_coin_events_user on public.coin_events (user_id);
create index if not exists idx_coin_events_type on public.coin_events (event_type);

alter table public.coin_events enable row level security;

-- Users may read their own coin history (for a future "how I earned" view).
drop policy if exists coin_events_select_own on public.coin_events;
create policy coin_events_select_own on public.coin_events
  for select using (auth.uid() = user_id);

-- ── 2. Award RPC (SECURITY DEFINER, like award_aura_event) ───
-- Inserts the event; if it's new, credits profiles.coins. Returns
-- TRUE when newly awarded, FALSE when it was a duplicate.
create or replace function public.award_coins_event(
  p_user_id    uuid,
  p_event_type text,
  p_related_id text,
  p_amount     integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted boolean;
begin
  if p_amount is null or p_amount <= 0 then
    return false;
  end if;

  insert into public.coin_events (user_id, event_type, related_id, amount)
  values (p_user_id, p_event_type, p_related_id, p_amount)
  on conflict (user_id, event_type, related_id) do nothing;

  get diagnostics inserted = row_count;

  if inserted then
    update public.profiles
      set coins = coalesce(coins, 0) + p_amount
      where id = p_user_id;
    return true;
  end if;

  return false;
end;
$$;

-- The RPC runs as its owner (postgres), so it bypasses the economy
-- lock trigger. Only the server calls it (service role), but it's
-- safe to expose since the amount is always derived server-side.
revoke all on function public.award_coins_event(uuid, text, text, integer) from public;
grant execute on function public.award_coins_event(uuid, text, text, integer) to service_role;

-- ── 3. Aura→coins milestone baseline ────────────────────────
-- Only aura earned AFTER this migration counts toward coin
-- milestones, so seed the baseline to each user's current aura.
alter table public.profiles
  add column if not exists coin_milestone_aura integer not null default 0;

update public.profiles
  set coin_milestone_aura = coalesce(aura, 0)
  where coin_milestone_aura = 0;

-- ── 4. Referral columns ─────────────────────────────────────
alter table public.profiles
  add column if not exists referred_by  uuid references public.profiles(id),
  add column if not exists referral_paid boolean not null default false;

-- referred_by is write-once: a client can set it (at signup) only
-- while it is null. Prevents users re-pointing it to farm referrals.
create or replace function public.lock_referred_by()
returns trigger
language plpgsql
as $$
declare
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role',
    current_user
  );
  privileged boolean :=
    jwt_role in ('service_role', 'supabase_admin', 'postgres')
    or current_user in ('service_role', 'supabase_admin', 'postgres');
begin
  if privileged then
    return new;
  end if;
  -- Non-privileged callers cannot change an already-set referrer, and
  -- cannot mark their own referral as paid.
  if old.referred_by is not null then
    new.referred_by := old.referred_by;
  end if;
  new.referral_paid := old.referral_paid;
  return new;
end;
$$;

drop trigger if exists trg_lock_referred_by on public.profiles;
create trigger trg_lock_referred_by
  before update on public.profiles
  for each row
  execute function public.lock_referred_by();
