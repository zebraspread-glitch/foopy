import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * GET /api/game-stats
 *
 * Returns the merged game stats object:
 *   - All games from the static game-stats.json (historical)
 *   - Plus any newer games from match_cache in Supabase
 *
 * This means client components (home page, round-stats) never need a redeploy
 * to pick up stats from new games — they just fetch this endpoint.
 */
export async function GET() {
  // 1. Load static historical JSON
  const dataDir = path.join(process.cwd(), "app", "data");
  const staticStats: Record<string, any> = JSON.parse(
    fs.readFileSync(path.join(dataDir, "game-stats.json"), "utf8")
  );

  // 2. Pull any newer games from match_cache
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const staticIds = new Set(Object.keys(staticStats));

    // Grab all player_stats rows not already in static JSON.
    // Include both is_final=true (permanently locked) and is_final=false rows
    // that are recent (today/yesterday) so completed games on the day are
    // included in streak calculations even if sync-round-stats hasn't
    // permanently locked them yet.
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    const [{ data: finalRows }, { data: recentRows }] = await Promise.all([
      supabase.from("match_cache").select("game_id, payload").eq("data_type", "player_stats").eq("is_final", true),
      supabase.from("match_cache").select("game_id, payload").eq("data_type", "player_stats").eq("is_final", false)
        .gte("fetched_at", yesterdayStr),
    ]);

    const rows = [
      ...(finalRows ?? []),
      // Include recent non-final rows only if we don't already have a final row for that game
      ...(recentRows ?? []).filter(r => !(finalRows ?? []).some(f => String(f.game_id) === String(r.game_id))),
    ];

    for (const row of rows ?? []) {
      const gameId = String(row.game_id);
      if (staticIds.has(gameId)) continue; // already in static JSON

      const payload = row.payload as any;
      const responseItems: any[] = payload?.response ?? [];
      // ID-based endpoint: [ { game, teams: [{team, players}] } ]
      // Date-based endpoint: same structure via sync-stats-by-date
      const teams =
        responseItems.length > 0 && Array.isArray(responseItems[0]?.teams)
          ? responseItems[0].teams
          : responseItems;

      if (!teams.length) continue;

      // Find the date — stored in the game object or inferred from fetched_at
      const date = responseItems[0]?.game?.date?.slice(0, 10) ?? "";

      staticStats[gameId] = {
        gameId: Number(gameId),
        date,
        teams,
      };
    }
  } catch {
    // If Supabase fails, just return the static data
  }

  return NextResponse.json(staticStats, {
    headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" },
  });
}
