-- ============================================================
-- Starter cosmetics — run in Supabase SQL Editor (after foopy-tokens.sql)
-- ============================================================
-- These name-colour cosmetics render purely from data (a CSS colour or
-- gradient in `asset`), so no art assets are needed to demo the full
-- buy -> equip -> render loop. Add frames / icons / banners later once you
-- have the artwork.
-- `asset` holds either a hex colour (e.g. "#ef4444") or a CSS gradient
-- (e.g. "linear-gradient(...)"). The client applies it to the username.
-- ============================================================

insert into public.cosmetics (key, name, description, category, slot, token_price, asset, rarity, sort_order) values
  ('name_crimson', 'Crimson Name', 'A bold crimson username colour.',         'profile', 'name_color', 80,  '#ef4444', 'common',    10),
  ('name_azure',   'Azure Name',   'Cool electric-blue username colour.',     'profile', 'name_color', 80,  '#38bdf8', 'common',    11),
  ('name_lime',    'Lime Name',    'Bright lime-green username colour.',       'profile', 'name_color', 80,  '#22c55e', 'common',    12),
  ('name_violet',  'Violet Name',  'Rich royal-purple username colour.',       'profile', 'name_color', 120, '#a855f7', 'rare',      13),
  ('name_gold',    'Gold Name',    'Shimmering gold username colour.',         'profile', 'name_color', 150, '#fbbf24', 'rare',      14),
  ('name_sunset',  'Sunset Name',  'Orange-to-pink sunset gradient.',          'profile', 'name_color', 250, 'linear-gradient(90deg,#f97316,#ec4899)', 'epic', 15),
  ('name_rainbow', 'Rainbow Name', 'Full rainbow gradient username.',          'profile', 'name_color', 400, 'linear-gradient(90deg,#ef4444,#f59e0b,#22c55e,#3b82f6,#a855f7)', 'legendary', 16)
on conflict (key) do nothing;
