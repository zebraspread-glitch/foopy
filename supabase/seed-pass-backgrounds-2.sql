-- ============================================================
-- Pass Backgrounds Pack 2 — run in the Supabase SQL Editor
-- ============================================================
-- slot = 'card_back' (one equipped at a time), category = 'card'.
-- `asset` is a pattern KEY matching PASS_PATTERNS in
-- app/components/PassCard.tsx. These 7 keys (vstripes, crosshatch, diamond,
-- chevron, weave, confetti, pyramids) were added to PASS_PATTERNS in the same
-- change — they MUST ship together (deploy the code, then run this SQL).
-- Each pattern re-colours automatically to match the pass's current tier.
-- New keys only; safe to re-run. is_active defaults true → live instantly.
-- ============================================================

insert into public.cosmetics (key, name, description, category, slot, token_price, asset, rarity, sort_order) values
  ('bg_vstripes',   'Pinstripe',   'Vertical pinstripes that match your pass tier.',          'card', 'card_back', 100, 'vstripes',   'common',    50),
  ('bg_crosshatch', 'Crosshatch',  'Fine diagonal crosshatch that matches your pass tier.',   'card', 'card_back', 100, 'crosshatch', 'common',    51),
  ('bg_diamond',    'Diamond',     'Diamond lattice that matches your pass tier.',            'card', 'card_back', 120, 'diamond',    'rare',      52),
  ('bg_chevron',    'Chevron',     'Bold chevron zig-zag that matches your pass tier.',       'card', 'card_back', 120, 'chevron',    'rare',      53),
  ('bg_weave',      'Weave',       'Basket-weave texture that matches your pass tier.',       'card', 'card_back', 200, 'weave',      'epic',      54),
  ('bg_confetti',   'Confetti',    'Scattered confetti dots that match your pass tier.',      'card', 'card_back', 200, 'confetti',   'epic',      55),
  ('bg_pyramids',   'Pyramids',    'Triangular pyramid pattern that matches your pass tier.', 'card', 'card_back', 350, 'pyramids',   'legendary', 56)
on conflict (key) do nothing;

-- ============================================================
-- Added: 7 new pass backgrounds.
-- ============================================================
