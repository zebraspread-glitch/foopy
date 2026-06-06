import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { API_SPORTS_MATCH_IDS } from "@/app/data/apiSportsMatchIds";
import { foopyRating } from "@/app/lib/foopyRating";

export const dynamic = "force-dynamic";

export type PlayerRank = {
  id: string;
  name: string;
  team: string;
  totalFoopy: number;
  avgFoopy: number;
  games: number;
};

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/* ── Season rankings: from player-season-stats.json ── */
function buildSeasonRankings(seasonStats: {
  id: string; name: string; team: string; games?: number; goals?: number; goalAssists?: number;
  behinds?: number; totalKicks?: number; totalHandballs?: number; totalMarks?: number;
  totalTackles?: number; totalHitouts?: number; totalClearances?: number;
  freesFor?: number; freesAgainst?: number; disposals?: number; kicks?: number;
  handballs?: number; marks?: number; tackles?: number; hitouts?: number;
  clearances?: number; goalAvg?: number;
}[]): PlayerRank[] {
  const result: PlayerRank[] = [];
  for (const p of seasonStats) {
    const games = num(p.games);
    if (games === 0) continue;
    const avgGoals       = num(p.goalAvg  ?? (num(p.goals) / games));
    const avgGoalAssists = num(p.goalAssists) / games;
    const avgBehinds     = num(p.behinds) / games;
    const avgKicks       = num(p.kicks    ?? (num(p.totalKicks)      / games));
    const avgHandballs   = num(p.handballs ?? (num(p.totalHandballs) / games));
    const avgMarks       = num(p.marks    ?? (num(p.totalMarks)      / games));
    const avgTackles     = num(p.tackles  ?? (num(p.totalTackles)    / games));
    const avgHitouts     = num(p.hitouts  ?? (num(p.totalHitouts)    / games));
    const avgDisposals   = num(p.disposals ?? 0);
    const avgClearances  = num(p.clearances ?? (num(p.totalClearances) / games));
    const avgFreesFor    = num(p.freesFor)    / games;
    const avgFreesAgainst = num(p.freesAgainst) / games;

    const avgFoopy = foopyRating({
      goals: avgGoals, goalAssists: avgGoalAssists, behinds: avgBehinds,
      kicks: avgKicks, handballs: avgHandballs, marks: avgMarks,
      tackles: avgTackles, hitouts: avgHitouts, disposals: avgDisposals,
      clearances: avgClearances, freesFor: avgFreesFor, freesAgainst: avgFreesAgainst,
    });
    if (avgFoopy === 0) continue;

    result.push({
      id:         p.id,
      name:       p.name,
      team:       p.team ?? "",
      avgFoopy:   Number(avgFoopy.toFixed(1)),
      // totalFoopy = accumulated season power (avg × games)
      totalFoopy: Number((avgFoopy * games).toFixed(1)),
      games,
    });
  }
  // Season: rank by total accumulated foopy
  return result.sort((a, b) => b.totalFoopy - a.totalFoopy);
}

type GameStats = Record<string, {
  gameId: number;
  date: string;
  teams: {
    team: { id: number };
    players: {
      player: { id: number; number: number };
      goals: { total: number; assists: number };
      behinds: number; disposals: number; kicks: number; handballs: number;
      marks: number; tackles: number; hitouts: number; clearances: number;
      free_kicks: { for: number; against: number };
    }[];
  }[];
}>;

/**
 * Group all game dates in game-stats.json into "rounds" by proximity.
 * AFL games within a round are played over ~4 days (Thu–Sun).
 * A gap > 3 days between consecutive game dates = new round.
 *
 * Returns a map of YYYY-MM-DD → round group number, where 1 = most recent round.
 */
function buildDateRoundMap(gameStats: GameStats): { map: Map<string, number>; totalRounds: number } {
  // Collect all unique game dates and sort newest → oldest
  const uniqueDates = [...new Set(
    Object.values(gameStats)
      .map(g => (g.date ?? "").slice(0, 10))
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
  )].sort().reverse(); // newest first

  if (!uniqueDates.length) return { map: new Map(), totalRounds: 0 };

  const map = new Map<string, number>();
  let roundGroup = 1;

  for (let i = 0; i < uniqueDates.length; i++) {
    if (i > 0) {
      const prevMs = new Date(uniqueDates[i - 1]).getTime();
      const currMs = new Date(uniqueDates[i]).getTime();
      // Gap > 3 days between consecutive game dates means a new (older) round
      if (prevMs - currMs > 3 * 86_400_000) {
        roundGroup++;
      }
    }
    map.set(uniqueDates[i], roundGroup);
  }

  return { map, totalRounds: roundGroup };
}

/**
 * Build player rankings from the last `lastNRounds` round groups.
 * Round group 1 = most recent round, 2 = second most recent, etc.
 * Sorts by avgFoopy so the score stays on the familiar 0–10 scale.
 */
