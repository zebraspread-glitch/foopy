-- ============================================================
-- Lock down the award_aura_event RPC
-- Run this once in the Supabase SQL editor.
-- ------------------------------------------------------------
-- WHY: award_aura_event is SECURITY DEFINER and takes the aura amount
-- (p_amount) as a parameter. If the `authenticated` (or `anon`/`public`)
-- role can EXECUTE it, any signed-in user can run, straight from the
-- browser console:
--
--   supabase.rpc('award_aura_event', {
--     p_user_id: myId, p_event_type: 'comment_post',
--     p_related_id: 'x'+Math.random(), p_amount: 999999999
--   })
--
-- ...minting unlimited aura (which also pays out coins via aura
-- milestones). The server already derives the amount in awardAura() and
-- calls this RPC with the SERVICE-ROLE key, so only service_role needs
-- EXECUTE. This revokes it from everyone else.
--
-- Pairs with app/lib/aura.ts (awardAura now always uses the service role)
-- and supabase/lock-economy-columns.sql (blocks direct profiles writes).
-- ============================================================

do $$
declare
  r record;
begin
  for r in
    select 'public.award_aura_event(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'award_aura_event'
  loop
    execute format('revoke all on function %s from public', r.sig);
    execute format('revoke all on function %s from anon', r.sig);
    execute format('revoke all on function %s from authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- ── Verification ─────────────────────────────────────────────
-- As a signed-in client this should now raise "permission denied":
--   begin;
--     set local role authenticated;
--     select public.award_aura_event(
--       '<USER_UUID>'::uuid, 'comment_post', 'cheat-test', 999999999);
--   rollback;
--
-- Confirm the only grantee is service_role:
--   select p.proname, r.rolname, has_function_privilege(r.oid, p.oid, 'execute') AS can_exec
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   cross join (select oid, rolname from pg_roles
--               where rolname in ('anon','authenticated','service_role')) r
--   where n.nspname = 'public' and p.proname = 'award_aura_event';
