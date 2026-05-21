-- ============================================================
-- Foopy Trading System  (replaces earlier version)
-- Run this in the Supabase SQL editor.
-- ============================================================


-- ── 1. Allow any signed-in user to VIEW another user's cards
--       (needed so you can browse someone's album before offering a trade)
-- ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "user_cards_select_public" ON user_cards;
CREATE POLICY "user_cards_select_public" ON user_cards
  FOR SELECT USING (auth.uid() IS NOT NULL);


-- ── 2. trade_offers ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trade_offers (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       text        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  message      text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_trade CHECK (sender_id != receiver_id)
);

CREATE INDEX IF NOT EXISTS trade_offers_sender   ON trade_offers(sender_id);
CREATE INDEX IF NOT EXISTS trade_offers_receiver ON trade_offers(receiver_id);
CREATE INDEX IF NOT EXISTS trade_offers_status   ON trade_offers(status);

ALTER TABLE trade_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trades_select" ON trade_offers
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "trades_insert" ON trade_offers
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "trades_update" ON trade_offers
  FOR UPDATE USING (
    (auth.uid() = sender_id   AND status = 'pending') OR
    (auth.uid() = receiver_id AND status = 'pending')
  );


-- ── 3. trade_offer_items ────────────────────────────────────
--   direction = 'offer'   → sender gives this card to receiver
--   direction = 'request' → sender wants this card from receiver
--   Card details are denormalized so history survives card transfers.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trade_offer_items (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  trade_offer_id  uuid    NOT NULL REFERENCES trade_offers(id) ON DELETE CASCADE,
  direction       text    NOT NULL CHECK (direction IN ('offer', 'request')),
  card_id         uuid    REFERENCES user_cards(id) ON DELETE SET NULL,
  player_id       text    NOT NULL,
  player_name     text    NOT NULL,
  team            text    NOT NULL,
  team_logo       text    NOT NULL DEFAULT '',
  rarity          text    NOT NULL,
  rating          integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS trade_items_offer_id ON trade_offer_items(trade_offer_id);

ALTER TABLE trade_offer_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trade_items_select" ON trade_offer_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM trade_offers t
      WHERE t.id = trade_offer_id
        AND (t.sender_id = auth.uid() OR t.receiver_id = auth.uid())
    )
  );

CREATE POLICY "trade_items_insert" ON trade_offer_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM trade_offers t
      WHERE t.id = trade_offer_id
        AND t.sender_id = auth.uid()
        AND t.status = 'pending'
    )
  );


-- ── 4. Auto-update updated_at ────────────────────────────────
CREATE OR REPLACE FUNCTION update_trade_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_trade_updated_at ON trade_offers;
CREATE TRIGGER set_trade_updated_at
  BEFORE UPDATE ON trade_offers
  FOR EACH ROW EXECUTE FUNCTION update_trade_updated_at();


-- ── 5. accept_trade() RPC ────────────────────────────────────
--   Handles duplicate_count correctly:
--   - Decrement (or delete) the traded card from the giver
--   - Upsert it for the receiver (increment if they already have that rarity)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION accept_trade(trade_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t              trade_offers%ROWTYPE;
  accepting_user uuid := auth.uid();
  item           trade_offer_items%ROWTYPE;
  card_data      user_cards%ROWTYPE;
BEGIN
  SELECT * INTO t FROM trade_offers WHERE id = trade_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Trade not found');
  END IF;
  IF t.receiver_id != accepting_user THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not your trade to accept');
  END IF;
  IF t.status != 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Trade is no longer pending');
  END IF;

  -- ── Validation pass ─────────────────────────────────────
  FOR item IN SELECT * FROM trade_offer_items WHERE trade_offer_id = trade_id AND direction = 'offer' LOOP
    IF item.card_id IS NULL OR
       NOT EXISTS (SELECT 1 FROM user_cards WHERE id = item.card_id AND user_id = t.sender_id AND duplicate_count >= 1)
    THEN
      UPDATE trade_offers SET status = 'cancelled' WHERE id = trade_id;
      RETURN jsonb_build_object('ok', false, 'error', 'Sender no longer has: ' || item.player_name || ' (' || item.rarity || ')');
    END IF;
  END LOOP;

  FOR item IN SELECT * FROM trade_offer_items WHERE trade_offer_id = trade_id AND direction = 'request' LOOP
    IF item.card_id IS NULL OR
       NOT EXISTS (SELECT 1 FROM user_cards WHERE id = item.card_id AND user_id = accepting_user AND duplicate_count >= 1)
    THEN
      UPDATE trade_offers SET status = 'cancelled' WHERE id = trade_id;
      RETURN jsonb_build_object('ok', false, 'error', 'You no longer have: ' || item.player_name || ' (' || item.rarity || ')');
    END IF;
  END LOOP;

  -- ── Transfer 'offer' cards: sender → receiver ────────────
  FOR item IN SELECT * FROM trade_offer_items WHERE trade_offer_id = trade_id AND direction = 'offer' LOOP
    SELECT * INTO card_data FROM user_cards WHERE id = item.card_id;

    -- Decrement or remove from sender
    IF card_data.duplicate_count <= 1 THEN
      DELETE FROM user_cards WHERE id = item.card_id;
    ELSE
      UPDATE user_cards SET duplicate_count = duplicate_count - 1 WHERE id = item.card_id;
    END IF;

    -- Give to receiver (upsert)
    INSERT INTO user_cards (user_id, player_id, player_name, team, team_logo, rarity, rating, duplicate_count, pack_type)
    VALUES (accepting_user, card_data.player_id, card_data.player_name, card_data.team, card_data.team_logo, card_data.rarity, card_data.rating, 1, 'trade')
    ON CONFLICT (user_id, player_id, rarity)
    DO UPDATE SET duplicate_count = user_cards.duplicate_count + 1;
  END LOOP;

  -- ── Transfer 'request' cards: receiver → sender ──────────
  FOR item IN SELECT * FROM trade_offer_items WHERE trade_offer_id = trade_id AND direction = 'request' LOOP
    SELECT * INTO card_data FROM user_cards WHERE id = item.card_id;

    -- Decrement or remove from receiver
    IF card_data.duplicate_count <= 1 THEN
      DELETE FROM user_cards WHERE id = item.card_id;
    ELSE
      UPDATE user_cards SET duplicate_count = duplicate_count - 1 WHERE id = item.card_id;
    END IF;

    -- Give to sender (upsert)
    INSERT INTO user_cards (user_id, player_id, player_name, team, team_logo, rarity, rating, duplicate_count, pack_type)
    VALUES (t.sender_id, card_data.player_id, card_data.player_name, card_data.team, card_data.team_logo, card_data.rarity, card_data.rating, 1, 'trade')
    ON CONFLICT (user_id, player_id, rarity)
    DO UPDATE SET duplicate_count = user_cards.duplicate_count + 1;
  END LOOP;

  UPDATE trade_offers SET status = 'accepted' WHERE id = trade_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;


-- ── 6. Notify receiver on new trade offer ───────────────────
CREATE OR REPLACE FUNCTION notify_trade_offer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO notifications (user_id, type, actor_id, data)
  VALUES (
    NEW.receiver_id,
    'trade_offer',
    NEW.sender_id,
    jsonb_build_object('trade_id', NEW.id)
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_trade_offer_created ON trade_offers;
CREATE TRIGGER on_trade_offer_created
  AFTER INSERT ON trade_offers
  FOR EACH ROW EXECUTE FUNCTION notify_trade_offer();
