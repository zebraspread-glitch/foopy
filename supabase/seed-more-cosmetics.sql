-- ============================================================
-- More Name Colours + Profile Rings — run in the Supabase SQL Editor
-- ============================================================
-- Same data-driven model as seed-cosmetics.sql / seed-frames.sql:
--   • Name Colours  -> slot 'name_color'    (asset applied to the username)
--   • Profile Rings -> slot 'profile_frame' (asset drawn as the avatar ring)
-- `asset` is a hex colour or CSS gradient. New keys only; safe to re-run.
-- is_active defaults true, so these show in the store immediately.
-- ============================================================

-- ── Name Colours (slot = name_color) ──────────────────────────────────────────
insert into public.cosmetics (key, name, description, category, slot, token_price, asset, rarity, sort_order) values
  ('name_coral',    'Coral Name',     'Warm coral-pink username colour.',       'profile', 'name_color', 80,  '#fb7185', 'common',    30),
  ('name_teal',     'Teal Name',      'Cool teal username colour.',             'profile', 'name_color', 80,  '#14b8a6', 'common',    31),
  ('name_amber',    'Amber Name',     'Warm amber username colour.',            'profile', 'name_color', 80,  '#f59e0b', 'common',    32),
  ('name_magenta',  'Magenta Name',   'Vivid magenta username colour.',         'profile', 'name_color', 80,  '#d946ef', 'common',    33),
  ('name_steel',    'Steel Name',     'Cool steel-grey username colour.',       'profile', 'name_color', 80,  '#94a3b8', 'common',    34),
  ('name_mint',     'Mint Name',      'Soft mint-green username colour.',       'profile', 'name_color', 130, '#34d399', 'rare',      35),
  ('name_rosegold', 'Rose Gold Name', 'Blush rose-gold gradient username.',     'profile', 'name_color', 130, 'linear-gradient(90deg,#b76e79,#f4c2c2)', 'rare', 36),
  ('name_ocean',    'Ocean Name',     'Cyan-to-blue ocean gradient.',           'profile', 'name_color', 250, 'linear-gradient(90deg,#06b6d4,#3b82f6)', 'epic', 37),
  ('name_grape',    'Grape Name',     'Purple-to-pink grape gradient.',         'profile', 'name_color', 250, 'linear-gradient(90deg,#7c3aed,#db2777)', 'epic', 38),
  ('name_aurora',   'Aurora Name',    'Cyan-purple-pink aurora gradient.',      'profile', 'name_color', 400, 'linear-gradient(90deg,#22d3ee,#a855f7,#ec4899)', 'legendary', 39)
on conflict (key) do nothing;

-- ── Profile Rings (slot = profile_frame) ──────────────────────────────────────
insert into public.cosmetics (key, name, description, category, slot, token_price, asset, rarity, sort_order) values
  ('frame_silver',    'Silver Ring',    'Brushed silver avatar ring.',          'profile', 'profile_frame', 100, '#cbd5e1', 'common',    40),
  ('frame_teal',      'Teal Ring',      'Solid teal avatar ring.',              'profile', 'profile_frame', 100, '#14b8a6', 'common',    41),
  ('frame_crimson',   'Crimson Ring',   'Deep crimson avatar ring.',            'profile', 'profile_frame', 100, 'linear-gradient(135deg,#ef4444,#b91c1c)', 'common', 42),
  ('frame_ocean',     'Ocean Ring',     'Cyan-to-blue ocean ring.',             'profile', 'profile_frame', 180, 'linear-gradient(135deg,#06b6d4,#3b82f6)', 'rare', 43),
  ('frame_amethyst',  'Amethyst Ring',  'Purple-to-indigo amethyst ring.',      'profile', 'profile_frame', 180, 'linear-gradient(135deg,#a855f7,#6366f1)', 'rare', 44),
  ('frame_sunset',    'Sunset Ring',    'Orange-to-pink sunset ring.',          'profile', 'profile_frame', 180, 'linear-gradient(135deg,#f97316,#ec4899)', 'rare', 45),
  ('frame_aurora',    'Aurora Ring',    'Cyan-purple-pink aurora ring.',        'profile', 'profile_frame', 300, 'linear-gradient(135deg,#22d3ee,#a855f7,#ec4899)', 'epic', 46),
  ('frame_galaxy',    'Galaxy Ring',    'Indigo-purple-pink galaxy ring.',      'profile', 'profile_frame', 300, 'linear-gradient(135deg,#4f46e5,#9333ea,#ec4899)', 'epic', 47),
  ('frame_chrome',    'Chrome Ring',    'Polished chrome avatar ring.',         'profile', 'profile_frame', 500, 'linear-gradient(135deg,#9ca3af,#f9fafb,#9ca3af)', 'legendary', 48),
  ('frame_prismatic', 'Prismatic Ring', 'Shifting prismatic avatar ring.',      'profile', 'profile_frame', 500, 'linear-gradient(135deg,#22d3ee,#a855f7,#f472b6,#fbbf24)', 'legendary', 49)
on conflict (key) do nothing;
