-- ============================================================
-- Cosmetics Pack 3 — big batch of Name Colours + Profile Rings
-- Run in the Supabase SQL Editor (after foopy-tokens.sql + earlier seeds).
-- ============================================================
-- Same data-driven model as seed-cosmetics.sql / seed-frames.sql /
-- seed-more-cosmetics.sql:
--   • Name Colours  -> slot 'name_color'    (asset applied to the username)
--   • Profile Rings -> slot 'profile_frame' (asset drawn as the avatar ring)
-- `asset` is a hex colour or a CSS gradient string. Both of these slots are
-- rendered across the app (profile, aura leaderboard, DMs, feed, search), so
-- everything here actually shows up once equipped — no art assets required.
-- All keys are NEW (no collisions with existing seeds). `on conflict (key) do
-- nothing` makes this safe to re-run. is_active defaults true → live instantly.
-- sort_order values are high (100+/200+) so they sit after the starter items
-- within each rarity band.
-- ============================================================

-- ── Name Colours · solid (slot = name_color, common, 80) ─────────────────────
insert into public.cosmetics (key, name, description, category, slot, token_price, asset, rarity, sort_order) values
  ('name_ruby',        'Ruby Name',        'Deep ruby-red username colour.',         'profile', 'name_color', 80,  '#e11d48', 'common', 100),
  ('name_scarlet',     'Scarlet Name',     'Vivid scarlet username colour.',         'profile', 'name_color', 80,  '#dc2626', 'common', 101),
  ('name_tangerine',   'Tangerine Name',   'Juicy tangerine-orange colour.',         'profile', 'name_color', 80,  '#f97316', 'common', 102),
  ('name_marigold',    'Marigold Name',    'Golden marigold username colour.',       'profile', 'name_color', 80,  '#f59e0b', 'common', 103),
  ('name_honey',       'Honey Name',       'Warm honey-yellow colour.',              'profile', 'name_color', 80,  '#eab308', 'common', 104),
  ('name_chartreuse',  'Chartreuse Name',  'Punchy chartreuse-green colour.',        'profile', 'name_color', 80,  '#84cc16', 'common', 105),
  ('name_emerald',     'Emerald Name',     'Rich emerald-green colour.',             'profile', 'name_color', 80,  '#10b981', 'common', 106),
  ('name_jade',        'Jade Name',        'Deep jade-green colour.',                'profile', 'name_color', 80,  '#059669', 'common', 107),
  ('name_aqua',        'Aqua Name',        'Bright aqua-cyan colour.',               'profile', 'name_color', 80,  '#06b6d4', 'common', 108),
  ('name_sky',         'Sky Name',         'Clear sky-blue colour.',                 'profile', 'name_color', 80,  '#0ea5e9', 'common', 109),
  ('name_cobalt',      'Cobalt Name',      'Strong cobalt-blue colour.',             'profile', 'name_color', 80,  '#2563eb', 'common', 110),
  ('name_indigo',      'Indigo Name',      'Deep indigo username colour.',           'profile', 'name_color', 80,  '#4f46e5', 'common', 111),
  ('name_periwinkle',  'Periwinkle Name',  'Soft periwinkle-blue colour.',           'profile', 'name_color', 80,  '#818cf8', 'common', 112),
  ('name_orchid',      'Orchid Name',      'Light orchid-purple colour.',            'profile', 'name_color', 80,  '#c084fc', 'common', 113),
  ('name_plum',        'Plum Name',        'Rich plum-purple colour.',               'profile', 'name_color', 80,  '#9333ea', 'common', 114),
  ('name_fuchsia',     'Fuchsia Name',     'Electric fuchsia colour.',               'profile', 'name_color', 80,  '#e879f9', 'common', 115),
  ('name_blush',       'Blush Name',       'Soft blush-pink colour.',                'profile', 'name_color', 80,  '#f472b6', 'common', 116),
  ('name_slate',       'Slate Name',       'Cool slate-grey colour.',                'profile', 'name_color', 80,  '#64748b', 'common', 117),
  ('name_graphite',    'Graphite Name',    'Dark graphite-grey colour.',             'profile', 'name_color', 80,  '#475569', 'common', 118),
  ('name_ivory',       'Ivory Name',       'Clean off-white ivory colour.',          'profile', 'name_color', 80,  '#f1f5f9', 'common', 119)
