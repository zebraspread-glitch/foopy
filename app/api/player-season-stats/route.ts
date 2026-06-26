import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { foopyRating } from "@/app/lib/foopyRating";
import { computeAvgFoopyMap } from "@/app/lib/computeAvgFoopy.server";
import { applyStatCorrections } from "@/app/data/statCorrections";

export const dynamic = "force-dynamic";

const SEASON = new Date().getFullYear().toString();

function n(v: any) {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
}

// Try the Supabase cache written by the hourly sync-player-season-stats cron.
// Returns the cached array if it's less than 90 minutes old, else null.
async function getCachedSeasonStats(): Promise<any[] | null> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data } = await supabase
      .from("match_cache")
      .select("payload, fetched_at")
      .or(`game_id.eq.0,game_id.eq."0"`)
      .eq("data_type", `player_season_${SEASON}`)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data?.payload) return null;
    const ageMins = (Date.now() - new Date(data.fetched_at).getTime()) / 60000;
    if (ageMins > 90) return null;
    const players = (data.payload as any).players;
    return Array.isArray(players) && players.length > 0 ? players : null;
  } catch {
    return null;
  }
}

// API-Sports team ID → display name
const TEAM_BY_ID: Record<number, string> = {
  1:"Adelaide",2:"Brisbane",3:"Carlton",4:"Collingwood",
  5:"Essendon",6:"Fremantle",7:"Geelong",8:"Hawthorn",
  9:"Melbourne",10:"North Melbourne",11:"Port Adelaide",12:"Richmond",
  13:"St Kilda",14:"Sydney",15:"West Coast",16:"Western Bulldogs",
  17:"Gold Coast",18:"GWS",
};

