-- Migration: expand user_cards rarity check constraint to include all 10 rarities
-- Run this once in the Supabase SQL Editor

ALTER TABLE public.user_cards
  DROP CONSTRAINT IF EXISTS user_cards_rarity_check;

ALTER TABLE public.user_cards
  ADD CONSTRAINT user_cards_rarity_check
  CHECK (rarity IN ('bronze','silver','gold','emerald','sapphire','ruby','amethyst','diamond','pinkdiamond','mythic'));
