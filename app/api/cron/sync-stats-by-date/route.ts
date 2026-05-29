import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/sync-stats-by-date
 *
 * Runs every 15 minutes via Vercel Cron.
 * Fetches player + team stats for TODAY from API Sports using the date endpoint
 * (no game ID mapping required — catches every completed game automatically).
 *
 * Stores results in match_cache keyed by API Sports game ID so the player page
 * can read them without a redeploy of game-stats.json.
 *
 * Protected by CRON_SECRET env var.
 */

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function fetchByDate(endpoint: string, date: string) {
  const res = await fetch(
    `https://v1.afl.api-sports.io${endpoint}?date=${date}`,
    {
      headers: { "x-apisports-key": process.env.API_SPORTS_AFL_KEY! },
      cache: "no-store",
    }
  );
  if (!res.ok) throw new Error(`API-Sports ${endpoint} failed: ${res.status}`);
  const json = await res.json();
  return json.response ?? [];
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Check today AND yesterday (handles late-finishing games / timezone edge cases)
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const dates = [
    yesterday.toISOString().slice(0, 10),
    today.toISOString().slice(0, 10),
  ];

  const supabase = adminSupabase();
  const results: any[] = [];

  for (const date of dates) {
    let playerGames: any[] = [];
    try {
      playerGames = await fetchByDate("/games/statistics/players", date);
    } catch (err: any) {
      results.push({ date, error: err.message });
      continue;
    }

    for (const game of playerGames) {
      const gameId = String(game.game?.id ?? "");
      if (!gameId) continue;

      // Store in the same shape as the ID-based endpoint:
      // { response: [ { game, teams: [ {team, players}, ... ] } ] }
      const payload = {
        response: [{ game: game.game, teams: game.teams ?? [] }],
      };

      try {
        await supabase
          .from("match_cache")
          .upsert(
            {
              game_id: gameId,
              data_type: "player_stats",
              payload,
              fetched_at: new Date().toISOString(),
              is_final: true, // stats fetched by date are always post-game
            },
            { onConflict: "game_id,data_type" }
          );
        results.push({ date, game_id: gameId, status: "saved" });
      } catch (err: any) {
        results.push({ date, game_id: gameId, error: err.message });
      }
    }
  }

  return NextResponse.json({ ok: true, results });
}
