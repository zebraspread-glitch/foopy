-- Preserve public feed comments when a user deletes their account.
--
-- WHY
-- Account deletion (DELETE /api/account) removes the user's profile and auth
-- row. If feed_comments.user_id is declared ON DELETE CASCADE, every comment
-- the user ever posted vanishes too — blowing holes in public threads that
-- OTHER users replied to and liked. The comments are shared/public content, so
-- the better behaviour is to keep them, anonymised, rather than delete them.
--
-- WHAT THIS DOES
-- Rebuilds the foreign key on feed_comments.user_id as ON DELETE SET NULL and
-- makes the column nullable. After this, deleting a user detaches their
-- comments (user_id -> NULL) instead of removing them. The app already renders
-- a comment whose profile join is null as "Deleted user"
-- (app/feed/CommentSheet.tsx), so no PII remains and the thread stays intact.
--
-- This still satisfies App Store Guideline 5.1.1(v): the account, its profile,
-- and all personal data are deleted — only the anonymised public comment text
-- is retained, which is standard and contains no account identity.
--
-- Private 1:1 DMs (dm_messages) are intentionally left ON DELETE CASCADE — a
-- departing user's private messages should be removed, not anonymised.
--
-- SAFE TO RUN: introspects the live constraint (no hard-coded name), is
-- idempotent, and only touches feed_comments. Re-running it is a no-op-ish
-- rebuild to the same definition. Run it once in the Supabase SQL editor.

do $$
declare
  fk record;
begin
  if to_regclass('public.feed_comments') is null then
    raise notice 'feed_comments table not found in public schema; nothing to do.';
    return;
  end if;

  -- Allow the column to be detached on deletion.
  execute 'alter table public.feed_comments alter column user_id drop not null';

  -- Locate the existing single-column FK on feed_comments.user_id so we can
  -- rebuild it as ON DELETE SET NULL pointing at the SAME referenced table,
  -- regardless of whether it currently targets auth.users or public.profiles.
  select con.conname,
         refns.nspname  as ref_schema,
         ref.relname    as ref_table,
         refatt.attname as ref_col,
         con.confdeltype as del_rule
    into fk
  from pg_constraint con
  join pg_class      rel    on rel.oid = con.conrelid
  join pg_namespace  relns  on relns.oid = rel.relnamespace
  join pg_class      ref    on ref.oid = con.confrelid
  join pg_namespace  refns  on refns.oid = ref.relnamespace
  join pg_attribute  att    on att.attrelid = con.conrelid  and att.attnum = con.conkey[1]
  join pg_attribute  refatt on refatt.attrelid = con.confrelid and refatt.attnum = con.confkey[1]
  where con.contype = 'f'
    and relns.nspname = 'public'
    and rel.relname = 'feed_comments'
    and att.attname = 'user_id'
    and array_length(con.conkey, 1) = 1;

  if fk.conname is null then
    raise notice 'No single-column FK on feed_comments.user_id found; column made nullable only.';
    return;
  end if;

  if fk.del_rule = 'n' then
    raise notice 'FK % is already ON DELETE SET NULL; nothing to rebuild.', fk.conname;
    return;
  end if;

  execute format('alter table public.feed_comments drop constraint %I', fk.conname);
  execute format(
    'alter table public.feed_comments add constraint %I foreign key (user_id) references %I.%I(%I) on delete set null',
    fk.conname, fk.ref_schema, fk.ref_table, fk.ref_col
  );

  raise notice 'Rebuilt % as ON DELETE SET NULL referencing %.%(%).',
    fk.conname, fk.ref_schema, fk.ref_table, fk.ref_col;
end $$;
