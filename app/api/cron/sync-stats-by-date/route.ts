import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/sync-stats-by-date
 *
 * Runs every 30 minutes via Vercel Cron.
 * Fetches player + team stats from API Sports using the date endpoint
 * (no game ID mapping required — catches every completed game automatically).
 *
 * Stores results in match_cache keyed by API Sports game ID so the player page
 * can read them without a redeploy of game-stats.json.
 *
 * Window: the last LOOKBACK_DAYS days, not just today. API-Sports populates
 * per-game player stats a few days after a game finishes, so a today/yesterday
 * window permanently misses late-arriving data — the round drops out of
 * match_cache and season totals freeze until game-stats.json is re-pulled by
 * hand. Re-scanning a week of dates each run is cheap (one API call per date)
 * and self-heals any gap.
 *
 * Protected by CRON_SECRET env var.
 */

// How many days back to re-scan each run. Comfortably covers API-Sports'
// stat-population lag while staying a handful of API calls per run.
const LOOKBACK_DAYS = 6;

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
  if (!secret) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Re-scan the last LOOKBACK_DAYS days so late-populated stats are caught even
  // if they only appear in the API days after the game finished.
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const dates: string[] = [];
  for (let i = LOOKBACK_DAYS; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const supabase = adminSupabase();
  const results: any[] = [];

  const origin = new URL(req.url).origin;
  const syncHeaders = { "x-sync-secret": secret };

  for (const date of dates) {
    // Warm the team-stats cache for this date (cache-only users read from this)
    fetch(`${origin}/api/afl/team-stats?date=${date}`, {
      headers: syncHeaders, cache: "no-store",
    }).catch(() => {});

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
        // Past dates are always final.
        // For today's games: sync-round-stats may have already marked the row
        // is_final=true (once complete=100 in Squiggle). Preserve that — never
        // downgrade is_final from true to false, otherwise completed games get
        // excluded from /api/game-stats and streak calculations break.
        let isFinalGame = date < todayStr;
        if (!isFinalGame) {
          const { data: existing } = await supabase
            .from("match_cache")
            .select("is_final")
            .eq("game_id", gameId)
            .eq("data_type", "player_stats")
            .maybeSingle();
          if (existing?.is_final === true) isFinalGame = true;
        }

        await supabase
          .from("match_cache")
          .upsert(
            {
              game_id: gameId,
              data_type: "player_stats",
              payload,
              fetched_at: new Date().toISOString(),
              is_final: isFinalGame,
            },
            { onConflict: "game_id,data_type" }
          );
        results.push({ date, game_id: gameId, status: "saved", is_final: isFinalGame });
      } catch (err: any) {
        results.push({ date, game_id: gameId, error: err.message });
      }
    }
  }

  return NextResponse.json({ ok: true, results });
}
