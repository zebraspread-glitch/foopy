-- ============================================================
-- Report & Block system
-- Run this once in the Supabase SQL editor.
-- ============================================================

-- ── 1. Blocks ────────────────────────────────────────────────
create table if not exists public.user_blocks (
  id          uuid primary key default gen_random_uuid(),
  blocker_id  uuid not null references auth.users(id) on delete cascade,
  blocked_id  uuid not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocker_idx on public.user_blocks(blocker_id);
create index if not exists user_blocks_blocked_idx on public.user_blocks(blocked_id);

alter table public.user_blocks enable row level security;

-- You can only see / create / remove YOUR OWN blocks. Nobody can read who
-- blocked them directly — the union set is exposed only via the SECURITY
-- DEFINER function below.
drop policy if exists "blocks: select own" on public.user_blocks;
create policy "blocks: select own" on public.user_blocks
  for select using (auth.uid() = blocker_id);

drop policy if exists "blocks: insert own" on public.user_blocks;
create policy "blocks: insert own" on public.user_blocks
  for insert with check (auth.uid() = blocker_id);

drop policy if exists "blocks: delete own" on public.user_blocks;
create policy "blocks: delete own" on public.user_blocks
  for delete using (auth.uid() = blocker_id);

-- ── 2. Reports ───────────────────────────────────────────────
create table if not exists public.reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid not null references auth.users(id) on delete cascade,
  reported_user_id  uuid references auth.users(id) on delete set null,
  target_type       text not null default 'user'
                      check (target_type in ('user','comment','dm_message','group_message')),
  target_id         text,            -- id of the reported content, if any
  context           text,            -- e.g. game id / conversation id, for admin lookup
  reason            text not null,
  details           text,
  status            text not null default 'open'
                      check (status in ('open','reviewed','actioned','dismissed')),
  created_at        timestamptz not null default now(),
  reviewed_at       timestamptz
);

create index if not exists reports_status_idx  on public.reports(status, created_at desc);
create index if not exists reports_reporter_idx on public.reports(reporter_id);

alter table public.reports enable row level security;

-- A user may file reports and see the ones they filed. Admins read/update via
-- the service-role API (which bypasses RLS), so no broad policies are needed.
drop policy if exists "reports: insert own" on public.reports;
create policy "reports: insert own" on public.reports
  for insert with check (auth.uid() = reporter_id);

drop policy if exists "reports: select own" on public.reports;
create policy "reports: select own" on public.reports
  for select using (auth.uid() = reporter_id);

-- ── 3. Hidden-user set (mutual invisibility) ─────────────────
-- Returns every user id the current user should not see, and who should not
-- see the current user: people I blocked UNION people who blocked me.
-- SECURITY DEFINER lets it read rows in both directions without exposing the
-- raw "who blocked me" list to clients. Each client filters feeds/comments
-- with this set, so blocking hides content cooperatively in both directions.
create or replace function public.foopy_hidden_user_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select blocked_id from public.user_blocks where blocker_id = auth.uid()
  union
  select blocker_id from public.user_blocks where blocked_id = auth.uid()
$$;

grant execute on function public.foopy_hidden_user_ids() to authenticated;

-- ── 4. Block-between check (DM gating) ───────────────────────
-- True if a block exists in EITHER direction between the caller and `other`.
create or replace function public.foopy_block_between(other uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = auth.uid() and blocked_id = other)
       or (blocker_id = other and blocked_id = auth.uid())
  )
$$;

grant execute on function public.foopy_block_between(uuid) to authenticated;
