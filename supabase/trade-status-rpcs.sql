-- Run this in your Supabase SQL editor.
-- Creates cancel_trade and decline_trade as SECURITY DEFINER functions
-- so they bypass table-level permission restrictions (same pattern as accept_trade).

CREATE OR REPLACE FUNCTION cancel_trade(trade_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trade trade_offers%ROWTYPE;
BEGIN
  SELECT * INTO v_trade FROM trade_offers WHERE id = trade_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Trade not found');
  END IF;

  IF v_trade.sender_id != auth.uid() THEN
    RETURN json_build_object('ok', false, 'error', 'Only the sender can cancel');
  END IF;

  IF v_trade.status != 'pending' THEN
    RETURN json_build_object('ok', false, 'error', 'Trade is no longer pending');
  END IF;

  UPDATE trade_offers
  SET status = 'cancelled', updated_at = now()
  WHERE id = trade_id;

  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION decline_trade(trade_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trade trade_offers%ROWTYPE;
BEGIN
  SELECT * INTO v_trade FROM trade_offers WHERE id = trade_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Trade not found');
  END IF;

  IF v_trade.receiver_id != auth.uid() THEN
    RETURN json_build_object('ok', false, 'error', 'Only the receiver can decline');
  END IF;

  IF v_trade.status != 'pending' THEN
    RETURN json_build_object('ok', false, 'error', 'Trade is no longer pending');
  END IF;

  UPDATE trade_offers
  SET status = 'declined', updated_at = now()
  WHERE id = trade_id;

  RETURN json_build_object('ok', true);
END;
$$;
