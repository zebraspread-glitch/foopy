-- ─────────────────────────────────────────────────────────────────────────────
-- general-chat.sql
-- Run this in the Supabase SQL editor.
-- Creates a "General" group chat and auto-joins every new (and existing) user.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Insert the General chat (idempotent)
INSERT INTO group_chats (team_name, is_public, description, created_by)
VALUES ('General', true, 'Welcome to Foopy! Chat with the whole community here.', NULL)
ON CONFLICT DO NOTHING;

-- 2. Backfill: add every existing user who isn't already a member
INSERT INTO group_chat_members (group_chat_id, user_id)
SELECT gc.id, u.id
FROM auth.users u
CROSS JOIN group_chats gc
WHERE gc.team_name = 'General'
ON CONFLICT DO NOTHING;

-- 3. Trigger function: auto-join every new user to General on signup
CREATE OR REPLACE FUNCTION public.auto_join_general_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  general_id uuid;
BEGIN
  SELECT id INTO general_id
  FROM group_chats
  WHERE team_name = 'General'
  LIMIT 1;

  IF general_id IS NOT NULL THEN
    INSERT INTO group_chat_members (group_chat_id, user_id)
    VALUES (general_id, NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Attach trigger to auth.users (fires after every new signup)
DROP TRIGGER IF EXISTS on_auth_user_created_join_general ON auth.users;
CREATE TRIGGER on_auth_user_created_join_general
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_join_general_chat();