export async function GET() {
  const dataDir = path.join(process.cwd(), "app", "data");

  // Run avgFoopy computation in parallel with season stats fetch — same data
  // sources as the player profile page, so both surfaces always match.
  const [avgFoopyMap, cached] = await Promise.all([
    computeAvgFoopyMap(),
    getCachedSeasonStats(),
  ]);

  function injectAvgFoopy(players: any[]): any[] {
    const withFoopy = players.map(p => {
      const id = Number(p.apiSportsId);
      const avg = id ? avgFoopyMap.get(id) : undefined;
      return avg !== undefined ? { ...p, avgFoopy: avg } : p;
    });
    // Manual overrides (e.g. goal totals API-Sports undercounts) always win.
    return applyStatCorrections(withFoopy);
  }

  // 1. Supabase cache (written by hourly cron)
  if (cached) {
    return NextResponse.json(injectAvgFoopy(cached), {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" },
    });
  }

  // 2. Static player-season-stats.json
  try {
    const staticPlayers = JSON.parse(
      fs.readFileSync(path.join(dataDir, "player-season-stats.json"), "utf8")
    );
    return NextResponse.json(injectAvgFoopy(staticPlayers), {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  } catch {}

  // 3. Last resort: per-game aggregation from game-stats.json
  console.warn("[player-season-stats] falling back to per-game aggregation");

  const staticStats: Record<string, any> = JSON.parse(
    fs.readFileSync(path.join(dataDir, "game-stats.json"), "utf8")
  );
  const playersArr: any[] = JSON.parse(
    fs.readFileSync(path.join(dataDir, "players.json"), "utf8")
  );
  const playerById = new Map<number, { id: string; name: string; team: string }>();
  for (const p of playersArr) {
    if (p.apiSportsId) playerById.set(Number(p.apiSportsId), { id: p.id, name: p.name, team: p.team });
  }

  // Supplement static JSON with match_cache for recent games
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const staticIds = new Set(Object.keys(staticStats));

    const [{ data: finalRows }, { data: recentRows }] = await Promise.all([
      supabase.from("match_cache").select("game_id, payload").eq("data_type", "player_stats").eq("is_final", true),
      supabase.from("match_cache").select("game_id, payload").eq("data_type", "player_stats").eq("is_final", false).gte("fetched_at", yesterdayStr),
    ]);

    const allRows = [
      ...(finalRows ?? []),
      ...(recentRows ?? []).filter(r => !(finalRows ?? []).some(f => String(f.game_id) === String(r.game_id))),
    ];

    for (const row of allRows) {
      const gameId = String(row.game_id);
      if (!/^\d+$/.test(gameId) || staticIds.has(gameId)) continue;
      const payload = row.payload as any;
      const responseItems: any[] = payload?.response ?? [];
      const teams = responseItems[0]?.teams ?? [];
      if (!teams.length) continue;
      const date = responseItems[0]?.game?.date?.slice(0, 10) ?? "";
      staticStats[gameId] = { gameId: Number(gameId), date, teams };
    }
  } catch {}

  type Agg = {
    id: string; name: string; team: string;
    games: number; goals: number; goalAssists: number; behinds: number;
    kicks: number; handballs: number; marks: number;
    tackles: number; hitouts: number; clearances: number;
    freesFor: number; freesAgainst: number;
  };
  const aggs = new Map<number, Agg>();

  for (const game of Object.values(staticStats) as any[]) {
    if (!String(game.date ?? "").startsWith(SEASON)) continue;
    for (const teamData of game.teams ?? []) {
      const teamName = teamData.team?.name ?? TEAM_BY_ID[Number(teamData.team?.id)] ?? "";
      for (const pe of teamData.players ?? []) {
        const pid = Number(pe.player?.id ?? 0);
        if (!pid) continue;
        const s = pe.statistics ?? pe;
        const goals     = n(s.goals?.total ?? s.goals);
        const assists   = n(s.goals?.assists ?? s.goalAssists ?? 0);
        const behinds   = n(s.behinds);
        const kicks     = n(s.kicks);
        const handballs = n(s.handballs);
        const marks     = n(s.marks);
        const tackles   = n(s.tackles);
        const hitouts   = n(s.hitouts);
        const clears    = n(s.clearances);
        const ff        = n(s.freesFor ?? s.free_kicks?.for ?? 0);
        const fa        = n(s.freesAgainst ?? s.free_kicks?.against ?? 0);
        if (goals + kicks + handballs + marks + tackles + hitouts + clears === 0) continue;
        if (!aggs.has(pid)) {
          const info = playerById.get(pid);
          aggs.set(pid, {
            id: info?.id ?? `player_${pid}`, name: pe.player?.name ?? info?.name ?? "",
            team: info?.team || teamName,
            games: 0, goals: 0, goalAssists: 0, behinds: 0,
            kicks: 0, handballs: 0, marks: 0, tackles: 0, hitouts: 0, clearances: 0,
            freesFor: 0, freesAgainst: 0,
          });
        }
        const agg = aggs.get(pid)!;
        if (!agg.name && pe.player?.name) agg.name = pe.player.name;
        if (!agg.team && teamName) agg.team = teamName;
        agg.games++; agg.goals += goals; agg.goalAssists += assists;
        agg.behinds += behinds; agg.kicks += kicks; agg.handballs += handballs;
        agg.marks += marks; agg.tackles += tackles; agg.hitouts += hitouts;
        agg.clearances += clears; agg.freesFor += ff; agg.freesAgainst += fa;
      }
    }
  }

  const results: any[] = [];
  for (const [apiId, agg] of aggs.entries()) {
    if (!agg.name || !agg.team || agg.games === 0) continue;
    const g = agg.games;
    const totalDisposals = agg.kicks + agg.handballs;
    results.push({
      id: agg.id, name: agg.name, team: agg.team, apiSportsId: apiId,
      photoUrl: null, jerseyNumber: null, position: null,
      games: g, goals: agg.goals, goalAssists: agg.goalAssists, behinds: agg.behinds,
      totalDisposals, totalKicks: agg.kicks, totalHandballs: agg.handballs,
      totalMarks: agg.marks, totalTackles: agg.tackles, totalHitouts: agg.hitouts,
      totalClearances: agg.clearances, freesFor: agg.freesFor, freesAgainst: agg.freesAgainst,
      disposals: totalDisposals / g, kicks: agg.kicks / g, handballs: agg.handballs / g,
      marks: agg.marks / g, tackles: agg.tackles / g, hitouts: agg.hitouts / g,
      clearances: agg.clearances / g, goalAvg: agg.goals / g,
      freesForAvg: agg.freesFor / g,
      avgFoopy: avgFoopyMap.get(apiId) ?? null,
      fetchedAt: new Date().toISOString(),
    });
  }

  return NextResponse.json(applyStatCorrections(results), {
    headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=600" },
  });
}
