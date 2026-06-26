/**
 * Server-only utility — uses fs and Supabase.
 *
 * Computes avgFoopy for every player using the same method as the player
 * profile page: per-game foopyRating values averaged across game-stats.json
 * (primary) + final match_cache rows (supplement for games not yet in the
 * static file).
 *
 * Returns Map<apiSportsId, avgFoopy>.
 */

import { createClient } from "@supabase/supabase-js";
import { foopyRating } from "@/app/lib/foopyRating";
import path from "path";
import fs from "fs";

function n(v: any): number {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

export async function computeAvgFoopyMap(
  /** Pass the already-loaded game-stats to avoid re-reading the file. */
  existingStaticStats?: Record<string, any>
): Promise<Map<number, number>> {
  const perPlayer = new Map<number, { total: number; games: number }>();
  const SEASON = new Date().getFullYear().toString();

  try {
    const stats: Record<string, any> = existingStaticStats ?? JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "app", "data", "game-stats.json"), "utf8")
    );
    const staticIds = new Set(Object.keys(stats));

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const weekAgoStr = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    const [{ data: finalRows }, { data: recentRows }] = await Promise.all([
      supabase.from("match_cache").select("game_id, payload")
        .eq("data_type", "player_stats").eq("is_final", true),
      supabase.from("match_cache").select("game_id, payload")
        .eq("data_type", "player_stats").eq("is_final", false)
        .gte("fetched_at", weekAgoStr),
    ]);
    const extraRows = (recentRows ?? []).filter(
      r => !(finalRows ?? []).some((f: any) => String(f.game_id) === String(r.game_id))
    );

    function accumulate(pe: any) {
      const pid = Number(pe.player?.id ?? 0);
      if (!pid) return;
      const s = pe.statistics ?? pe;
      const goals       = n(s.goals?.total ?? s.goals);
      const goalAssists = n(s.goals?.assists ?? s.goalAssists ?? 0);
      const behinds     = n(s.behinds);
      const kicks       = n(s.kicks);
      const handballs   = n(s.handballs);
      const marks       = n(s.marks);
      const tackles     = n(s.tackles);
      const hitouts     = n(s.hitouts);
      const disposals   = n(s.disposals) || (kicks + handballs);
      const clearances  = n(s.clearances);
      const ff = n(s.freesFor ?? s.free_kicks?.for ?? 0);
      const fa = n(s.freesAgainst ?? s.free_kicks?.against ?? 0);
      // Same "did not play" guard as the player profile page
      if (goals + kicks + handballs + marks + tackles + hitouts + clearances + behinds === 0) return;
      const gf = foopyRating({ goals, goalAssists, behinds, kicks, handballs, marks, tackles, hitouts, disposals, clearances, freesFor: ff, freesAgainst: fa });
      const cur = perPlayer.get(pid) ?? { total: 0, games: 0 };
      cur.total += gf;
      cur.games += 1;
      perPlayer.set(pid, cur);
    }

    // 1. game-stats.json — primary source (current season only)
    for (const game of Object.values(stats) as any[]) {
      if (!String(game.date ?? "").startsWith(SEASON)) continue;
      for (const td of game.teams ?? []) {
        for (const pe of td.players ?? []) accumulate(pe);
      }
    }

    // 2. match_cache rows for games not already in static JSON
    for (const row of [...(finalRows ?? []), ...extraRows]) {
      const gameId = String((row as any).game_id);
      if (!/^\d+$/.test(gameId) || staticIds.has(gameId)) continue;
      const payload = (row as any).payload as any;
      const responseItems: any[] = payload?.response ?? [];
      const rawTeams: any[] = responseItems[0]?.teams ?? [];
      for (const td of rawTeams) {
        for (const pe of td.players ?? []) accumulate(pe);
      }
    }
  } catch {}

  const result = new Map<number, number>();
  for (const [pid, { total, games }] of perPlayer.entries()) {
    if (games > 0) result.set(pid, Number((total / games).toFixed(1)));
  }
  return result;
}
