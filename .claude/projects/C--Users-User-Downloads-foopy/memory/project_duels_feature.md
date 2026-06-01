---
name: project-duels-feature
description: Duels feature — match-day 1v1 prediction contests — fully built and type-checked
metadata:
  type: project
---

Duels feature was built and is complete (pending DB migration run in Supabase).

**Why:** User wanted a weekly 1v1 prediction battle tied to specific games.

**How to apply:** When touching duel-related code, refer to the files below.

## Key files

- `supabase/duels-schema.sql` — Run this in Supabase SQL Editor to create all tables
- `app/api/duels/admin/games/route.ts` — Admin: CRUD duel games
- `app/api/duels/admin/questions/route.ts` — Admin: upsert 11 questions per game
- `app/api/duels/enter/route.ts` — User: enter matchmaking pool
- `app/api/duels/picks/route.ts` — User: submit picks before game starts
- `app/api/duels/game/route.ts` — Get duel game + user's duel for a match page
- `app/api/duels/open/route.ts` — Public: open duel games (homepage card)
- `app/api/duels/history/route.ts` — User's duel history + stats
- `app/api/duels/leaderboard/route.ts` — Season/round leaderboard
- `app/api/duels/profile/route.ts` — Public profile duel stats (W/L/streak)
- `app/api/cron/resolve-duels/route.ts` — POST with x-cron-secret header after games complete
- `app/admin/duels/page.tsx` — Admin panel to create duel games + write questions
- `app/match/[id]/components/DuelsTab.tsx` — Full duel UI (enter → picks → waiting → result)
- `app/duels/page.tsx` — User's duel history page
- `app/duels/leaderboard/page.tsx` — Season/round leaderboard page

## Setup required (after deployment)

1. Run `supabase/duels-schema.sql` in Supabase SQL Editor
2. Add `ADMIN_SECRET` and `CRON_SECRET` env vars (default to "foopy123" / "foopy-cron")
3. Call `POST /api/cron/resolve-duels` (with `x-cron-secret` header) after each game completes

## Feature spec

- Admin enables duels on specific games via /admin/duels
- 10 questions + 1 tiebreaker (always "which team wins + by what margin?")
- Users enter on match day, submit picks first, then wait to be matched
- Auto-cancel if unmatched when game starts
- Win: +100 aura +50 coins; Perfect (10/10): +200 aura +100 coins
- Draw (after tiebreaker): no rewards
- Badges: First Blood (first win), Perfect Duellist (10/10)
- Duel stats shown on public profiles (W/L, win rate, streak)
- Homepage shows Duel Available / Active Duel / Result card
