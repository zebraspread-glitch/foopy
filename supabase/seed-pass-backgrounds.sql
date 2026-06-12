-- ============================================================
-- Pass background patterns — run in Supabase SQL Editor (after foopy-tokens.sql)
-- ============================================================
-- slot = 'card_back' (one equipped at a time), category = 'card'.
-- `asset` is a pattern KEY (e.g. "stripes", "dots") matching PASS_PATTERNS in
-- app/components/PassCard.tsx. When equipped, the pattern automatically
-- re-colours to match the pass's current level (Bronze, Silver, Gold, etc.).
-- ============================================================

insert into public.cosmetics (key, name, description, category, slot, token_price, asset, rarity, sort_order) values
  ('bg_stripes', 'Stripes', 'Diagonal pinstripes that match your pass tier.', 'card', 'card_back', 100, 'stripes', 'common',    30),
  ('bg_carbon',  'Carbon',  'Sleek carbon-fibre weave overlay.',              'card', 'card_back', 100, 'carbon',  'common',    31),
  ('bg_dots',    'Dots',    'Radial dot pattern that matches your pass tier.', 'card', 'card_back', 120, 'dots',    'rare',      32),
  ('bg_grid',    'Grid',    'Holographic foil grid overlay.',                 'card', 'card_back', 200, 'grid',    'epic',      33),
  ('bg_waves',   'Waves',   'Soft glowing wave highlights.',                  'card', 'card_back', 200, 'waves',   'epic',      34),
  ('bg_camo',    'Camo',    'Camouflage pattern that matches your pass tier.', 'card', 'card_back', 350, 'camo',    'legendary', 35)
on conflict (key) do nothing;