on conflict (key) do nothing;

-- ── Name Colours · gradients (rare 130 / epic 250 / legendary 400) ───────────
insert into public.cosmetics (key, name, description, category, slot, token_price, asset, rarity, sort_order) values
  ('name_flamingo',  'Flamingo Name',  'Pink-to-rose flamingo gradient.',          'profile', 'name_color', 130, 'linear-gradient(90deg,#f472b6,#fb7185)', 'rare', 120),
  ('name_lagoon',    'Lagoon Name',    'Cyan-to-aqua lagoon gradient.',            'profile', 'name_color', 130, 'linear-gradient(90deg,#06b6d4,#22d3ee)', 'rare', 121),
  ('name_forest',    'Forest Name',    'Green forest gradient.',                   'profile', 'name_color', 130, 'linear-gradient(90deg,#16a34a,#65a30d)', 'rare', 122),
  ('name_twilight',  'Twilight Name',  'Indigo-to-violet twilight gradient.',      'profile', 'name_color', 130, 'linear-gradient(90deg,#6366f1,#a855f7)', 'rare', 123),
  ('name_ember',     'Ember Name',     'Amber-to-red ember gradient.',             'profile', 'name_color', 130, 'linear-gradient(90deg,#f59e0b,#ef4444)', 'rare', 124),
  ('name_neon',      'Neon Name',      'Cyan-to-lime neon gradient.',              'profile', 'name_color', 250, 'linear-gradient(90deg,#22d3ee,#a3e635)', 'epic', 125),
  ('name_galaxy',    'Galaxy Name',    'Indigo-purple-pink galaxy gradient.',      'profile', 'name_color', 250, 'linear-gradient(90deg,#4f46e5,#9333ea,#ec4899)', 'epic', 126),
  ('name_tropic',    'Tropic Name',    'Teal-to-lime tropic gradient.',            'profile', 'name_color', 250, 'linear-gradient(90deg,#14b8a6,#84cc16)', 'epic', 127),
  ('name_candy',     'Candy Name',     'Pink-to-violet candy gradient.',           'profile', 'name_color', 250, 'linear-gradient(90deg,#ec4899,#8b5cf6)', 'epic', 128),
  ('name_prism',     'Prism Name',     'Cyan-violet-pink-gold prism gradient.',    'profile', 'name_color', 400, 'linear-gradient(90deg,#22d3ee,#a855f7,#f472b6,#fbbf24)', 'legendary', 129),
  ('name_spectrum',  'Spectrum Name',  'Full-spectrum rainbow gradient.',          'profile', 'name_color', 400, 'linear-gradient(90deg,#ef4444,#f59e0b,#eab308,#22c55e,#06b6d4,#6366f1,#a855f7)', 'legendary', 130),
  ('name_holo',      'Holo Name',      'Pastel holographic shimmer gradient.',     'profile', 'name_color', 400, 'linear-gradient(90deg,#a5f3fc,#c4b5fd,#fbcfe8,#fde68a)', 'legendary', 131)
on conflict (key) do nothing;

