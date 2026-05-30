-- Run this in your Supabase SQL editor to add the favourite_team column.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS favourite_team TEXT DEFAULT NULL;

-- Optional index so you can efficiently query supporters of a team
CREATE INDEX IF NOT EXISTS profiles_favourite_team_idx ON profiles(favourite_team);
