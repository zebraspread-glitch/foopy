-- Device push tokens, tied to the signed-in user. One row per device/token.
-- Writes always go through the service-role API route (/api/push/register),
-- which verifies the caller's Supabase auth token before writing — never
-- trust a client-supplied user_id. RLS still restricts direct table access
-- as defense in depth, matching the pattern used for aura/coins.

create table if not exists public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  token       text not null,
  platform    text not null default 'ios',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (token)
);

create index if not exists push_tokens_user_id_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

-- Users can read/delete their own token rows directly (e.g. for client-side
-- diagnostics). All INSERT/UPDATE happens server-side via the service-role
-- key in /api/push/register, which bypasses RLS — so there is deliberately
-- no insert/update policy for the `authenticated` role here.
drop policy if exists "push_tokens_select_own" on public.push_tokens;
create policy "push_tokens_select_own" on public.push_tokens
  for select using (auth.uid() = user_id);

drop policy if exists "push_tokens_delete_own" on public.push_tokens;
create policy "push_tokens_delete_own" on public.push_tokens
  for delete using (auth.uid() = user_id);
