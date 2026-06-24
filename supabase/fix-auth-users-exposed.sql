-- Fix Supabase Security Advisor: "auth_users_exposed" (Critical)
-- ------------------------------------------------------------------
-- The public.duel_stats view referenced auth.users, which makes the
-- internal auth table (emails, etc.) reachable through the API and is
-- flagged as a PII-exposure risk.
--
-- duel_stats only ever used auth.users.id, which is identical to
-- profiles.id (profiles.id references auth.users(id)). So we rebuild
-- the view sourced from public.profiles and drop the auth.users join.
-- Output columns are unchanged — no application code needs to change.
--
-- Run this in the Supabase SQL editor on the LIVE project
-- (qbmtaooovvxpqsbslrga), then click "Resolve issue" / re-run the
-- advisor to confirm it clears.

create or replace view public.duel_stats as
select
  p.id                                                       as user_id,
  p.username,
  p.display_name,
  p.avatar_url,
  count(*) filter (where d.status = 'complete')              as total_duels,
  count(*) filter (where d.winner_id = p.id)                 as wins,
  count(*) filter (
    where d.status = 'complete'
      and d.winner_id is null
      and d.is_draw = true
  )                                                          as draws,
  count(*) filter (
    where d.status = 'complete'
      and d.winner_id is not null
      and d.winner_id != p.id
  )                                                          as losses,
  case
    when count(*) filter (where d.status = 'complete' and d.winner_id is not null) > 0
    then round(
      count(*) filter (where d.winner_id = p.id)::numeric /
      count(*) filter (where d.status = 'complete' and d.winner_id is not null)::numeric * 100
    )
    else 0
  end                                                        as win_rate
from public.profiles p
left join public.duels d
  on d.status = 'complete'
  and (d.challenger_id = p.id or d.opponent_id = p.id)
group by p.id, p.username, p.display_name, p.avatar_url;

-- Belt-and-braces: run the view with the querying user's privileges
-- (Postgres 15+), so it can never read more than the caller is allowed to.
alter view public.duel_stats set (security_invoker = on);
