-- ============================================================
-- Per-card rows migration — run in Supabase SQL Editor
-- ============================================================
-- Goal: every individual card a user owns is its own row, so a freshly
-- unpacked card has its own id + created_at and sorts to the top of the
-- collection (instead of merging into an old row by player+rarity).
--
-- STEP 1 is REQUIRED and must be run before/with the new pack-open code.
-- STEPS 2–3 are OPTIONAL one-time cleanup of cards you already own.
-- ============================================================

-- 1. (REQUIRED) Drop the "one row per player+rarity" uniqueness rule so the
--    same player+rarity can exist as multiple rows.
alter table public.user_cards
  drop constraint if exists user_cards_unique;

-- 1b. (REQUIRED) The dropped constraint was ALSO the only index leading with
--     user_id. Without a replacement, every per-user lookup (album page,
--     collection grid) does a full table scan + sort — which gets very slow as
--     the table grows (per-card rows grow it fast). These indexes restore fast
--     lookups. The first matches the album query's filter + ORDER BY exactly
--     (so no sort step); the second serves the collection's "newest" sort.
create index if not exists user_cards_user_album_idx
  on public.user_cards (user_id, player_id, rarity, id);

create index if not exists user_cards_user_created_idx
  on public.user_cards (user_id, created_at desc);

-- 2. (OPTIONAL) Expand cards you already own (duplicate_count > 1) into
--    individual rows. Each new row copies the original's created_at, so old
--    duplicates stay grouped by their original date — only cards unpacked
--    AFTER this migration get fresh, independent timestamps.
insert into public.user_cards
  (user_id, player_id, player_name, team, team_logo, rarity, rating, duplicate_count, pack_type, created_at)
select
  user_id, player_id, player_name, team, team_logo, rarity, rating, 1, pack_type, created_at
from public.user_cards c
cross join generate_series(1, c.duplicate_count - 1)
where c.duplicate_count > 1;

-- 3. (OPTIONAL) Now that every card is its own row, normalise the counter to 1.
update public.user_cards
  set duplicate_count = 1
  where duplicate_count <> 1;
