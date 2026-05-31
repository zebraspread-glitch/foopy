-- ============================================================
-- Duels Schema v2 — Run in Supabase SQL Editor
-- Adds stat-category support to duel_questions so correct
-- answers are resolved automatically from game stats.
-- ============================================================

alter table public.duel_questions
  add column if not exists category_key  text,
  add column if not exists option_a_image text,
  add column if not exists option_a_team  text,
  add column if not exists option_b_image text,
  add column if not exists option_b_team  text;
