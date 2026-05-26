-- Run this in your Supabase SQL editor.
-- Replaces the accept_trade function with a version that
-- actually transfers cards and surfaces errors clearly.

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
  -- Lock the trade row to prevent double-accepts
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

  -- ── Validation: confirm sender still owns all offered cards ──
  FOR item IN
    SELECT * FROM trade_offer_items
    WHERE trade_offer_id = trade_id AND direction = 'offer'
  LOOP
    IF item.card_id IS NULL OR
       NOT EXISTS (
         SELECT 1 FROM user_cards
         WHERE id = item.card_id
           AND user_id = t.sender_id
           AND duplicate_count >= 1
       )
    THEN
      UPDATE trade_offers SET status = 'cancelled' WHERE id = trade_id;
      RETURN jsonb_build_object('ok', false, 'error', 'Sender no longer owns: ' || item.player_name);
    END IF;
  END LOOP;

  -- ── Validation: confirm receiver still owns all requested cards ──
  FOR item IN
    SELECT * FROM trade_offer_items
    WHERE trade_offer_id = trade_id AND direction = 'request'
  LOOP
    IF item.card_id IS NULL OR
       NOT EXISTS (
         SELECT 1 FROM user_cards
         WHERE id = item.card_id
           AND user_id = accepting_user
           AND duplicate_count >= 1
       )
    THEN
      UPDATE trade_offers SET status = 'cancelled' WHERE id = trade_id;
      RETURN jsonb_build_object('ok', false, 'error', 'You no longer own: ' || item.player_name);
    END IF;
  END LOOP;

  -- ── Transfer offered cards: sender → receiver ────────────────
  FOR item IN
    SELECT * FROM trade_offer_items
    WHERE trade_offer_id = trade_id AND direction = 'offer'
  LOOP
    SELECT * INTO card_data FROM user_cards WHERE id = item.card_id AND user_id = t.sender_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Card % vanished during transfer', item.player_name;
    END IF;

    -- Remove one copy from sender
    IF card_data.duplicate_count <= 1 THEN
      DELETE FROM user_cards WHERE id = item.card_id;
    ELSE
      UPDATE user_cards
      SET duplicate_count = duplicate_count - 1
      WHERE id = item.card_id;
    END IF;

    -- Give one copy to receiver (increment if they already have it)
    INSERT INTO user_cards
      (user_id, player_id, player_name, team, team_logo, rarity, rating, duplicate_count, pack_type)
    VALUES
      (accepting_user, card_data.player_id, card_data.player_name,
       card_data.team, card_data.team_logo, card_data.rarity,
       card_data.rating, 1, 'trade')
    ON CONFLICT (user_id, player_id, rarity)
    DO UPDATE SET duplicate_count = user_cards.duplicate_count + 1;
  END LOOP;

  -- ── Transfer requested cards: receiver → sender ──────────────
  FOR item IN
    SELECT * FROM trade_offer_items
    WHERE trade_offer_id = trade_id AND direction = 'request'
  LOOP
    SELECT * INTO card_data FROM user_cards WHERE id = item.card_id AND user_id = accepting_user;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Card % vanished during transfer', item.player_name;
    END IF;

    -- Remove one copy from receiver
    IF card_data.duplicate_count <= 1 THEN
      DELETE FROM user_cards WHERE id = item.card_id;
    ELSE
      UPDATE user_cards
      SET duplicate_count = duplicate_count - 1
      WHERE id = item.card_id;
    END IF;

    -- Give one copy to sender (increment if they already have it)
    INSERT INTO user_cards
      (user_id, player_id, player_name, team, team_logo, rarity, rating, duplicate_count, pack_type)
    VALUES
      (t.sender_id, card_data.player_id, card_data.player_name,
       card_data.team, card_data.team_logo, card_data.rarity,
       card_data.rating, 1, 'trade')
    ON CONFLICT (user_id, player_id, rarity)
    DO UPDATE SET duplicate_count = user_cards.duplicate_count + 1;
  END LOOP;

  -- ── Mark the trade as accepted ───────────────────────────────
  UPDATE trade_offers SET status = 'accepted' WHERE id = trade_id;

  RETURN jsonb_build_object('ok', true);

EXCEPTION
  WHEN OTHERS THEN
    -- Roll back any partial transfers and surface the real error
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