-- ── Profile Rings (slot = profile_frame, category profile) ───────────────────
-- common 100 / rare 180 / epic 300 / legendary 500
insert into public.cosmetics (key, name, description, category, slot, token_price, asset, rarity, sort_order) values
  ('frame_ruby',       'Ruby Ring',       'Deep ruby-red avatar ring.',           'profile', 'profile_frame', 100, 'linear-gradient(135deg,#e11d48,#9f1239)', 'common', 200),
  ('frame_amber',      'Amber Ring',      'Solid amber avatar ring.',             'profile', 'profile_frame', 100, '#f59e0b',                                 'common', 201),
  ('frame_lime',       'Lime Ring',       'Solid lime-green avatar ring.',        'profile', 'profile_frame', 100, '#84cc16',                                 'common', 202),
  ('frame_emerald',    'Emerald Ring',    'Emerald-green gradient ring.',         'profile', 'profile_frame', 100, 'linear-gradient(135deg,#10b981,#059669)', 'common', 203),
  ('frame_sky',        'Sky Ring',        'Sky-blue gradient ring.',              'profile', 'profile_frame', 100, 'linear-gradient(135deg,#0ea5e9,#0284c7)', 'common', 204),
  ('frame_indigo',     'Indigo Ring',     'Indigo-to-violet gradient ring.',      'profile', 'profile_frame', 100, 'linear-gradient(135deg,#6366f1,#4338ca)', 'common', 205),
  ('frame_slate',      'Slate Ring',      'Cool slate-grey avatar ring.',         'profile', 'profile_frame', 100, '#64748b',                                 'common', 206),
  ('frame_flamingo',   'Flamingo Ring',   'Rose-to-crimson flamingo ring.',       'profile', 'profile_frame', 180, 'linear-gradient(135deg,#fb7185,#e11d48)', 'rare', 207),
  ('frame_lagoon',     'Lagoon Ring',     'Cyan-to-teal lagoon ring.',            'profile', 'profile_frame', 180, 'linear-gradient(135deg,#22d3ee,#0891b2)', 'rare', 208),
  ('frame_violet',     'Violet Ring',     'Violet-to-purple gradient ring.',      'profile', 'profile_frame', 180, 'linear-gradient(135deg,#a855f7,#7e22ce)', 'rare', 209),
  ('frame_ember',      'Ember Ring',      'Amber-to-orange ember ring.',          'profile', 'profile_frame', 180, 'linear-gradient(135deg,#f59e0b,#ea580c)', 'rare', 210),
  ('frame_forest',     'Forest Ring',     'Deep forest-green ring.',              'profile', 'profile_frame', 180, 'linear-gradient(135deg,#16a34a,#15803d)', 'rare', 211),
  ('frame_neon',       'Neon Ring',       'Cyan-to-lime neon ring.',              'profile', 'profile_frame', 300, 'linear-gradient(135deg,#22d3ee,#a3e635)', 'epic', 212),
  ('frame_candy',      'Candy Ring',      'Pink-to-violet candy ring.',           'profile', 'profile_frame', 300, 'linear-gradient(135deg,#ec4899,#8b5cf6)', 'epic', 213),
  ('frame_solar',      'Solar Ring',      'Gold-orange-red solar ring.',          'profile', 'profile_frame', 300, 'linear-gradient(135deg,#fbbf24,#f97316,#ef4444)', 'epic', 214),
  ('frame_tide',       'Tide Ring',       'Teal-to-blue tide ring.',              'profile', 'profile_frame', 300, 'linear-gradient(135deg,#2dd4bf,#3b82f6)', 'epic', 215),
  ('frame_obsidian',   'Obsidian Ring',   'Dark obsidian-to-steel ring.',         'profile', 'profile_frame', 500, 'linear-gradient(135deg,#1e293b,#64748b,#1e293b)', 'legendary', 216),
  ('frame_rosegold',   'Rose Gold Ring',  'Blush rose-gold shimmer ring.',        'profile', 'profile_frame', 500, 'linear-gradient(135deg,#f4c2c2,#b76e79,#f4c2c2)', 'legendary', 217),
  ('frame_spectrum',   'Spectrum Ring',   'Full-spectrum rainbow ring.',          'profile', 'profile_frame', 500, 'linear-gradient(135deg,#ef4444,#f59e0b,#22c55e,#06b6d4,#a855f7)', 'legendary', 218),
  ('frame_iridescent', 'Iridescent Ring', 'Pastel iridescent shimmer ring.',      'profile', 'profile_frame', 500, 'linear-gradient(135deg,#a5f3fc,#c4b5fd,#fbcfe8,#fde68a)', 'legendary', 219)
on conflict (key) do nothing;

-- ============================================================
-- Added: 32 name colours + 20 profile rings = 52 new cosmetics.
-- ============================================================
