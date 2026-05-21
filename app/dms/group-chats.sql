-- ── Group Chats ───────────────────────────────────────────────────────────────
-- One chat per AFL team; users are auto-joined when they get that team's pass.
-- Run this in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS group_chats (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  team_name  text        NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_chat_members (
  group_chat_id uuid        NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  last_read_at  timestamptz,
  PRIMARY KEY (group_chat_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_chat_messages (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  group_chat_id uuid        NOT NULL REFERENCES group_chats(id) ON DELETE CASCADE,
  sender_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content       text        NOT NULL CHECK (char_length(content) <= 2000),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE group_chats         ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_chat_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_chats_select"
  ON group_chats FOR SELECT USING (true);

CREATE POLICY "group_chat_members_select"
  ON group_chat_members FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "group_chat_messages_select"
  ON group_chat_messages FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM group_chat_members
      WHERE group_chat_id = group_chat_messages.group_chat_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "group_chat_messages_insert"
  ON group_chat_messages FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM group_chat_members
      WHERE group_chat_id = group_chat_messages.group_chat_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "group_chat_messages_delete"
  ON group_chat_messages FOR DELETE USING (auth.uid() = sender_id);

CREATE POLICY "group_chat_members_update"
  ON group_chat_members FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "group_chat_members_insert"
  ON group_chat_members FOR INSERT WITH CHECK (true);

-- Seed one row per AFL team
INSERT INTO group_chats (team_name) VALUES
  ('Adelaide Crows'), ('Brisbane Lions'), ('Carlton'), ('Collingwood'),
  ('Essendon'), ('Fremantle'), ('Geelong Cats'), ('Gold Coast Suns'),
  ('GWS Giants'), ('Hawthorn'), ('Melbourne'), ('North Melbourne'),
  ('Port Adelaide'), ('Richmond'), ('St Kilda'), ('Sydney Swans'),
  ('West Coast Eagles'), ('Western Bulldogs')
ON CONFLICT (team_name) DO NOTHING;
