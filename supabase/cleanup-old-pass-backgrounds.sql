-- ============================================================
-- Cleanup: remove old pre-redesign "Pass Background" cosmetics
-- Run this once in the Supabase SQL Editor (after seed-pass-backgrounds.sql
-- and add-pass-pattern.sql)
-- ============================================================
-- The original seed used hardcoded CSS-string assets per rarity (e.g.
-- "Emerald Dots", "Navy Stripes", "Sunset Waves", "Holo Grid", "Galaxy").
-- These don't match any PASS_PATTERNS key, so they all render as a plain
-- green (Emerald-preview) box in the store and can't be equipped per-pass.
--
-- This migration:
--   1. Converts the old "Carbon Fibre" row (key bg_carbon) into the new
--      "Carbon" pattern, so the bg_carbon key isn't wasted and existing
--      owners keep their item.
--   2. Refunds token_price to anyone who owns the other obsolete items,
--      then deletes those cosmetics (cascades to user_cosmetics).
--   3. Clears any stale profiles.equipped_cosmetics.card_back references.
-- ============================================================

-- 1. Repurpose bg_carbon -> new "Carbon" pattern
update public.cosmetics
set name = 'Carbon', description = 'Sleek carbon-fibre overlay that matches your pass tier.',
    asset = 'carbon', rarity = 'common'
where key = 'bg_carbon';

-- 2. Refund + remove the remaining obsolete CSS-string items
do $$
declare
  obsolete_keys text[] := array['bg_navy_stripes', 'bg_emerald_dots', 'bg_sunset_waves', 'bg_holo_grid', 'bg_galaxy'];
  c record;
  o record;
begin
  for c in select id, key, token_price from public.cosmetics where key = any(obsolete_keys) loop
    for o in select user_id from public.user_cosmetics where cosmetic_id = c.id loop
      update public.profiles set tokens = tokens + c.token_price where id = o.user_id;
      insert into public.token_transactions (user_id, amount, reason, reference)
        values (o.user_id, c.token_price, 'refund', c.key);
      update public.profiles
        set equipped_cosmetics = equipped_cosmetics - 'card_back'
        where id = o.user_id and equipped_cosmetics->>'card_back' = c.id::text;
    end loop;
    delete from public.cosmetics where id = c.id;
  end loop;
end $$;