function buildRoundRankings(
  gameStats: GameStats,
  playerLookup: Map<number, { id: string; name: string; team: string }>,
  dateRoundMap: Map<string, number>,
  lastNRounds: number
): PlayerRank[] {
  const totals = new Map<string, { id: string; name: string; team: string; totalFoopy: number; games: number }>();

  for (const game of Object.values(gameStats)) {
    const dateKey = (game.date ?? "").slice(0, 10);
    const roundGroup = dateRoundMap.get(dateKey);

    // Skip games outside the requested round window
    if (roundGroup === undefined || roundGroup > lastNRounds) continue;

    for (const teamData of game.teams ?? []) {
      for (const ps of teamData.players ?? []) {
        const info = playerLookup.get(ps.player?.id);
        if (!info) continue;

        const gf = foopyRating({
          goals:        num(ps.goals?.total),
          goalAssists:  num(ps.goals?.assists),
          behinds:      num(ps.behinds),
          kicks:        num(ps.kicks),
          handballs:    num(ps.handballs),
          marks:        num(ps.marks),
          tackles:      num(ps.tackles),
          hitouts:      num(ps.hitouts),
          disposals:    num(ps.disposals),
          clearances:   num(ps.clearances),
          freesFor:     num(ps.free_kicks?.for),
          freesAgainst: num(ps.free_kicks?.against),
        });
        if (gf === 0) continue;

        const key = `${info.name}||${info.team}`;
        const cur = totals.get(key) ?? { id: info.id, name: info.name, team: info.team, totalFoopy: 0, games: 0 };
        cur.totalFoopy += gf;
        cur.games      += 1;
        totals.set(key, cur);
      }
    }
  }

  return [...totals.values()]
    .filter(p => p.totalFoopy > 0)
    .map(p => ({
      id:         p.id,
      name:       p.name,
      team:       p.team,
      totalFoopy: Number(p.totalFoopy.toFixed(1)),
      avgFoopy:   Number((p.totalFoopy / p.games).toFixed(1)),
      games:      p.games,
    }))
    .sort((a, b) => b.totalFoopy - a.totalFoopy);
}

export async function GET() {
  const year = new Date().getFullYear();

  const [seasonMod, gameStatsMod, playersMod] = await Promise.all([
    import("@/app/data/player-season-stats.json"),
    import("@/app/data/game-stats.json"),
    import("@/app/data/players.json"),
  ]);

  // Build apiSportsId → date map via Squiggle (the payload from match_cache doesn't include dates)
  const apiSportsDateMap = new Map<string, string>(); // apiSportsId → YYYY-MM-DD
  try {
    // Reverse the API_SPORTS_MATCH_IDS map: squiggleId → apiSportsId
    const bySquiggle = Object.fromEntries(
      Object.entries(API_SPORTS_MATCH_IDS as Record<string, string>)
    ); // squiggleId → apiSportsId

    const sq = await fetch(`https://api.squiggle.com.au/?q=games;year=${year}`, {
      headers: { "User-Agent": "Foopy AFL App" },
      next: { revalidate: 600 }, // cache for 10 min
    });
    if (sq.ok) {
      const sqData = await sq.json();
      for (const g of sqData.games ?? sqData ?? []) {
        const apiId = bySquiggle[String(g.id)];
        if (apiId && g.date) apiSportsDateMap.set(apiId, String(g.date).slice(0, 10));
      }
    }
  } catch {}

  // Start with the static game-stats.json and supplement with recent match_cache
  // entries so the current round is always included in rankings.
  const gameStats: GameStats = { ...(gameStatsMod.default as GameStats) };
  const staticIds = new Set(Object.keys(gameStats));

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const yesterdayStr = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

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
      if (staticIds.has(gameId)) continue; // already covered by static JSON
      const payload = row.payload as any;
      const responseItems: any[] = payload?.response ?? [];
      const rawTeams: any[] = responseItems[0]?.teams ?? [];
      if (!rawTeams.length) continue;

      // Payload rarely includes a date — fall back to the Squiggle-derived map
      const date = (responseItems[0]?.game?.date ?? "").slice(0, 10)
        || apiSportsDateMap.get(gameId)
        || "";
      if (!date) continue;

      // Normalise match_cache format (stats under .statistics) to the same
      // flat shape that game-stats.json uses so buildRoundRankings can read it.
      const teams = rawTeams.map((td: any) => ({
        team: td.team,
        players: (td.players ?? []).map((pe: any) => {
          const s = pe.statistics ?? pe;
          return {
            player: pe.player,
            goals: { total: num(s.goals?.total ?? s.goals), assists: num(s.goals?.assists ?? s.goalAssists ?? 0) },
            behinds:    num(s.behinds),
            disposals:  num(s.disposals) || (num(s.kicks) + num(s.handballs)),
            kicks:      num(s.kicks),
            handballs:  num(s.handballs),
            marks:      num(s.marks),
            tackles:    num(s.tackles),
            hitouts:    num(s.hitouts),
            clearances: num(s.clearances),
            free_kicks: {
              for:     num(s.freesFor     ?? s.free_kicks?.for     ?? 0),
              against: num(s.freesAgainst ?? s.free_kicks?.against ?? 0),
            },
          };
        }),
      }));

      gameStats[gameId] = { gameId: Number(gameId), date, teams };
    }
  } catch { /* fall back to static data only */ }

  // Build player API-Sports ID → {id, name, team} lookup
  const playerLookup = new Map<number, { id: string; name: string; team: string }>();
  for (const p of playersMod.default as { id: string; name: string; team: string; apiSportsId?: number | null }[]) {
    if (p.apiSportsId) playerLookup.set(Number(p.apiSportsId), { id: p.id, name: p.name, team: p.team ?? "" });
  }

  // Build round-group map from ALL games (static + recent Supabase)
  const { map: dateRoundMap } = buildDateRoundMap(gameStats);

  const season = buildSeasonRankings(seasonMod.default as Parameters<typeof buildSeasonRankings>[0]);
  const r1 = buildRoundRankings(gameStats, playerLookup, dateRoundMap, 1);
  const r3 = buildRoundRankings(gameStats, playerLookup, dateRoundMap, 3);
  const r5 = buildRoundRankings(gameStats, playerLookup, dateRoundMap, 5);

  return NextResponse.json({ r1, r3, r5, season });
}
