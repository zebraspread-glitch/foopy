import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { foopyRating } from "@/app/lib/foopyRating";
import path from "path";
import fs from "fs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/sync-player-season-stats
 *
 * Runs every hour via Vercel Cron.
 * Fetches season player stats for all 18 AFL teams from API-Sports
 * (/players/statistics?team=X&season=YYYY) and stores the combined
 * results in match_cache so /api/player-season-stats can serve fresh
 * data without anyone needing to run a script.
 *
 * Protected by CRON_SECRET env var.
 */

const API_BASE = "https://v1.afl.api-sports.io";
const SEASON      = new Date().getFullYear().toString();

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiKey = process.env.API_SPORTS_AFL_KEY;
  if (!apiKey) return NextResponse.json({ error: "Missing API key" }, { status: 500 });

  // Source list of players to fetch (apiSportsId + canonical name/team/id) from players.json.
  // The /players/statistics endpoint only accepts an `id` param — the previous
  // `team` param is rejected by API-Sports, so we fan out per player.
  const sourcePlayers: any[] = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "app", "data", "players.json"), "utf8")
  );
  const targets = sourcePlayers.filter((p) => p.apiSportsId);

  const players: any[] = [];
  const errors: string[] = [];

  async function fetchOne(src: any) {
    const apiSportsId = Number(src.apiSportsId);
    try {
      const res = await fetch(
        `${API_BASE}/players/statistics?id=${apiSportsId}&season=${SEASON}`,
        { headers: { "x-apisports-key": apiKey }, cache: "no-store" }
      );
      if (!res.ok) {
        errors.push(`player ${apiSportsId}: HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      const entry = data?.response?.[0];
      const stat  = entry?.statistics?.[0] ?? entry?.statistics;
      if (!stat) return; // player hasn't played this season

      const games = n(stat.games?.played);
      if (games <= 0) return;

      players.push({
        id:            src.id,
        name:          src.name,
        team:          src.team,
        apiSportsId,
        photoUrl:      entry?.player?.photo ?? null,
        jerseyNumber:  n(entry?.player?.number) || null,
        position:      null,
        games,
        goals:         n(stat.goals?.total?.total),
        totalGoals:    n(stat.goals?.total?.total), // explicit alias for per-game calculation
        goalAssists:   n(stat.goals?.assists?.total),
        behinds:       n(stat.behinds?.total),
        totalDisposals:  n(stat.disposals?.total),
        totalKicks:      n(stat.kicks?.total),
        totalHandballs:  n(stat.handballs?.total),
        totalMarks:      n(stat.marks?.total),
        totalTackles:    n(stat.tackles?.total),
        totalHitouts:    n(stat.hitouts?.total),
        totalClearances: n(stat.clearances?.total),
        freesFor:        n(stat.free_kicks?.for?.total),
        freesAgainst:    n(stat.free_kicks?.against?.total),
        disposals:       n(stat.disposals?.average),
        kicks:           n(stat.kicks?.average),
        handballs:       n(stat.handballs?.average),
        marks:           n(stat.marks?.average),
        tackles:         n(stat.tackles?.average),
        hitouts:         n(stat.hitouts?.average),
        clearances:      n(stat.clearances?.average),
        goalAvg:         n(stat.goals?.total?.average),
        freesForAvg:     n(stat.free_kicks?.for?.average),
        fetchedAt:       new Date().toISOString(),
      });
    } catch (err: any) {
      errors.push(`player ${apiSportsId}: ${err.message}`);
    }
  }

  // Fan out in parallel batches to stay within maxDuration while respecting limits.
  const BATCH = 25;
  for (let i = 0; i < targets.length; i += BATCH) {
    await Promise.all(targets.slice(i, i + BATCH).map(fetchOne));
  }

  if (players.length === 0) {
    return NextResponse.json({ ok: false, error: "No player data fetched", errors }, { status: 502 });
  }

  // Compute avgFoopy per player using the same source as the player profile page:
  // game-stats.json as the primary source, supplemented by match_cache for games
  // not yet committed to the static file (e.g. the most recent round).
  try {
    const dataDir = path.join(process.cwd(), "app", "data");
    const staticStats: Record<string, any> = JSON.parse(
      fs.readFileSync(path.join(dataDir, "game-stats.json"), "utf8")
    );
    const staticIds = new Set(Object.keys(staticStats));

    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const db2 = adminSupabase();
    const [{ data: finalRows }, { data: recentRows }] = await Promise.all([
      db2.from("match_cache").select("game_id, payload").eq("data_type", "player_stats").eq("is_final", true),
      db2.from("match_cache").select("game_id, payload").eq("data_type", "player_stats").eq("is_final", false).gte("fetched_at", yesterdayStr),
    ]);
    const allCacheRows = [
      ...(finalRows ?? []),
      ...(recentRows ?? []).filter(r => !(finalRows ?? []).some((f: any) => String(f.game_id) === String(r.game_id))),
    ];

    // Build a unified game list: static JSON games + match_cache games not already in static
    // This exactly mirrors what the player page does.
    type GameEntry = { teams: { players: { pid: number; s: any }[] }[] };
    const allGames: GameEntry[] = [];

    // 1. Games from game-stats.json
    for (const game of Object.values(staticStats) as any[]) {
      if (!String(game.date ?? "").startsWith(SEASON)) continue;
      const teams = (game.teams ?? []).map((td: any) => ({
        players: (td.players ?? []).map((pe: any) => ({
          pid: Number(pe.player?.id ?? 0),
          s: pe.statistics ?? pe,
        })),
      }));
      allGames.push({ teams });
    }

    // 2. match_cache rows not in game-stats.json
    for (const row of allCacheRows) {
      const gameId = String((row as any).game_id);
      if (staticIds.has(gameId)) continue;
      const payload = (row as any).payload as any;
      const responseItems: any[] = payload?.response ?? [];
      const rawTeams: any[] = responseItems[0]?.teams ?? [];
      if (!rawTeams.length) continue;
      const teams = rawTeams.map((td: any) => ({
        players: (td.players ?? []).map((pe: any) => ({
          pid: Number(pe.player?.id ?? 0),
          s: pe.statistics ?? pe,
        })),
      }));
      allGames.push({ teams });
    }

    // Map: apiSportsPlayerId → { total, games }
    const foopyMap = new Map<number, { total: number; games: number }>();
    for (const game of allGames) {
      for (const teamData of game.teams) {
        for (const { pid, s } of teamData.players) {
          if (!pid) continue;
          const goals      = n(s.goals?.total ?? s.goals);
          const goalAssists = n(s.goals?.assists ?? s.goalAssists ?? 0);
          const behinds    = n(s.behinds);
          const kicks      = n(s.kicks);
          const handballs  = n(s.handballs);
          const marks      = n(s.marks);
          const tackles    = n(s.tackles);
          const hitouts    = n(s.hitouts);
          const disposals  = n(s.disposals) || (kicks + handballs);
          const clearances = n(s.clearances);
          const ff = n(s.freesFor ?? s.free_kicks?.for ?? 0);
          const fa = n(s.freesAgainst ?? s.free_kicks?.against ?? 0);
          if (goals + kicks + handballs + marks + tackles + hitouts + clearances === 0) continue;
          const gf = foopyRating({ goals, goalAssists, behinds, kicks, handballs, marks, tackles, hitouts, disposals, clearances, freesFor: ff, freesAgainst: fa });
          const cur = foopyMap.get(pid) ?? { total: 0, games: 0 };
          cur.total += gf;
          cur.games += 1;
          foopyMap.set(pid, cur);
        }
      }
    }

    for (const player of players) {
      const fd = foopyMap.get(player.apiSportsId);
      if (fd && fd.games > 0) {
        (player as any).avgFoopy = Number((fd.total / fd.games).toFixed(1));
      }
    }
  } catch {}

  // Store combined results in match_cache using a synthetic game_id = 0
  // so /api/player-season-stats can read without re-calling the API
  const db = adminSupabase();
  const { error: upsertErr } = await db
    .from("match_cache")
    .upsert(
      {
        game_id:    "0",
        data_type:  `player_season_${SEASON}`,
        payload:    { players, season: SEASON, generated_at: new Date().toISOString() },
        fetched_at: new Date().toISOString(),
        is_final:   false,
      },
      { onConflict: "game_id,data_type" }
    );

  if (upsertErr) {
    return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, players: players.length, errors });
}
