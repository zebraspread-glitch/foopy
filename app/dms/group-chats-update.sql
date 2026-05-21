-- ── Group Chats Update ────────────────────────────────────────────────────────
-- Adds custom group chats, public discovery, invites, and leave support.
-- Run this AFTER group-chats.sql in the Supabase SQL editor.

-- 1. Drop the UNIQUE constraint so users can create chats with any name
ALTER TABLE group_chats DROP CONSTRAINT IF EXISTS group_chats_team_name_key;

-- 2. Add new columns to group_chats
ALTER TABLE group_chats
  ADD COLUMN IF NOT EXISTS is_public   boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description text;

-- 3. Mark all AFL team chats as public (created_by stays NULL = system-owned)
UPDATE group_chats SET is_public = true WHERE team_name IN (
  'Adelaide Crows', 'Brisbane Lions', 'Carlton', 'Collingwood',
  'Essendon', 'Fremantle', 'Geelong Cats', 'Gold Coast Suns',
  'GWS Giants', 'Hawthorn', 'Melbourne', 'North Melbourne',
  'Port Adelaide', 'Richmond', 'St Kilda', 'Sydney Swans',
  'West Coast Eagles', 'Western Bulldogs'
);

-- 4. Replace SELECT policy: private chats only visible to members/creator
DROP POLICY IF EXISTS "group_chats_select" ON group_chats;
CREATE POLICY "group_chats_select"
  ON group_chats FOR SELECT USING (
    is_public = true OR
    auth.uid() = created_by OR
    EXISTS (
      SELECT 1 FROM group_chat_members
      WHERE group_chat_id = group_chats.id AND user_id = auth.uid()
    )
  );

-- 5. Allow authenticated users to create their own group chats
CREATE POLICY "group_chats_insert"
  ON group_chats FOR INSERT WITH CHECK (auth.uid() = created_by);

-- 6. Creator can rename / update their chat
CREATE POLICY "group_chats_update"
  ON group_chats FOR UPDATE USING (auth.uid() = created_by);

-- 7. Creator can delete their chat
CREATE POLICY "group_chats_delete"
  ON group_chats FOR DELETE USING (auth.uid() = created_by);

-- 8. Members can leave a chat (delete their own membership row)
CREATE POLICY "group_chat_members_delete"
  ON group_chat_members FOR DELETE USING (auth.uid() = user_id);

-- ── Invites ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS group_chat_invites (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  group_chat_id  uuid        NOT NULL REFERENCES group_chats(id)   ON DELETE CASCADE,
  inviter_id     uuid        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  invitee_id     uuid        NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  status         text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_chat_id, invitee_id)
);

ALTER TABLE group_chat_invites ENABLE ROW LEVEL SECURITY;

-- Inviter and invitee can both see the invite
CREATE POLICY "group_chat_invites_select"
  ON group_chat_invites FOR SELECT USING (
    auth.uid() = invitee_id OR auth.uid() = inviter_id
  );

-- Any group member can invite others
CREATE POLICY "group_chat_invites_insert"
  ON group_chat_invites FOR INSERT WITH CHECK (
    auth.uid() = inviter_id AND
    EXISTS (
      SELECT 1 FROM group_chat_members
      WHERE group_chat_id = group_chat_invites.group_chat_id AND user_id = auth.uid()
    )
  );

-- Only invitee can accept/decline
CREATE POLICY "group_chat_invites_update"
  ON group_chat_invites FOR UPDATE USING (auth.uid() = invitee_id);

-- Inviter or invitee can cancel/remove the invite
CREATE POLICY "group_chat_invites_delete"
  ON group_chat_invites FOR DELETE USING (
    auth.uid() = inviter_id OR auth.uid() = invitee_id
  );
