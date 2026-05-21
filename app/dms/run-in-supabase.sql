-- ── Run this entire file in Supabase SQL Editor ──────────────────────────────

-- 1. Base tables
CREATE TABLE IF NOT EXISTS group_chats (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  team_name   text        NOT NULL,
  is_public   boolean     NOT NULL DEFAULT false,
  created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  description text,
  image_url   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_chat_members (
  group_chat_id uuid        NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  last_read_at  timestamptz,
  PRIMARY KEY (group_chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_chat_messages (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  group_chat_id uuid        NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
  sender_id     uuid        NOT NULL REFERENCES auth.users(id)  ON DELETE CASCADE,
  content       text        NOT NULL CHECK (char_length(content) <= 2000),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_chat_invites (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  group_chat_id  uuid        NOT NULL REFERENCES group_chats(id)  ON DELETE CASCADE,
  inviter_id     uuid        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  invitee_id     uuid        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  status         text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_chat_id, invitee_id)
);

-- 2. Add any missing columns to group_chats (safe on repeat runs)
ALTER TABLE group_chats ADD COLUMN IF NOT EXISTS is_public   boolean     NOT NULL DEFAULT false;
ALTER TABLE group_chats ADD COLUMN IF NOT EXISTS created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE group_chats ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE group_chats ADD COLUMN IF NOT EXISTS image_url   text;

-- 3. Seed AFL team groups (insert only if team_name doesn't already exist)
INSERT INTO group_chats (team_name, is_public, created_by)
SELECT v.team_name, true, null
FROM (VALUES
  ('Adelaide Crows'),('Brisbane Lions'),('Carlton'),('Collingwood'),
  ('Essendon'),('Fremantle'),('Geelong Cats'),('Gold Coast Suns'),
  ('GWS Giants'),('Hawthorn'),('Melbourne'),('North Melbourne'),
  ('Port Adelaide'),('Richmond'),('St Kilda'),('Sydney Swans'),
  ('West Coast Eagles'),('Western Bulldogs')
) AS v(team_name)
WHERE NOT EXISTS (
  SELECT 1 FROM group_chats g WHERE g.team_name = v.team_name
);

-- 4. Mark all AFL team rows as public
UPDATE group_chats SET is_public = true
WHERE team_name IN (
  'Adelaide Crows','Brisbane Lions','Carlton','Collingwood',
  'Essendon','Fremantle','Geelong Cats','Gold Coast Suns',
  'GWS Giants','Hawthorn','Melbourne','North Melbourne',
  'Port Adelaide','Richmond','St Kilda','Sydney Swans',
  'West Coast Eagles','Western Bulldogs'
) AND created_by IS NULL;

-- 5. RLS
ALTER TABLE group_chats         ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_chat_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_chat_invites  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "group_chats_select"         ON group_chats;
DROP POLICY IF EXISTS "group_chats_insert"         ON group_chats;
DROP POLICY IF EXISTS "group_chats_update"         ON group_chats;
DROP POLICY IF EXISTS "group_chats_delete"         ON group_chats;
DROP POLICY IF EXISTS "group_chat_members_select"  ON group_chat_members;
DROP POLICY IF EXISTS "group_chat_members_insert"  ON group_chat_members;
DROP POLICY IF EXISTS "group_chat_members_update"  ON group_chat_members;
DROP POLICY IF EXISTS "group_chat_members_delete"  ON group_chat_members;
DROP POLICY IF EXISTS "group_chat_messages_select" ON group_chat_messages;
DROP POLICY IF EXISTS "group_chat_messages_insert" ON group_chat_messages;
DROP POLICY IF EXISTS "group_chat_messages_delete" ON group_chat_messages;
DROP POLICY IF EXISTS "group_chat_invites_select"  ON group_chat_invites;
DROP POLICY IF EXISTS "group_chat_invites_insert"  ON group_chat_invites;
DROP POLICY IF EXISTS "group_chat_invites_update"  ON group_chat_invites;
DROP POLICY IF EXISTS "group_chat_invites_delete"  ON group_chat_invites;

CREATE POLICY "group_chats_select" ON group_chats FOR SELECT USING (
  is_public = true OR auth.uid() = created_by OR
  EXISTS (SELECT 1 FROM group_chat_members WHERE group_chat_id = group_chats.id AND user_id = auth.uid())
);
CREATE POLICY "group_chats_insert" ON group_chats FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "group_chats_update" ON group_chats FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "group_chats_delete" ON group_chats FOR DELETE USING (auth.uid() = created_by);

CREATE POLICY "group_chat_members_select" ON group_chat_members FOR SELECT USING (true);
CREATE POLICY "group_chat_members_insert" ON group_chat_members FOR INSERT WITH CHECK (true);
CREATE POLICY "group_chat_members_update" ON group_chat_members FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "group_chat_members_delete" ON group_chat_members FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "group_chat_messages_select" ON group_chat_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM group_chat_members WHERE group_chat_id = group_chat_messages.group_chat_id AND user_id = auth.uid())
);
CREATE POLICY "group_chat_messages_insert" ON group_chat_messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND
  EXISTS (SELECT 1 FROM group_chat_members WHERE group_chat_id = group_chat_messages.group_chat_id AND user_id = auth.uid())
);
CREATE POLICY "group_chat_messages_delete" ON group_chat_messages FOR DELETE USING (auth.uid() = sender_id);

CREATE POLICY "group_chat_invites_select" ON group_chat_invites FOR SELECT USING (auth.uid() = invitee_id OR auth.uid() = inviter_id);
CREATE POLICY "group_chat_invites_insert" ON group_chat_invites FOR INSERT WITH CHECK (
  auth.uid() = inviter_id AND
  EXISTS (SELECT 1 FROM group_chat_members WHERE group_chat_id = group_chat_invites.group_chat_id AND user_id = auth.uid())
);
CREATE POLICY "group_chat_invites_update" ON group_chat_invites FOR UPDATE USING (auth.uid() = invitee_id);
CREATE POLICY "group_chat_invites_delete" ON group_chat_invites FOR DELETE USING (auth.uid() = inviter_id OR auth.uid() = invitee_id);

-- 6. Grant table access to Supabase roles
GRANT ALL ON group_chats         TO postgres, service_role, authenticated, anon;
GRANT ALL ON group_chat_members  TO postgres, service_role, authenticated, anon;
GRANT ALL ON group_chat_messages TO postgres, service_role, authenticated, anon;
GRANT ALL ON group_chat_invites  TO postgres, service_role, authenticated, anon;

-- 7. Verify
SELECT COUNT(*) AS team_groups_created FROM group_chats WHERE created_by IS NULL;
