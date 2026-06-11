-- ============================================================
-- Denormalised cosmetic render values on profiles — run in SQL Editor
-- ============================================================
-- Lets any query that already reads a profile show the user's equipped
-- name colour cheaply (no join to cosmetics). The equip API keeps this in
-- sync whenever a name-colour cosmetic is equipped/unequipped.
-- ============================================================

alter table public.profiles
  add column if not exists name_color text;   -- CSS colour or gradient of the equipped name-colour cosmetic

alter table public.profiles
  add column if not exists avatar_frame text; -- CSS colour or gradient of the equipped avatar-frame (ring) cosmetic
