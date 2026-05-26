-- Run this in your Supabase SQL editor.
-- Grants service_role full access to all trade-related tables
-- so the API can read/write cards on behalf of both users.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_cards        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_offers      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trade_offer_items TO service_role;
GRANT SELECT, INSERT                 ON public.notifications     TO service_role;

-- Also ensure future tables created in public get the same grants automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;
