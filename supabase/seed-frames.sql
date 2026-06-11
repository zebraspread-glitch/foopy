-- ============================================================
-- Starter avatar-frame cosmetics — run in Supabase SQL Editor
-- ============================================================
-- Avatar frames render from data: `asset` is a CSS colour or gradient that's
-- drawn as a ring around the user's avatar. No art assets needed.
-- slot = 'profile_frame' (one equipped at a time), category = 'profile'.
-- ============================================================

insert into public.cosmetics (key, name, description, category, slot, token_price, asset, rarity, sort_order) values
  ('frame_blue',    'Azure Ring',    'Electric blue-to-violet avatar ring.', 'profile', 'profile_frame', 100, 'linear-gradient(135deg,#38bdf8,#6366f1)', 'common',    20),
  ('frame_green',   'Emerald Ring',  'Solid emerald avatar ring.',           'profile', 'profile_frame', 100, '#22c55e',                                 'common',    21),
  ('frame_pink',    'Blossom Ring',  'Pink gradient avatar ring.',           'profile', 'profile_frame', 150, 'linear-gradient(135deg,#ec4899,#f472b6)', 'rare',      22),
  ('frame_gold',    'Gold Ring',     'Shimmering gold avatar ring.',         'profile', 'profile_frame', 200, 'linear-gradient(135deg,#fbbf24,#f59e0b)', 'rare',      23),
  ('frame_fire',    'Inferno Ring',  'Orange-to-red fire avatar ring.',      'profile', 'profile_frame', 300, 'linear-gradient(135deg,#f97316,#ef4444)', 'epic',      24),
  ('frame_rainbow', 'Rainbow Ring',  'Full rainbow avatar ring.',            'profile', 'profile_frame', 500, 'linear-gradient(135deg,#ef4444,#f59e0b,#22c55e,#3b82f6,#a855f7)', 'legendary', 25)
on conflict (key) do nothing;
