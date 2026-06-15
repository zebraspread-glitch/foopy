-- ============================================================
-- Lock down the economy columns on public.profiles
-- Run this once in the Supabase SQL editor.
-- ------------------------------------------------------------
-- WHY: RLS is ROW-level, not column-level. A normal "users can
-- update their own profile" policy therefore lets any signed-in
-- user run, straight from the browser console:
--
--   supabase.from('profiles')
--     .update({ coins: 999999999, aura: 999999999, tokens: 999999999 })
--     .eq('id', myId)
--
-- ...bypassing every server route. This trigger makes coins/aura/
-- tokens writable ONLY by privileged backends (the service-role key
-- used by /api/cards/open-pack, /api/cosmetics/purchase, /api/aura/
-- award, etc.) and by direct DB/migrations. For ordinary clients,
-- any attempt to change those columns is silently reverted, so the
-- rest of the update (avatar, favourite_team, …) still succeeds.
-- ============================================================

create or replace function public.lock_profile_economy_columns()
returns trigger
language plpgsql
as $$
declare
  -- Role from the request JWT (set by PostgREST). Falls back to the
  -- Postgres role for direct DB / migration connections.
  jwt_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role',
    current_user
  );
  privileged boolean :=
    jwt_role in ('service_role', 'supabase_admin', 'postgres')
    or current_user in ('service_role', 'supabase_admin', 'postgres');
begin
  -- Service role / DB owner can move balances freely (server routes).
  if privileged then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A client creating its own row can't seed a balance.
    new.coins  := 0;
    new.aura   := 0;
    new.tokens := 0;
  elsif tg_op = 'UPDATE' then
    -- Ignore any client attempt to change the protected columns; keep
    -- whatever is already stored. The rest of the UPDATE still applies.
    new.coins  := old.coins;
    new.aura   := old.aura;
    new.tokens := old.tokens;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_lock_profile_economy on public.profiles;
create trigger trg_lock_profile_economy
  before insert or update on public.profiles
  for each row
  execute function public.lock_profile_economy_columns();

-- ── Verification ─────────────────────────────────────────────
-- Run this AFTER creating the trigger. Replace <USER_UUID> with a
-- real profiles.id. It impersonates an 'authenticated' client trying
-- to cheat, then rolls back. With the trigger in place, the SELECT
-- should show the ORIGINAL coins/aura/tokens (the cheat was ignored).
--
-- begin;
--   set local role authenticated;
--   set local request.jwt.claims = '{"role":"authenticated","sub":"<USER_UUID>"}';
--   update public.profiles
--     set coins = 999999999, aura = 999999999, tokens = 999999999
--     where id = '<USER_UUID>';
--   select id, coins, aura, tokens from public.profiles where id = '<USER_UUID>';
-- rollback;

-- ── What stays working (verified against the codebase) ───────
--  • Server API routes (open-pack, cosmetics/purchase, cards/sell,
--    passes coin deductions, polls/finalize, grant-tokens, …) use the
--    SERVICE_ROLE key (app/lib/supabase-server.ts) → jwt_role =
--    'service_role' → allowed.
--  • awardAura() calls the award_aura_event RPC, which is SECURITY
--    DEFINER. Inside it, current_user becomes the function owner
--    (postgres) → allowed. So aura still credits normally.
--  • Ordinary client updates (avatar_url, banner_url, favourite_team,
--    featured_cards, favourites) don't touch these columns, so they
--    pass through untouched.

-- ── Related follow-up (NOT closed by this trigger) ───────────
--  This trigger blocks DIRECT client writes to profiles.coins/aura/
--  tokens. It does NOT police SECURITY DEFINER RPCs. If award_aura_event
--  (or any balance RPC) is callable by the `authenticated` role and
--  trusts a client-supplied amount, a user could still inflate their
--  balance by calling the RPC directly. Audit those RPCs to ensure the
--  amount is derived server-side (not from the caller) and/or revoke
--  EXECUTE from `authenticated` where the app always calls them with
--  the service role.
